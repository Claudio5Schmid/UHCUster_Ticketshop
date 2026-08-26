-- Returns true if the current authenticated user is a club admin.
-- SECURITY DEFINER so this can be called from a policy on admin_users itself without
-- infinite recursion: the function's internal SELECT runs as its owner, which bypasses
-- RLS by default (RLS only applies to non-owner roles unless FORCE ROW LEVEL SECURITY
-- is set, which it isn't here).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- Generic trigger to maintain an `updated_at` column, reused across every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
