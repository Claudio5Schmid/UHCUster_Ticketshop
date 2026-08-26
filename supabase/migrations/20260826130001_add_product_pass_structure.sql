-- Phase 4 needs a machine-readable way to know how many tickets a purchase produces
-- and whether they're transferable, instead of parsing the free-text benefit
-- bullets. Red Castle Club Normal grants one personal (non-transferable) pass;
-- Bronze/Silber/Gold grant multiple transferable passes under one shared holder
-- label (D5). Season passes implicitly default to included_passes=1,
-- transferable=false when these keys are absent - see create_order() below.

update public.products
set benefits = benefits || '{"included_passes": 1, "transferable": false}'::jsonb
where slug = 'red-castle-club-normal';

update public.products
set benefits = benefits || '{"included_passes": 2, "transferable": true}'::jsonb
where slug = 'red-castle-club-bronze';

update public.products
set benefits = benefits || '{"included_passes": 2, "transferable": true}'::jsonb
where slug = 'red-castle-club-silber';

update public.products
set benefits = benefits || '{"included_passes": 3, "transferable": true}'::jsonb
where slug = 'red-castle-club-gold';
