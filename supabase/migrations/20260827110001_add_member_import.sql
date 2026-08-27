-- Member CSV import + card distribution (post-Phase-8 addition). Reuses the
-- existing orders -> order_items -> tickets -> PDF pipeline end to end (D24's
-- "one order_item per holder-name/transferability combination" pattern already
-- fits this exactly) - a member with both a personal card and N transferable
-- codes gets two order_items against two different products, not new ticket-
-- issuance code.

-- customers.address_street/zip/city/phone were NOT NULL, sized for real shop
-- orders that need a mailing address. Members only ever supply name + email via
-- CSV, so these become optional - still populated for real shop customers,
-- simply absent for member-import customers.
alter table public.customers
  alter column address_street drop not null,
  alter column address_zip drop not null,
  alter column address_city drop not null,
  alter column phone drop not null;

-- Companion to the existing (Phase 3) 'mitglieder-uhc-uster' product, which
-- stays the personal/non-transferable card (its benefits already default to
-- transferable = false, included_passes = 1). This one is for the "wie viele
-- übertragbare Codes" count from the CSV - same shape as a Red Castle Club
-- bundle (D24), just for members instead of paying customers.
insert into public.products (slug, name, description, type, price_rappen, tier_level, active, sort_order, valid_season, benefits)
values (
  'mitglieder-uhc-uster-uebertragbar',
  'Mitglieder UHC Uster (übertragbar)',
  'Übertragbare Zusatzkarten für Mitglieder, gemäss Mitgliederliste.',
  'season_pass',
  0,
  0,
  false,
  1,
  '2627',
  '{"highlights": ["Zutritt zu allen Heimspielen der Saison 26/27"], "transferable": true}'::jsonb
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  vorname text not null,
  nachname text not null,
  email text not null,
  kategorie text,
  mitgliederkarte boolean not null default false,
  transferable_code_count integer not null default 0 check (transferable_code_count >= 0),
  -- Set once tickets have been generated for this member (issue_tickets_for_order
  -- equivalent, run at import/creation time) and once their card email has
  -- actually gone out - two separate moments, matching "generate immediately,
  -- send only on the batch button" from the brief.
  order_id uuid references public.orders (id),
  cards_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.members enable row level security;

create index members_order_id_idx on public.members (order_id);

create trigger set_members_updated_at
  before update on public.members
  for each row
  execute function public.set_updated_at();

create policy "Admins can view members"
  on public.members for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert members"
  on public.members for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update members"
  on public.members for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.members is
  'Club roster imported via CSV or added one at a time in /admin/members - separate from customers/orders (which model paying shop transactions), but each member with mitgliederkarte=true and/or transferable_code_count>0 gets a real order (source=csv_import) and real tickets through the same pipeline as a shop purchase.';
