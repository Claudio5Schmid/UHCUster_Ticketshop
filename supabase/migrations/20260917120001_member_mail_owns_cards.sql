-- A member's mail answers for their cards, not for the order's "Kundeninfo".
--
-- The member send never writes orders.notification_status on the way in - it
-- marks the cards (tickets.card_sent_at) and the member (members.cards_sent_at).
-- Having a bounce write notification_status on the way out was asymmetric, and
-- it would have quietly rewritten that column for the club's 556 member orders
-- the moment the history was backfilled. The column belongs to the manual order
-- mailing; the member's state belongs to their cards.
--
-- So each kind of mail now answers for exactly what its send path set:
--   order_info          -> orders.notification_status + the cards it carried
--   member_cards        -> the cards it carried + members.cards_sent_at
--   order_confirmation  -> orders.confirmation_email_sent_at
--   order_notification  -> nothing (it goes to the office, not the customer)
--   test                -> nothing

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
  -- state belongs to the mail that went out after it.
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
    -- order_info and member_cards both carry cards, and a card goes back to
    -- unsent only when the mail carrying it failed.
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

    if v_message.member_id is not null then
      -- The member's own marker follows their cards.
      update public.members
         set cards_sent_at = case when v_failed then null else coalesce(cards_sent_at, p_occurred_at) end
       where id = v_message.member_id;
    else
      update public.orders
         set notification_status = case when v_failed then 'fehlgeschlagen' else 'versendet' end,
             notified_at = case when v_failed then notified_at else coalesce(notified_at, p_occurred_at) end,
             notification_error = case when v_failed then concat_ws(': ', p_status, v_detail) else null end
       where id = v_message.order_id;
    end if;
  end if;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, note)
  values ('order', v_message.order_id, 'email_status', 'status', v_message.status, p_status, 'system',
          concat_ws(' ', v_message.kind, 'an', v_message.recipient, v_detail));

  return true;
end;
$$;

revoke execute on function public.record_email_status(text, text, text, timestamptz) from public, anon, authenticated;
