begin;

-- The admissions and ID-card RPCs were deployed after earlier migrations had
-- been reconciled manually. Refresh PostgREST's function catalog so clients
-- can resolve the tenant-scoped RPC signatures without waiting for cache TTL.
notify pgrst, 'reload schema';

commit;
