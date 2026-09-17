-- Delivery, not acceptance.
--
-- Everything the shop knows about a sent mail came from the provider saying
-- "accepted": sendEmail() returned true and the order was marked informed, the
-- card marked sent. A message the provider later bounces leaves those marks
-- standing, so the office reads "versendet" for a customer who never got
-- anything - which is what happened on the first real send (96 of 99 through,
-- three bounced, all three still green in the shop).
--
-- The provider knows the outcome and says so over a webhook. This table is what
-- the webhook can find a mail by, and the function below is what carries the
-- outcome back into the rows the office actually reads.

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  -- Resend's own id for the message, and the only thing a webhook event carries
  -- that ties it to anything of ours.
  provider_message_id text unique,
  kind text not null check (kind in ('order_confirmation', 'order_notification', 'order_info', 'member_cards', 'test')),
  recipient text not null,
  subject text,
  order_id uuid references public.orders (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  -- The cards this mail carried, so a bounce can reopen exactly those and not a
  -- member's whole set.
  ticket_ids uuid[] not null default '{}',
  status text not null default 'accepted'
    check (status in ('accepted', 'delivered', 'delayed', 'bounced', 'complained', 'failed')),
  status_detail text,
  sent_at timestamptz not null default now(),
  status_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.email_messages enable row level security;

create index email_messages_order_id_idx on public.email_messages (order_id);
create index email_messages_member_id_idx on public.email_messages (member_id);
create index email_messages_status_idx on public.email_messages (status);
create index email_messages_sent_at_idx on public.email_messages (sent_at desc);

create trigger set_email_messages_updated_at
  before update on public.email_messages
  for each row
  execute function public.set_updated_at();

create policy "Admins can view email messages"
  on public.email_messages for select
  to authenticated
  using (public.is_admin());

comment on table public.email_messages is
  'One row per mail handed to the provider, with the provider''s message id and the delivery outcome it reported afterwards. Written by the send paths and by /api/webhooks/resend, both service-role; admins read it. No insert/update policy for anyone, like orders and tickets.';

/**
 * The outcome of one message, carried into everything that reads as "sent".
 *
 * System-only: no grant to anon or authenticated. The webhook route verifies the
 * provider's signature itself and then calls this through the service-role
 * client - the same shape as the scanner routes and create_order().
 *
 * Returns false when the id belongs to no message we recorded (a mail sent
 * before this existed, or a test mail), so the route can answer 200 and let the
 * provider stop retrying rather than failing on an event that is simply not ours.
 */
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
         status_detail = nullif(trim(coalesce(p_detail, '')), ''),
         status_at = p_occurred_at
   where id = v_message.id;

  if p_status not in ('bounced', 'complained', 'failed') then
    return true;
  end if;

  -- From here on the mail did not arrive. Everything it marked as done goes back
  -- to open, so the office sees work rather than a green tick.

  -- The cards this mail carried are to send again.
  foreach v_ticket_id in array v_message.ticket_ids
  loop
    update public.tickets set card_sent_at = null where id = v_ticket_id and card_sent_at is not null;
    if found then
      insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, note)
      values ('ticket', v_ticket_id, 'card_send_failed', 'card_sent_at', 'gesetzt', null, 'system',
              concat_ws(': ', p_status, nullif(trim(coalesce(p_detail, '')), '')));
    end if;
  end loop;

  if v_message.order_id is not null then
    if v_message.kind = 'order_confirmation' then
      update public.orders set confirmation_email_sent_at = null where id = v_message.order_id;
    else
      update public.orders
         set notification_status = 'fehlgeschlagen',
             notification_error = concat_ws(': ', p_status, nullif(trim(coalesce(p_detail, '')), ''))
       where id = v_message.order_id;
    end if;

    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, note)
    values ('order', v_message.order_id, 'email_status', 'status', v_message.status, p_status, 'system',
            concat_ws(' ', v_message.kind, 'an', v_message.recipient, nullif(trim(coalesce(p_detail, '')), '')));
  end if;

  return true;
end;
$$;

revoke execute on function public.record_email_status(text, text, text, timestamptz) from public, anon, authenticated;
