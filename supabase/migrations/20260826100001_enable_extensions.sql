-- Enable Postgres extensions required by the schema.

create extension if not exists pgcrypto with schema extensions;

-- pg_cron, per Supabase's documented install method (Cron Postgres Module):
-- https://supabase.com/docs/guides/cron/install
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
