-- Lets an admin remove roster rows from /admin/members - mainly for cleaning
-- up test entries. Mirrors the one other plain admin-gated delete policy in
-- this schema (admin_users, 20260826100004): no WITH CHECK on a delete, no
-- audit_log entry (members inserts/updates aren't audit-logged either - it's
-- a working roster, not the orders/tickets audit trail). Deleting a member
-- only removes this roster row - their order and any already-issued tickets
-- (if cards were generated) are untouched, same as everywhere else in this
-- schema treats orders as permanent.
create policy "Admins can delete members"
  on public.members for delete
  to authenticated
  using (public.is_admin());
