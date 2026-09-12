-- A line under the buy button, saying why it is the way it is.
--
-- A greyed-out button with nothing next to it tells a visitor only that
-- something is broken, and the office gets the phone call. This is the sentence
-- that answers it - an ordering deadline, a pointer to the Geschäftsstelle,
-- whatever is true at the time - so it is written in the admin rather than in
-- the code.

alter table public.sales_channels add column note text;

comment on column public.sales_channels.note is
  'Optional line shown under the buy button on every card of this type, whatever the mode. Null means no line.';

create or replace function public.set_sales_channel(
  p_product_type text,
  p_mode text,
  p_website_url text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.sales_channels%rowtype;
  v_url text;
  v_note text;
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
  v_note := nullif(btrim(coalesce(p_note, '')), '');

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
         -- Kept in step until the previously deployed shop is replaced; see
         -- add_sales_channel_modes for why 'disabled' maps to true here.
         redirect_to_website = (p_mode <> 'shop'),
         website_url = v_url,
         note = v_note
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

  if v_old.note is distinct from v_note then
    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
    values ('sales_channel', v_old.id, 'sales_channel_change', 'note',
            v_old.note, v_note, 'admin', auth.uid(), p_product_type);
  end if;
end;
$$;

revoke execute on function public.set_sales_channel(text, text, text, text) from public, anon;
grant execute on function public.set_sales_channel(text, text, text, text) to authenticated;

-- The three-argument form is what the currently deployed admin page calls, so it
-- stays and simply leaves the note alone. Same reason the boolean form below it
-- is still here: both go once nothing calls them.
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
  v_note text;
begin
  select note into v_note from public.sales_channels where product_type = p_product_type;
  perform public.set_sales_channel(p_product_type, p_mode, p_website_url, v_note);
end;
$$;

revoke execute on function public.set_sales_channel(text, text, text) from public, anon;
grant execute on function public.set_sales_channel(text, text, text) to authenticated;

-- The sentence Claudio asked for. Only the season passes carry one: Red Castle
-- links to a page that explains itself.
update public.sales_channels
   set note = 'Saisonkarten bestellbar bis 5. September 2026'
 where product_type = 'season_pass';
