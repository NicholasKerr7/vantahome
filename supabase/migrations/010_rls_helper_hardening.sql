-- Sprint 2: make household RLS helpers non-recursive and explicitly scoped.
--
-- These helpers are referenced by policies on homes and home_members. Running
-- their lookups as the caller would re-enter those same policies. SECURITY
-- DEFINER plus row_security=off lets the helpers inspect only the membership
-- rows needed for their boolean decision; callers never receive those rows.

create or replace function can_access_home(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from homes h
    where h.id = hid and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from home_members hm
    where hm.home_id = hid and hm.user_id = auth.uid()
  );
$$;

create or replace function can_manage_home(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from homes h
    where h.id = hid and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from home_members hm
    where hm.home_id = hid
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin')
  );
$$;

-- Keep the superseded Phase 4 helper safe in case an older policy or a
-- diagnostic query still references it during a rolling migration.
create or replace function can_access_home_full(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from homes h
    where h.id = hid and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from home_members hm
    where hm.home_id = hid
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin', 'member')
  );
$$;

revoke all on function can_access_home(uuid) from public;
revoke all on function can_manage_home(uuid) from public;
revoke all on function can_access_home_full(uuid) from public;
grant execute on function can_access_home(uuid) to authenticated;
grant execute on function can_manage_home(uuid) to authenticated;
grant execute on function can_access_home_full(uuid) to authenticated;
