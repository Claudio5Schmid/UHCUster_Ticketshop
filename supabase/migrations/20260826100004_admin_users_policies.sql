create policy "Admins can view admin_users"
  on public.admin_users for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert admin_users"
  on public.admin_users for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update admin_users"
  on public.admin_users for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete admin_users"
  on public.admin_users for delete
  to authenticated
  using (public.is_admin());

comment on policy "Admins can insert admin_users" on public.admin_users is
  'Bootstrap note: the very first admin_users row cannot be inserted through this policy - no admin exists yet to satisfy is_admin(). Insert it once, manually, via the Supabase SQL editor or a service-role connection; every admin added after that can go through the app.';
