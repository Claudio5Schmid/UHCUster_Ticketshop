-- Two-level product structure (D71/O1): the existing `products` table stays the
-- variant level - it is what order_items, tickets, price_history and
-- sales_channels already point at - and gains a category and a variant key. The
-- valid pairs live in a small catalog that the two columns reference as a
-- composite foreign key, so "Saisonabo + Gold" is impossible at the database
-- level rather than only in the import's validation.
--
-- `category` is deliberately not the same thing as the older `type` column
-- (season_pass | membership): `type` drives the card design and the sales
-- channel switch, `category` is what the import and the order form speak in.
-- The member products form their own category because they are issued from the
-- member list, never ordered.

create table public.product_variant_catalog (
  category text not null check (category in ('red_castle', 'saisonabo', 'mitglieder')),
  variant text not null,
  label text not null,
  primary key (category, variant)
);

alter table public.product_variant_catalog enable row level security;

-- Harmless to read: it lists nothing but the shape of the catalog, no prices.
create policy "Anyone can view the variant catalog"
  on public.product_variant_catalog for select
  to anon, authenticated
  using (true);

comment on table public.product_variant_catalog is
  'The valid (category, variant) pairs a product may carry - the constraint behind "invalid combinations are excluded", referenced by products (category, variant). Extended by migration, not by the admin.';

insert into public.product_variant_catalog (category, variant, label) values
  ('red_castle', 'gold', 'Gold'),
  ('red_castle', 'silber', 'Silber'),
  ('red_castle', 'bronze', 'Bronze'),
  ('red_castle', 'normal', 'Normal'),
  -- Import only, this season (D74): two transferable season passes, no VIP status.
  ('red_castle', 'spezial', 'Spezial'),
  ('saisonabo', 'erwachsene', 'Erwachsene'),
  ('saisonabo', 'reduziert', 'Reduziert'),
  ('saisonabo', 'legi', 'Sponsoren Legi'),
  ('mitglieder', 'persoenlich', 'Persönlich'),
  ('mitglieder', 'uebertragbar', 'Übertragbar');

alter table public.products
  add column category text,
  add column variant text;

alter table public.products
  add constraint products_category_variant_fkey
    foreign key (category, variant) references public.product_variant_catalog (category, variant),
  -- Both or neither: the test product carries none, everything sold or imported
  -- carries both.
  add constraint products_category_variant_paired
    check ((category is null) = (variant is null));

-- One product per variant and season - the import resolves "red_castle;gold"
-- to exactly one row.
create unique index products_category_variant_season_key
  on public.products (category, variant, valid_season)
  where category is not null;

comment on column public.products.category is
  'Main category (red_castle | saisonabo | mitglieder), paired with variant via product_variant_catalog. Null only on products that are neither sold nor imported (the test product).';
comment on column public.products.variant is
  'Variant key within the category (gold, silber, ..., erwachsene, ...). What the CSV import and the Red Castle order form refer to.';

update public.products set category = 'red_castle', variant = 'gold'   where slug = 'red-castle-club-gold';
update public.products set category = 'red_castle', variant = 'silber' where slug = 'red-castle-club-silber';
update public.products set category = 'red_castle', variant = 'bronze' where slug = 'red-castle-club-bronze';
update public.products set category = 'red_castle', variant = 'normal' where slug = 'red-castle-club-normal';
update public.products set category = 'saisonabo',  variant = 'erwachsene' where slug = 'saisonkarte-erwachsener';
update public.products set category = 'saisonabo',  variant = 'reduziert'  where slug = 'saisonkarte-reduziert';
update public.products set category = 'saisonabo',  variant = 'legi'       where slug = 'sponsoren-legi';
update public.products set category = 'mitglieder', variant = 'persoenlich'  where slug = 'mitglieder-uhc-uster';
update public.products set category = 'mitglieder', variant = 'uebertragbar' where slug = 'mitglieder-uhc-uster-uebertragbar';

-- The import-only Red Castle variant (D74). Price 0 until Claudio sets the real
-- figure under Einstellungen -> Preise: the import freezes the product's price
-- into each order at import time, so it has to be right *before* the first
-- import, not after. Inactive, so the shop never offers it.
insert into public.products (slug, name, description, type, price_rappen, tier_level, active, sort_order, valid_season, category, variant, benefits)
values (
  'red-castle-club-spezial',
  'Red Castle Club Spezial',
  'Zwei übertragbare Saisonkarten ohne VIP-Leistungen. Nur für den Import bestehender Bestellungen.',
  'membership',
  0,
  1,
  false,
  14,
  '2627',
  'red_castle',
  'spezial',
  '{"highlights": ["Übertragbare Saisonkarten für 2 Personen"], "transferable": true, "included_passes": 2}'::jsonb
)
on conflict (slug) do nothing;
