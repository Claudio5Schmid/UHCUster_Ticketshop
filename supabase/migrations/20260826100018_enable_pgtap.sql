-- pgTAP for the RLS test suite (supabase/tests/rls_test.sql). Kept as its own
-- migration, applied after the schema exists, rather than folded into
-- enable_extensions, since it's a test-only dependency, not a schema dependency.
create extension if not exists pgtap with schema extensions;
