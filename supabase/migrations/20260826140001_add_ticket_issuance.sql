-- Phase 6: ticket PDF issuance. Tokens are generated in Node (HMAC secret is
-- server-env-only per docs/ARCHITECTURE.md #4/#5, never stored in Postgres) and
-- passed in as plain text; this function's job is only the authorized, audited
-- write - the same "validate + write + audit atomically" shape as every other
-- mutation function in 20260826100014_create_admin_mutation_functions.sql.

alter table public.tickets add column pdf_path text;
comment on column public.tickets.pdf_path is
  'Path in the private "tickets" Storage bucket to this ticket''s generated PDF, set at issuance time.';

alter table public.orders add column files_handed_over_at timestamptz;
comment on column public.orders.files_handed_over_at is
  'Manual marker: when an admin confirms the ticket PDFs were handed to the customer outside this app (no email is ever sent by the app itself).';

create or replace function public.issue_tickets_for_order(p_order_id uuid, p_tickets jsonb)
returns setof public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_ticket jsonb;
  v_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'only admins can issue tickets';
  end if;

  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if v_status <> 'bezahlt' then
    raise exception 'order % is not marked as bezahlt (status: %)', p_order_id, v_status;
  end if;

  if exists (
    select 1 from public.tickets t
    join public.order_items oi on oi.id = t.order_item_id
    where oi.order_id = p_order_id
  ) then
    raise exception 'tickets have already been issued for order %', p_order_id;
  end if;

  for v_ticket in select * from jsonb_array_elements(p_tickets)
  loop
    if not exists (
      select 1 from public.order_items where id = (v_ticket->>'order_item_id')::uuid and order_id = p_order_id
    ) then
      raise exception 'order_item % does not belong to order %', v_ticket->>'order_item_id', p_order_id;
    end if;

    insert into public.tickets (id, order_item_id, product_id, season, holder_name, transferable, token, pdf_path)
    values (
      (v_ticket->>'id')::uuid,
      (v_ticket->>'order_item_id')::uuid,
      (v_ticket->>'product_id')::uuid,
      v_ticket->>'season',
      nullif(v_ticket->>'holder_name', ''),
      (v_ticket->>'transferable')::boolean,
      v_ticket->>'token',
      v_ticket->>'pdf_path'
    );

    v_ids := array_append(v_ids, (v_ticket->>'id')::uuid);

    insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id)
    values ('ticket', (v_ticket->>'id')::uuid, 'issued', 'admin', auth.uid());
  end loop;

  return query select * from public.tickets where id = any(v_ids);
end;
$$;

revoke execute on function public.issue_tickets_for_order(uuid, jsonb) from public, anon;
grant execute on function public.issue_tickets_for_order(uuid, jsonb) to authenticated;

-- Manual "handed over" marker (D-none-yet, docs/ARCHITECTURE.md admin order detail
-- view): purely an admin acknowledgment, never set automatically - there is no email
-- send to hook this to.
create or replace function public.set_files_handed_over(p_order_id uuid, p_handed_over boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old timestamptz;
  v_new timestamptz;
begin
  if not public.is_admin() then
    raise exception 'only admins can change the files-handed-over marker';
  end if;

  select files_handed_over_at into v_old from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  v_new := case when p_handed_over then now() else null end;
  update public.orders set files_handed_over_at = v_new where id = p_order_id;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
  values ('order', p_order_id, 'files_handed_over_change', 'files_handed_over_at', v_old::text, v_new::text, 'admin', auth.uid());
end;
$$;

revoke execute on function public.set_files_handed_over(uuid, boolean) from public, anon;
grant execute on function public.set_files_handed_over(uuid, boolean) to authenticated;

-- Private bucket for generated ticket PDFs. Never public - admins download through
-- an authenticated route, customers never get a direct link (D23: no customer login
-- exists, so there is no safe direct-access path for this either).
insert into storage.buckets (id, name, public)
values ('tickets', 'tickets', false)
on conflict (id) do nothing;

create policy "Admins can read ticket files"
  on storage.objects for select
  using (bucket_id = 'tickets' and public.is_admin());

create policy "Admins can upload ticket files"
  on storage.objects for insert
  with check (bucket_id = 'tickets' and public.is_admin());
