-- "Void a single ticket, no replacement" (docs/BACKLOG.md admin tooling gap):
-- reissue_ticket() always creates a replacement, which isn't right for a
-- ticket that should just stop being valid (e.g. a cancelled order that
-- already had tickets issued). Mirrors rename_ticket_holder()'s shape exactly.
create or replace function public.void_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
begin
  if not public.is_admin() then
    raise exception 'only admins can void tickets';
  end if;

  select status into v_old_status from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket % not found', p_ticket_id;
  end if;

  if v_old_status in ('storniert', 'ersetzt') then
    raise exception 'ticket % is already % and cannot be voided again', p_ticket_id, v_old_status;
  end if;

  update public.tickets set status = 'storniert' where id = p_ticket_id;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
  values ('ticket', p_ticket_id, 'voided', 'status', v_old_status, 'storniert', 'admin', auth.uid());
end;
$$;

revoke execute on function public.void_ticket(uuid) from public, anon;
grant execute on function public.void_ticket(uuid) to authenticated;
