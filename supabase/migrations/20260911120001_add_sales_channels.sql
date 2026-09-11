-- Where a purchase actually happens, per kind of product.
--
-- The shop has no payment provider and no link into the club's bookkeeping yet,
-- so every order placed here is one the office has to enter by hand. Until that
-- is connected, season passes and Red Castle memberships are sold on
-- uhcuster.ch instead, and the shop only shows them and links across.
--
-- A switch rather than a deploy, because it has to be flipped back the moment
-- the payment side is ready - and by Claudio, not by a release.

create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  -- Mirrors products.type, which is what groups the offers on screen: the
  -- season-pass cards on the home page, the Red Castle tiers on their own page.
  product_type text not null unique check (product_type in ('season_pass', 'membership')),
  -- True: the card links to uhcuster.ch. False: it goes in the cart as before.
  redirect_to_website boolean not null default true,
  website_url text,
  updated_at timestamptz not null default now(),
  -- A redirect without a destination would be a dead button, so the two fields
  -- can only be saved in a combination that works.
  constraint sales_channels_redirect_needs_url
    check (not redirect_to_website or website_url is not null)
);

comment on table public.sales_channels is
  'Per product type: whether the shop sells it itself or links to uhcuster.ch. Read by the public shop, written only through set_sales_channel().';

alter table public.sales_channels enable row level security;

-- The shop is public and every visitor needs to know which button to draw.
create policy "Anyone can view sales channels"
  on public.sales_channels for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy for anyone: writes go through the function
-- below, the same shape as every other admin mutation in this schema.

create trigger set_sales_channels_updated_at
  before update on public.sales_channels
  for each row execute function public.set_updated_at();

-- Both start on the website: that is the state the shop goes live in today.
insert into public.sales_channels (product_type, redirect_to_website, website_url)
values
  ('season_pass', true, 'https://uhcuster.ch/de/fanzone/fanzonen.htm'),
  ('membership', true, 'https://uhcuster.ch/de/fanzone/red_castle/red_castle.htm');

-- audit_log only knew orders, tickets and products. Turning shop sales on or off
-- decides where a season's money arrives, which is exactly the kind of change
-- someone asks about months later.
alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('order', 'ticket', 'product', 'sales_channel'));

create or replace function public.set_sales_channel(
  p_product_type text,
  p_redirect_to_website boolean,
  p_website_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.sales_channels%rowtype;
  v_url text;
begin
  if not public.is_admin() then
    raise exception 'only admins can change how a product is sold';
  end if;

  select * into v_old from public.sales_channels where product_type = p_product_type for update;
  if not found then
    raise exception 'unknown product type %', p_product_type;
  end if;

  v_url := nullif(btrim(coalesce(p_website_url, '')), '');

  if p_redirect_to_website then
    if v_url is null then
      raise exception 'a redirect needs a target address';
    end if;
    -- Plain http would drop a visitor from a secure page onto an insecure one,
    -- and a relative path would point back into this shop, which is the one
    -- place the redirect is meant to lead away from.
    if v_url !~ '^https://' then
      raise exception 'the target address has to start with https://';
    end if;
  end if;

  update public.sales_channels
     set redirect_to_website = p_redirect_to_website,
         website_url = v_url
   where id = v_old.id;

  if v_old.redirect_to_website is distinct from p_redirect_to_website then
    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
    values ('sales_channel', v_old.id, 'sales_channel_change', 'redirect_to_website',
            v_old.redirect_to_website::text, p_redirect_to_website::text, 'admin', auth.uid(), p_product_type);
  end if;

  if v_old.website_url is distinct from v_url then
    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
    values ('sales_channel', v_old.id, 'sales_channel_change', 'website_url',
            v_old.website_url, v_url, 'admin', auth.uid(), p_product_type);
  end if;
end;
$$;

revoke execute on function public.set_sales_channel(text, boolean, text) from public, anon;
grant execute on function public.set_sales_channel(text, boolean, text) to authenticated;
