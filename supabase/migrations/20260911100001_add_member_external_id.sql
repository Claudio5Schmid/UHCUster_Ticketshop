-- The member CSV is re-imported as the club's list changes, and until now every
-- import created rows: the same person arriving twice simply became two members
-- with two sets of cards. Nothing in the database prevented it.
--
-- The club's own membership system already numbers its people, so that number is
-- the identity here rather than anything this app invents. E-mail was the obvious
-- alternative and was deliberately not chosen: families share one address, so it
-- would have locked out exactly the households a club has most of.
--
-- Nullable because the members already in the table predate this and have no
-- number yet - what happens to them is decided once the real member export exists.
-- Postgres allows any number of nulls under a unique constraint, so they coexist
-- without weakening the constraint for everyone who does have one.

alter table public.members add column external_id text;

create unique index members_external_id_key on public.members (external_id);

comment on column public.members.external_id is
  'The member number from the club''s own membership system, read from the import CSV - never generated here. Unique; the key an import matches on to update a member rather than duplicating them. Null only for members created before this column existed.';
