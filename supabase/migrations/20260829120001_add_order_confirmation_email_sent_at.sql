-- Records when the customer's order-confirmation email actually went out (D49).
--
-- Sending is deliberately best-effort: it happens after the order is already committed
-- and must never fail a checkout. That makes "did this customer actually get their
-- confirmation?" a real question the office needs answered - e.g. when someone calls
-- because they never received anything - so the answer is stored rather than guessed
-- from application logs. Null means: not sent (either it failed, or the address was
-- structurally undeliverable).
--
-- Mirrors the existing members.cards_sent_at pattern.

alter table public.orders
  add column confirmation_email_sent_at timestamptz;

comment on column public.orders.confirmation_email_sent_at is
  'When the order-confirmation email was successfully handed to SES. Null = never sent (send failed, or the address was a reserved TLD). Set by the checkout Server Action after the order is committed, never by the customer.';
