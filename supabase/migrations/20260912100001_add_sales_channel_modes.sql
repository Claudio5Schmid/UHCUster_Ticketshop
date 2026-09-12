-- A third answer to "where is this bought".
--
-- Sending season-pass buyers to uhcuster.ch turned out to help less than it
-- looked: the club's order form takes a Saisonabo, but it has no field for the
-- distinction the shop makes between Erwachsene, Reduziert and Sponsoren Legi -
-- the buyer would have to describe it in a remarks box. So the offers stay on
-- display, with their prices and benefits, and the buy button simply stops
-- working. A boolean cannot say that, so it becomes a mode.
--
-- redirect_to_website is deliberately NOT dropped here. The shop currently
-- deployed reads it on every page render, so removing it would take the live
-- site down for the minutes between this migration and the deploy that follows.
-- It stays, written in step with the new column, and a later migration drops it
-- once nothing reads it. 'disabled' maps to true there rather than false: to the
-- old code that means "link to the website", which is today's behaviour, whereas
-- false would re-open shop sales for the length of the window.

alter table public.sales_channels add column mode text;

update public.sales_channels
   set mode = case when redirect_to_website then 'website' else 'shop' end;

alter table public.sales_channels alter column mode set not null;

alter table public.sales_channels
  add constraint sales_channels_mode_check
    check (mode in ('shop', 'website', 'disabled'));

-- The old rule tied the address to the boolean, which no longer works: 'disabled'
-- maps that boolean to true (see the note at the top) while needing no address at
-- all. Superseded by the same rule stated about the mode - dropping it changes no
-- reads, so the deployed shop is unaffected.
alter table public.sales_channels drop constraint sales_channels_redirect_needs_url;

alter table public.sales_channels
  add constraint sales_channels_website_needs_url
    check (mode <> 'website' or website_url is not null);

comment on column public.sales_channels.mode is
  'shop: the cart and checkout here. website: the card links to website_url. disabled: the card is shown but cannot be bought anywhere from this shop.';

comment on column public.sales_channels.redirect_to_website is
  'Deprecated - superseded by mode. Kept in step so the previously deployed shop keeps rendering until it is replaced; dropped in a later migration.';

create or replace function public.set_sales_channel(
  p_product_type text,
  p_mode text,
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

  if p_mode not in ('shop', 'website', 'disabled') then
    raise exception 'unknown sales mode %', p_mode;
  end if;

  select * into v_old from public.sales_channels where product_type = p_product_type for update;
  if not found then
    raise exception 'unknown product type %', p_product_type;
  end if;

  v_url := nullif(btrim(coalesce(p_website_url, '')), '');

  if p_mode = 'website' then
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
     set mode = p_mode,
         -- See the note at the top: anything that is not "sell here" reads as
         -- "link away" to the old code, which is the safer of the two.
         redirect_to_website = (p_mode <> 'shop'),
         website_url = v_url
   where id = v_old.id;

  if v_old.mode is distinct from p_mode then
    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
    values ('sales_channel', v_old.id, 'sales_channel_change', 'mode',
            v_old.mode, p_mode, 'admin', auth.uid(), p_product_type);
  end if;

  if v_old.website_url is distinct from v_url then
    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
    values ('sales_channel', v_old.id, 'sales_channel_change', 'website_url',
            v_old.website_url, v_url, 'admin', auth.uid(), p_product_type);
  end if;
end;
$$;

revoke execute on function public.set_sales_channel(text, text, text) from public, anon;
grant execute on function public.set_sales_channel(text, text, text) to authenticated;

-- The boolean form stays reachable for the length of the window, because the
-- deployed admin page still calls it - and it now keeps `mode` in step too, so
-- a save from either version leaves the row consistent.
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
begin
  -- Cast on purpose: with a boolean overload in scope, an untyped literal would
  -- make the call ambiguous and Postgres would refuse to resolve it.
  perform public.set_sales_channel(
    p_product_type,
    (case when p_redirect_to_website then 'website' else 'shop' end)::text,
    p_website_url
  );
end;
$$;

revoke execute on function public.set_sales_channel(text, boolean, text) from public, anon;
grant execute on function public.set_sales_channel(text, boolean, text) to authenticated;

-- The state Claudio asked for: season passes on display but not buyable, Red
-- Castle still pointing at the club's own page.
update public.sales_channels
   set mode = 'disabled', redirect_to_website = true
 where product_type = 'season_pass';

update public.sales_channels
   set mode = 'website', redirect_to_website = true
 where product_type = 'membership';
