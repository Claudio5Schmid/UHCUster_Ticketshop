-- The card's headline now comes from the member list's "Kategorie" (D60), and a
-- change there redraws the member's cards in place so the next download shows
-- it. Redrawing overwrites the stored PDF under its existing path - the token,
-- the QR code and the path stay - which needs an update right on the bucket the
-- admin session never had: until now only the one-off rerender script, run with
-- the service role, could replace a file. Scoped to the tickets bucket and to
-- admins, like the existing read and upload policies.
create policy "Admins can replace ticket files"
  on storage.objects for update
  using (bucket_id = 'tickets' and public.is_admin())
  with check (bucket_id = 'tickets' and public.is_admin());
