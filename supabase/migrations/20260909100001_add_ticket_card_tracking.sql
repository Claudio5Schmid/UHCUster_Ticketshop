-- Cards become individually manageable: each one can be created, deactivated,
-- regenerated after a loss, and tracked as sent on its own. Three facts the
-- schema could not express until now, all additive - nothing reads these
-- columns until the application code lands alongside migration B.

-- 1. tickets.order_id
--
-- A ticket only knew its order_item_id, so "the tickets of this order" always
-- meant a join. That is fine for reading, but the running number below has to
-- be unique per ORDER: a shop order with two transferable line items would
-- otherwise restart at 1 in the second item and print two "übertragbar-1"
-- cards for the same customer.
alter table public.tickets add column order_id uuid references public.orders (id) on delete restrict;

update public.tickets t
   set order_id = oi.order_id
  from public.order_items oi
 where oi.id = t.order_item_id;

-- order_items.order_id is itself NOT NULL and the only paths that insert
-- tickets are the security-definer functions replaced in migration B, none of
-- which run while this migration holds its transaction - so no row escapes.
alter table public.tickets alter column order_id set not null;

create index tickets_order_id_idx on public.tickets (order_id);

comment on column public.tickets.order_id is
  'Denormalised from order_items, so per-order rules (notably transferable_index) do not depend on a join.';

-- 2. tickets.transferable_index
--
-- The visible running number: "Mitglieder UHC Uster (übertragbar-2)". Personal
-- cards deliberately carry none - they are told apart by the name printed on
-- them, which is the whole point of a personal card.
alter table public.tickets add column transferable_index integer;

alter table public.tickets
  add constraint tickets_transferable_index_positive
    check (transferable_index is null or transferable_index >= 1),
  add constraint tickets_transferable_index_needs_transferable
    check (transferable or transferable_index is null);

update public.tickets t
   set transferable_index = n.idx
  from (
    select id, row_number() over (partition by order_id order by issued_at, id) as idx
      from public.tickets
     where transferable
  ) n
 where n.id = t.id;

-- 'storniert' keeps holding its number on purpose, and only 'ersetzt' releases
-- it. A deactivated card must not hand its number to a newly created one - that
-- would put two different QR codes behind "übertragbar-2" in the same order -
-- whereas a regenerated card is *the same card again* and inherits it.
create unique index tickets_transferable_index_per_order
  on public.tickets (order_id, transferable_index)
  where transferable_index is not null and status <> 'ersetzt';

comment on column public.tickets.transferable_index is
  'Per-order running number for transferable cards (übertragbar-1, -2, ...). A regenerated card inherits the number of the one it replaces; a voided card keeps holding its own.';

-- 3. tickets.card_sent_at
--
-- Sending was tracked as members.cards_sent_at - one timestamp for a whole
-- member. That could not say "two sent, two still open", so the moment a card
-- is added after the first send, the member-level stamp is simply wrong.
alter table public.tickets add column card_sent_at timestamptz;

update public.tickets t
   set card_sent_at = m.cards_sent_at
  from public.members m
 where t.order_id = m.order_id
   and m.cards_sent_at is not null;

comment on column public.tickets.card_sent_at is
  'When this card was e-mailed to its member. Null for shop tickets, which are never sent as attachments.';

-- members.cards_sent_at stays for now, still written on every send, so a
-- rollback of the application code lands on data it understands. Everything
-- *reads* tickets.card_sent_at from here on; a later migration drops it.
comment on column public.members.cards_sent_at is
  'Deprecated - superseded by tickets.card_sent_at, which tracks each card separately. Still written on send until the column is dropped.';

-- 4. members.personal_card_count
--
-- The creation mask asks how many of each kind are needed, so the boolean it
-- used to write cannot record the answer.
alter table public.members add column personal_card_count integer not null default 0
  check (personal_card_count >= 0);

update public.members set personal_card_count = case when mitgliederkarte then 1 else 0 end;

comment on column public.members.personal_card_count is
  'How many personal cards this member was created with. Like transferable_code_count, a record of the creation request - the cards themselves live in tickets.';

-- 5. mark_tickets_sent
--
-- tickets has no UPDATE policy for anyone (see 20260826100011): every write
-- goes through a security-definer function, and marking cards as sent is no
-- exception. Only flips cards that are still unsent, so a partially failed
-- send can be repeated without back-dating what already went out.
create or replace function public.mark_tickets_sent(p_ticket_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_updated uuid[];
begin
  if not public.is_admin() then
    raise exception 'only admins can mark tickets as sent';
  end if;

  with updated as (
    update public.tickets
       set card_sent_at = now()
     where id = any(p_ticket_ids)
       and card_sent_at is null
    returning id
  )
  select array_agg(id) into v_updated from updated;

  foreach v_id in array coalesce(v_updated, '{}'::uuid[])
  loop
    insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id)
    values ('ticket', v_id, 'card_sent', 'admin', auth.uid());
  end loop;
end;
$$;

revoke execute on function public.mark_tickets_sent(uuid[]) from public, anon;
grant execute on function public.mark_tickets_sent(uuid[]) to authenticated;
