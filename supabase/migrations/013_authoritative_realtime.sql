-- Hosted Supabase provides this publication. Plain PostgreSQL test instances
-- need no logical replication service to verify the same table policies.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'device_state'
     ) then
    alter publication supabase_realtime add table public.device_state;
  end if;
end;
$$;
