create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

comment on table public.admin_users is
  'Flat access list for the club office admin area. No role differentiation in the MVP - deferred by decision, see docs/DECISIONS.md D15.';

-- RLS is enabled but no policies exist yet: is_admin() (next migration) doesn't exist
-- until after this one, so policies referencing it are added in admin_users_policies.
