-- When a member last arrived from a CSV import, so a batch can be found again
-- afterwards: "who came in with the list I loaded on Tuesday" is otherwise only
-- answerable by memory.
--
-- Written on creation and on every later import that updates the member, so it
-- means "last touched by an import" rather than "first seen". A member created
-- by hand in the admin never gets one, which is exactly the distinction worth
-- being able to see.
--
-- Null for everyone who predates this column, including anyone imported before
-- it existed - an import date that was never recorded is not one worth inventing.

alter table public.members add column imported_at timestamptz;

comment on column public.members.imported_at is
  'When a CSV import last created or updated this member. Null for members added by hand in the admin, and for those imported before this column existed.';
