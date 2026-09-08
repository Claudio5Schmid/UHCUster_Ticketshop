-- Removing an admin has to remove their Auth account too, otherwise the address
-- stays taken in auth.users and that person can never be added again - the whole
-- point of removing them being reversible.
--
-- admin_users already cascades from auth.users, but the two history tables pointed
-- at admin_users with NO ACTION, so that cascade ran straight into a foreign key
-- violation for any admin who had ever been recorded as an actor - which, once
-- someone has touched a price or an order, is every admin. The removal then failed
-- as a whole.
--
-- Both columns are nullable and both tables are append-only, so nothing is deleted
-- here: the history rows stay exactly as they are, they just stop pointing at an
-- account that no longer exists. Attribution for *removed* admins is given up in
-- exchange for being able to remove them at all.

alter table public.audit_log
  drop constraint audit_log_actor_admin_id_fkey,
  add constraint audit_log_actor_admin_id_fkey
    foreign key (actor_admin_id) references public.admin_users (user_id) on delete set null;

alter table public.price_history
  drop constraint price_history_changed_by_fkey,
  add constraint price_history_changed_by_fkey
    foreign key (changed_by) references public.admin_users (user_id) on delete set null;
