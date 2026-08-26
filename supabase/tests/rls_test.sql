-- RLS / schema behaviour test suite for the UHC Uster ticket shop (Phase 1).
-- Run via the Supabase SQL editor / execute_sql, or `supabase test db` once the CLI
-- is linked. Wrapped in a transaction that is rolled back at the end, so none of the
-- fixture data below is ever actually persisted.
--
-- Role simulation: `set local role anon|authenticated` switches the executing role;
-- `set local request.jwt.claim.sub` supplies the uuid that auth.uid() reads (confirmed
-- against this project's actual auth.uid() definition, not assumed).

begin;

select plan(64);

-- ============================================================================
-- Fixtures (inserted as the default/owner role, which bypasses RLS - the normal
-- way to seed data for testing, and also proves the append-only triggers apply
-- even to the owner, later in this file).
-- ============================================================================

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), -- admin
  ('a0000000-0000-0000-0000-000000000002'); -- authenticated, not an admin

insert into public.admin_users (user_id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@uhcuster.ch');

insert into public.products (id, slug, name, type, price_rappen, tier_level, active, valid_season)
values
  ('b0000000-0000-0000-0000-000000000001', 'test-active', 'Test Active Product', 'season_pass', 15000, 1, true, '2627'),
  ('b0000000-0000-0000-0000-000000000002', 'test-inactive', 'Test Inactive Product', 'season_pass', 8000, 0, false, '2627');

insert into public.customers (id, name, address_street, address_zip, address_city, email, phone)
values ('c0000000-0000-0000-0000-000000000001', 'Test Customer', 'Teststrasse 1', '8610', 'Uster', 'test@example.com', '0791234567');

insert into public.orders (id, order_number, status, customer_id, source, season)
values ('d0000000-0000-0000-0000-000000000001', 'TEST-0001', 'neu', 'c0000000-0000-0000-0000-000000000001', 'shop', '2627');

insert into public.order_items (id, order_id, product_id, product_name_snapshot, unit_price_rappen, quantity, holder_name)
values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Test Active Product', 15000, 1, 'Test Holder');

insert into public.tickets (id, token, order_item_id, product_id, season, holder_name)
values ('f0000000-0000-0000-0000-000000000001', 'TEST-TOKEN-0001', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2627', 'Test Holder');

insert into public.scan_events (id, scanned_token, ticket_id, result, device_id)
values ('10000001-0000-0000-0000-000000000001', 'TEST-TOKEN-0001', 'f0000000-0000-0000-0000-000000000001', 'accepted', 'test-device-1');

insert into public.games (id, season, opponent, played_at)
values ('20000001-0000-0000-0000-000000000001', '2627', 'Test Gegner', now() + interval '30 days');

-- Backdated fixtures for the auto-cancel test (D14).
insert into public.customers (id, name, address_street, address_zip, address_city, email, phone)
values ('c0000000-0000-0000-0000-000000000002', 'Stale Customer', 'Teststrasse 2', '8610', 'Uster', 'stale@example.com', '0791234568');

insert into public.orders (id, order_number, status, customer_id, source, season, created_at)
values ('d0000000-0000-0000-0000-000000000002', 'TEST-0002', 'neu', 'c0000000-0000-0000-0000-000000000002', 'shop', '2627', now() - interval '15 days');

insert into public.customers (id, name, address_street, address_zip, address_city, email, phone)
values ('c0000000-0000-0000-0000-000000000003', 'Paid Customer', 'Teststrasse 3', '8610', 'Uster', 'paid@example.com', '0791234569');

insert into public.orders (id, order_number, status, customer_id, source, season, created_at)
values ('d0000000-0000-0000-0000-000000000003', 'TEST-0003', 'bezahlt', 'c0000000-0000-0000-0000-000000000003', 'shop', '2627', now() - interval '15 days');

-- ============================================================================
-- Group A: anon visibility
-- ============================================================================

set local role anon;

-- Existence checks, not raw counts: the real product catalog (seeded in Phase 3)
-- lives in this same table, so "anon sees N products" isn't a stable assertion.
select ok((select exists(select 1 from public.products where slug = 'test-active')), 'anon can see the active test product');
select ok((select not exists(select 1 from public.products where slug = 'test-inactive')), 'anon cannot see the inactive test product');
select is((select count(*) from public.customers)::int, 0, 'anon sees no customers');
select is((select count(*) from public.orders)::int, 0, 'anon sees no orders');
select is((select count(*) from public.order_items)::int, 0, 'anon sees no order_items');
select is((select count(*) from public.tickets)::int, 0, 'anon sees no tickets');
select is((select count(*) from public.scan_events)::int, 0, 'anon sees no scan_events');
select is((select count(*) from public.price_history)::int, 0, 'anon sees no price_history');
select is((select count(*) from public.admin_users)::int, 0, 'anon sees no admin_users');
select is((select count(*) from public.audit_log)::int, 0, 'anon sees no audit_log');
select ok((select exists(select 1 from public.games where id = '20000001-0000-0000-0000-000000000001')), 'anon can see games - schedule is public information');

reset role;

-- ============================================================================
-- Group B: authenticated, but NOT an admin - catches "authenticated => admin"
-- ============================================================================

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

select ok((select exists(select 1 from public.products where slug = 'test-active')), 'non-admin authenticated can see the active test product');
select is((select count(*) from public.customers)::int, 0, 'non-admin authenticated sees no customers');
select is((select count(*) from public.orders)::int, 0, 'non-admin authenticated sees no orders');
select is((select count(*) from public.tickets)::int, 0, 'non-admin authenticated sees no tickets');
select is((select count(*) from public.admin_users)::int, 0, 'non-admin authenticated sees no admin_users');
select throws_ok(
  $$select public.transition_order_status('d0000000-0000-0000-0000-000000000001', 'bezahlt')$$,
  'P0001',
  'only admins can transition order status',
  'non-admin authenticated cannot call transition_order_status'
);
select throws_ok(
  $$insert into public.games (season, opponent, played_at) values ('2627', 'Should Fail', now())$$,
  '42501',
  'new row violates row-level security policy for table "games"',
  'non-admin authenticated cannot insert a game'
);

reset role;
reset request.jwt.claim.sub;

-- ============================================================================
-- Group C: authenticated admin
-- ============================================================================

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

select ok((select exists(select 1 from public.products where slug = 'test-active')), 'admin can see the active test product');
select ok((select exists(select 1 from public.products where slug = 'test-inactive')), 'admin can also see the inactive test product');
select is((select count(*) from public.customers)::int, 3, 'admin sees all customers');
select is((select count(*) from public.orders)::int, 3, 'admin sees all orders');
select is((select count(*) from public.order_items)::int, 1, 'admin sees order_items');
select is((select count(*) from public.tickets)::int, 1, 'admin sees tickets');
select is((select count(*) from public.admin_users)::int, 1, 'admin sees admin_users');

select lives_ok(
  $$insert into public.games (season, opponent, played_at) values ('2627', 'Admin Gegner', now() + interval '45 days')$$,
  'admin can insert a game'
);
select ok(
  (select exists(select 1 from public.games where season = '2627' and opponent = 'Admin Gegner')),
  'the admin-inserted game is now visible too'
);

-- Bare writes to orders/tickets are structurally blocked (no insert/update policy) -
-- silently affect 0 rows under RLS, not an exception.
update public.orders set status = 'bezahlt' where id = 'd0000000-0000-0000-0000-000000000001';
select is((select status from public.orders where id = 'd0000000-0000-0000-0000-000000000001'), 'neu', 'bare UPDATE on orders has no effect - no update policy exists');

update public.tickets set holder_name = 'Hacked' where id = 'f0000000-0000-0000-0000-000000000001';
select is((select holder_name from public.tickets where id = 'f0000000-0000-0000-0000-000000000001'), 'Test Holder', 'bare UPDATE on tickets has no effect - no update policy exists');

-- The dedicated functions succeed and log to audit_log.
select lives_ok(
  $$select public.transition_order_status('d0000000-0000-0000-0000-000000000001', 'bezahlt')$$,
  'admin can call transition_order_status'
);
select is((select status from public.orders where id = 'd0000000-0000-0000-0000-000000000001'), 'bezahlt', 'order status actually changed via the function');
select is(
  (select count(*) from public.audit_log where entity_type = 'order' and entity_id = 'd0000000-0000-0000-0000-000000000001' and action = 'status_change'),
  1::bigint,
  'status change was logged to audit_log'
);

select lives_ok(
  $$select public.rename_ticket_holder('f0000000-0000-0000-0000-000000000001', 'New Holder')$$,
  'admin can call rename_ticket_holder'
);
select is((select holder_name from public.tickets where id = 'f0000000-0000-0000-0000-000000000001'), 'New Holder', 'ticket holder actually changed via the function');
select is(
  (select count(*) from public.audit_log where entity_type = 'ticket' and entity_id = 'f0000000-0000-0000-0000-000000000001' and action = 'holder_name_change'),
  1::bigint,
  'holder rename was logged to audit_log'
);

select lives_ok(
  $$select public.set_refund_owed('d0000000-0000-0000-0000-000000000001', true)$$,
  'admin can call set_refund_owed'
);
select is((select refund_owed from public.orders where id = 'd0000000-0000-0000-0000-000000000001'), true, 'refund_owed actually changed via the function');

-- price_history cannot be written to directly, even by an admin.
select throws_ok(
  $$insert into public.price_history (product_id, price_rappen) values ('b0000000-0000-0000-0000-000000000001', 1)$$,
  '42501',
  'new row violates row-level security policy for table "price_history"',
  'admin cannot insert directly into price_history'
);

-- Admins CAN write directly to products (unlike orders/tickets) - and the
-- price_history trigger picks up the change automatically.
update public.products set price_rappen = 15500 where id = 'b0000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.price_history where product_id = 'b0000000-0000-0000-0000-000000000001'),
  2::bigint,
  'price_history now has the initial row plus the update - populated only by the trigger'
);
-- Note: both price_history rows share the same changed_at here, since now() is
-- transaction-stable and this whole test runs in one transaction - not a real-world
-- concern (each price change is its own transaction in production), but it means
-- "order by changed_at" can't disambiguate within this test, so filter on
-- previous_price_rappen instead, which only the update-triggered row has set.
select is(
  (select price_rappen from public.price_history where product_id = 'b0000000-0000-0000-0000-000000000001' and previous_price_rappen is not null),
  15500,
  'the update-triggered price_history row has the new price'
);
select is(
  (select previous_price_rappen from public.price_history where product_id = 'b0000000-0000-0000-0000-000000000001' and previous_price_rappen is not null),
  15000,
  'the update-triggered price_history row records the previous price'
);

-- Non-price product edits go through update_product_details() and log to audit_log.
select lives_ok(
  $$select public.update_product_details(p_product_id := 'b0000000-0000-0000-0000-000000000001', p_name := 'Renamed Test Product')$$,
  'admin can call update_product_details'
);
select is((select name from public.products where id = 'b0000000-0000-0000-0000-000000000001'), 'Renamed Test Product', 'product name actually changed via the function');
select is(
  (select count(*) from public.audit_log where entity_type = 'product' and entity_id = 'b0000000-0000-0000-0000-000000000001' and field_name = 'name'),
  1::bigint,
  'product name change was logged to audit_log'
);

-- reissue_ticket: void the old ticket, issue a linked replacement.
select lives_ok(
  $$select public.reissue_ticket('f0000000-0000-0000-0000-000000000001', 'TEST-TOKEN-0002', 'New Holder')$$,
  'admin can call reissue_ticket'
);
select is((select status from public.tickets where id = 'f0000000-0000-0000-0000-000000000001'), 'ersetzt', 'old ticket is voided, not deleted');
select is(
  (select count(*) from public.tickets where replaces_ticket_id = 'f0000000-0000-0000-0000-000000000001'),
  1::bigint,
  'exactly one replacement ticket links back to the old one'
);

reset role;
reset request.jwt.claim.sub;

-- ============================================================================
-- Group D: append-only enforcement, run at owner level - this isolates the
-- database trigger itself from RLS (which would otherwise just silently filter
-- 0 rows for a non-owner role and never actually reach the trigger).
-- ============================================================================

select throws_ok($$update public.price_history set price_rappen = 999 where true$$, 'P0001', 'price_history is append-only and cannot be updated or deleted', 'price_history blocks direct UPDATE, even for the owner');
select throws_ok($$delete from public.price_history where true$$, 'P0001', 'price_history is append-only and cannot be updated or deleted', 'price_history blocks direct DELETE, even for the owner');
select throws_ok($$update public.scan_events set result = 'accepted' where true$$, 'P0001', 'scan_events is append-only and cannot be updated or deleted', 'scan_events blocks direct UPDATE, even for the owner');
select throws_ok($$delete from public.scan_events where true$$, 'P0001', 'scan_events is append-only and cannot be updated or deleted', 'scan_events blocks direct DELETE, even for the owner');
select throws_ok($$update public.audit_log set note = 'x' where true$$, 'P0001', 'audit_log is append-only and cannot be updated or deleted', 'audit_log blocks direct UPDATE, even for the owner');
select throws_ok($$delete from public.audit_log where true$$, 'P0001', 'audit_log is append-only and cannot be updated or deleted', 'audit_log blocks direct DELETE, even for the owner');

-- ============================================================================
-- Group E: order numbering
-- ============================================================================

-- Relative, not absolute: order_number_sequences persists across real usage (this
-- project already has real orders from manual testing), so a fresh test run can't
-- assume it starts at 0001 - only that the format is right and consecutive calls
-- increment by exactly one.
select ok(public.next_order_number('2627') ~ '^UHCU-2627-[0-9]{4}$', 'next_order_number returns the expected format');
select ok(
  (
    with first_call as (select public.next_order_number('2627') as num),
         second_call as (select public.next_order_number('2627') as num)
    select abs(
      (regexp_match(second_call.num, '([0-9]{4})$'))[1]::int
      - (regexp_match(first_call.num, '([0-9]{4})$'))[1]::int
    ) = 1
    from first_call, second_call
  ),
  'two consecutive calls differ by exactly one'
);

-- ============================================================================
-- Group F: auto-cancel stale orders (D14)
-- ============================================================================

select public.auto_cancel_stale_orders();

select is((select status from public.orders where id = 'd0000000-0000-0000-0000-000000000002'), 'storniert', 'a 15-day-old neu order is auto-cancelled');
select is(
  (select count(*) from public.audit_log where entity_type = 'order' and entity_id = 'd0000000-0000-0000-0000-000000000002' and actor_type = 'system'),
  1::bigint,
  'the auto-cancellation is logged with actor_type system'
);
select is((select status from public.orders where id = 'd0000000-0000-0000-0000-000000000003'), 'bezahlt', 'a 15-day-old bezahlt order is left untouched');

-- ============================================================================
-- Group G: create_order (Phase 4) - server-side price resolution
-- ============================================================================

set local role anon;
select throws_ok(
  $$select public.create_order('{}'::jsonb, '[]'::jsonb, '2627')$$,
  '42501',
  'permission denied for function create_order',
  'anon cannot call create_order directly'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select public.create_order('{}'::jsonb, '[]'::jsonb, '2627')$$,
  '42501',
  'permission denied for function create_order',
  'non-admin authenticated cannot call create_order either - system-only, like auto_cancel_stale_orders'
);
reset role;
reset request.jwt.claim.sub;

-- Owner-level call (simulating the service-role connection the checkout Server
-- Action uses) with a tampered price injected into the line - must be ignored.
select lives_ok(
  $$select public.create_order(
    '{"name":"Test Customer","address_street":"Teststrasse 9","address_zip":"8610","address_city":"Uster","email":"order-test@example.com","phone":"0791234567"}'::jsonb,
    jsonb_build_array(jsonb_build_object('product_id', 'b0000000-0000-0000-0000-000000000001', 'holder_name', 'Test Holder', 'price_rappen', 1, 'unit_price_rappen', 1)),
    '2627'
  )$$,
  'create_order succeeds for a valid product, even with extra tampered fields in the line'
);

select is(
  (select oi.unit_price_rappen from public.order_items oi
   join public.orders o on o.id = oi.order_id
   join public.customers c on c.id = o.customer_id
   where c.email = 'order-test@example.com'),
  15500,
  'the tampered price_rappen/unit_price_rappen in the request is ignored - the real current product price is charged'
);

select is(
  (select o.total_rappen from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'order-test@example.com'),
  15500,
  'orders.total_rappen reflects the real price via the trigger, not the tampered one'
);

select throws_ok(
  $$select public.create_order(
    '{"name":"Test","address_street":"X","address_zip":"1","address_city":"X","email":"x@example.com","phone":"1"}'::jsonb,
    jsonb_build_array(jsonb_build_object('product_id', '99999999-9999-9999-9999-999999999999', 'holder_name', 'X')),
    '2627'
  )$$,
  'P0001',
  'product 99999999-9999-9999-9999-999999999999 is not available',
  'create_order rejects a nonexistent product id'
);

select * from finish();

rollback;
