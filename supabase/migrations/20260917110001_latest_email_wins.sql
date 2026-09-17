-- The newest mail decides the status, and only the kind of mail that is
-- actually about the customer may change it.
--
-- Two faults in the first version, both of which the question "every resend
-- gets a new id - what happens to the status then?" walks straight into.
--
-- 1. An outcome for an old message walked over a newer one. The mail bounces,
--    the office corrects the address and sends again, the second one arrives -
--    and only then does the first one's bounce turn up, because providers
--    report minutes to hours late and a hard bounce can take a day. The order
--    fell back to "fehlgeschlagen" and the cards it carried back to unsent,
--    although the customer was holding them. Now an outcome only reaches the
--    order if its message is still the newest one sent to that recipient;
--    otherwise it is kept on the message row and goes no further, because it
--    is history.
--
-- 2. A bounced *internal* mail - the note to the office that an invoice is due -
--    set the customer's notification status to failed. That the treasurer's
--    mailbox refused something says nothing about whether the customer was
--    reached. Each kind of mail now only touches what it is about.
--
-- And the direction that was missing entirely: a delivery writes the positive
-- state too, so an order whose send-time write did not land still ends up
-- correct once the provider confirms.

create or replace function public.record_email_status(
  p_message_id text,
  p_status text,
  p_detail text default null,
  p_occurred_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.email_messages%rowtype;
  v_ticket_id uuid;
  v_superseded boolean;
  v_detail text := nullif(trim(coalesce(p_detail, '')), '');
  v_failed boolean;
begin
  if p_status not in ('accepted', 'delivered', 'delayed', 'bounced', 'complained', 'failed') then
    raise exception 'invalid delivery status %', p_status;
  end if;

  select * into v_message from public.email_messages where provider_message_id = p_message_id for update;
  if not found then
    return false;
  end if;

  -- Events can overtake each other; "delivered" after a bounce would be a lie,
  -- and a second "sent" after "delivered" would walk the status backwards.
  if v_message.status in ('bounced', 'complained', 'failed') and p_status <> 'failed' then
    return true;
  end if;
  if v_message.status = 'delivered' and p_status in ('accepted', 'delayed') then
    return true;
  end if;

  update public.email_messages
     set status = p_status,
         status_detail = v_detail,
         status_at = p_occurred_at
   where id = v_message.id;

  -- Still on its way, or merely late: there is nothing to carry over yet.
  if p_status in ('accepted', 'delayed') then
    return true;
  end if;

  -- A test mail and the internal note to the office say nothing about whether
  -- the customer was reached, so neither may move the customer's status.
  if v_message.order_id is null or v_message.kind in ('order_notification', 'test') then
    return true;
  end if;

  -- Is this still the newest mail of its kind to this recipient? A member's
  -- mails are counted per member rather than per order, so that one member's
  -- later send can never pass for another's even if they ever share an order.
  select exists (
    select 1
      from public.email_messages m
     where m.kind = v_message.kind
       and (
         case when v_message.member_id is not null
              then m.member_id = v_message.member_id
              else m.order_id = v_message.order_id and m.member_id is null
         end
       )
       and (m.sent_at, m.id) > (v_message.sent_at, v_message.id)
  ) into v_superseded;

  -- Superseded: the outcome stays on its own message for the record, but the
  -- order's state belongs to the mail that went out after it.
  if v_superseded then
    return true;
  end if;

  v_failed := p_status in ('bounced', 'complained', 'failed');

  if v_message.kind = 'order_confirmation' then
    update public.orders
       set confirmation_email_sent_at = case
             when v_failed then null
             else coalesce(confirmation_email_sent_at, p_occurred_at)
           end
     where id = v_message.order_id;
  else
    -- order_info and member_cards: the mail that carries the cards.
    update public.orders
       set notification_status = case when v_failed then 'fehlgeschlagen' else 'versendet' end,
           notified_at = case when v_failed then notified_at else coalesce(notified_at, p_occurred_at) end,
           notification_error = case when v_failed then concat_ws(': ', p_status, v_detail) else null end
     where id = v_message.order_id;

    -- A card goes back to unsent only when the mail carrying it failed.
    if v_failed then
      foreach v_ticket_id in array v_message.ticket_ids
      loop
        update public.tickets set card_sent_at = null where id = v_ticket_id and card_sent_at is not null;
        if found then
          insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, note)
          values ('ticket', v_ticket_id, 'card_send_failed', 'card_sent_at', 'gesetzt', null, 'system',
                  concat_ws(': ', p_status, v_detail));
        end if;
      end loop;
    end if;
  end if;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, note)
  values ('order', v_message.order_id, 'email_status', 'status', v_message.status, p_status, 'system',
          concat_ws(' ', v_message.kind, 'an', v_message.recipient, v_detail));

  return true;
end;
$$;

revoke execute on function public.record_email_status(text, text, text, timestamptz) from public, anon, authenticated;

-- The supersede check walks the mails of one recipient, which without this is a
-- scan of the whole table on every event.
create index if not exists email_messages_member_kind_sent_idx
  on public.email_messages (member_id, kind, sent_at desc)
  where member_id is not null;

create index if not exists email_messages_order_kind_sent_idx
  on public.email_messages (order_id, kind, sent_at desc)
  where order_id is not null;
