-- Since release_admin_history_references_on_delete, removing an admin sets
-- audit_log.actor_admin_id and price_history.changed_by to null: the history rows
-- survive, but "who did this" goes with the account. That is the wrong half of the
-- trade to keep - a trail whose entries lose their author is worth much less than
-- one that outlives the people in it.
--
-- Both tables now carry the address as plain text, copied in when the row is
-- written. It is a snapshot on purpose: it records who acted at that moment, and
-- stays true afterwards no matter what happens to the account.
--
-- Filled by triggers rather than by editing the sixteen insert sites spread across
-- the SECURITY DEFINER functions that write here (and the price trigger's own two):
-- one place to get right, and every future writer is covered without anyone having
-- to remember this column exists.

alter table public.audit_log add column actor_email text;
alter table public.price_history add column changed_by_email text;

comment on column public.audit_log.actor_email is
  'The acting admin''s address, copied in at insert time so the entry keeps its author after that admin is removed (actor_admin_id is set to null then). Null for actor_type = system.';

comment on column public.price_history.changed_by_email is
  'The acting admin''s address, copied in at insert time so the entry keeps its author after that admin is removed (changed_by is set to null then). Null for prices not set by a logged-in admin, e.g. seeded rows.';

-- SECURITY DEFINER because admin_users is RLS-protected and these rows get written
-- from every context the app has - an admin's own RPC, the customer-facing member
-- order function, the nightly system job. A plain lookup would come back empty for
-- most of those and silently drop the very attribution this exists to keep.
create or replace function public.set_history_actor_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'audit_log' then
    if new.actor_email is null and new.actor_admin_id is not null then
      select email into new.actor_email from public.admin_users where user_id = new.actor_admin_id;
    end if;
  else
    if new.changed_by_email is null and new.changed_by is not null then
      select email into new.changed_by_email from public.admin_users where user_id = new.changed_by;
    end if;
  end if;
  return new;
end;
$$;

-- Trigger-only, like the other functions hardened in harden_function_privileges_v2:
-- triggers fire regardless of the invoking role's grants, so no direct caller needs
-- - or should have - the right to call this over the REST API.
revoke execute on function public.set_history_actor_email() from public, anon, authenticated;

create trigger audit_log_set_actor_email
  before insert on public.audit_log
  for each row execute function public.set_history_actor_email();

create trigger price_history_set_changed_by_email
  before insert on public.price_history
  for each row execute function public.set_history_actor_email();

-- One-off backfill for the rows written before the columns existed. Both tables
-- refuse updates outright, so their guards have to stand aside for it: this writes
-- the address that was already true for each row rather than rewriting anything,
-- and it happens exactly once.
alter table public.audit_log disable trigger audit_log_no_update;
alter table public.price_history disable trigger price_history_no_update;

update public.audit_log a
set actor_email = u.email
from public.admin_users u
where a.actor_admin_id = u.user_id and a.actor_email is null;

update public.price_history p
set changed_by_email = u.email
from public.admin_users u
where p.changed_by = u.user_id and p.changed_by_email is null;

alter table public.audit_log enable trigger audit_log_no_update;
alter table public.price_history enable trigger price_history_no_update;
