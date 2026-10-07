-- Layout consent is independent of room assignments, device visibility, and
-- action permissions. Existing memberships start without this optional consent.
alter table public.home_members
  add column if not exists share_interior_layout boolean not null default false;
comment on column public.home_members.share_interior_layout is
  'Owner-confirmed interior layout visibility for Guest/Tenant; grants no rooms, telemetry, or device actions.';
alter table public.home_members add constraint home_members_interior_layout_scoped_roles
  check (not share_interior_layout or role in ('guest', 'tenant'));

-- Generic membership writes retain their existing RLS, but cannot include this
-- column even when an administrator can otherwise update a target member.
revoke insert, update on public.home_members from public, anon, authenticated;
grant insert (home_id, user_id, role, created_at, access_expires_at),
  update (home_id, user_id, role, created_at, access_expires_at)
  on public.home_members to authenticated;

/** A changed membership never carries consent from an earlier access grant. */
create or replace function public.reset_member_interior_layout()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.home_id is distinct from old.home_id
    or new.user_id is distinct from old.user_id
    or new.role is distinct from old.role
    or new.access_expires_at is distinct from old.access_expires_at then
    new.share_interior_layout := false;
  end if;
  return new;
end;
$$;
create trigger home_members_reset_interior_layout
before update of home_id, user_id, role, access_expires_at on public.home_members
for each row execute function public.reset_member_interior_layout();
revoke all on function public.reset_member_interior_layout() from public, anon, authenticated;

-- Arguments are the selected home, its target member, and the requested layout
-- consent. Only the authenticated canonical owner may change this single flag.
create or replace function public.set_member_interior_layout(
  target_home_id uuid,
  target_user_id uuid,
  share_layout boolean
) returns void language plpgsql security definer
set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
  target_member public.home_members%rowtype;
begin
  if actor_id is null or auth.role() is distinct from 'authenticated'
    or target_home_id is null or target_user_id is null then
    raise exception 'Home owner required to share the interior layout' using errcode = '42501';
  end if;
  -- Hold home ownership and target membership stable through the confirmed write.
  select h.owner_id into owner_id from public.homes h
    where h.id = target_home_id for share;
  if owner_id is distinct from actor_id then
    raise exception 'Home owner required to share the interior layout' using errcode = '42501';
  end if;
  if share_layout is null then
    raise exception 'Choose whether to share the interior layout' using errcode = '22023';
  end if;
  select * into target_member from public.home_members hm
    where hm.home_id = target_home_id and hm.user_id = target_user_id for update;
  if not found or target_member.role not in ('guest', 'tenant') then
    raise exception 'Choose a Guest or Tenant in this home' using errcode = '22023';
  end if;
  if share_layout and target_member.access_expires_at <= now() then
    raise exception 'Guest access has expired' using errcode = '22023';
  end if;
  update public.home_members set share_interior_layout = share_layout
    where home_id = target_home_id and user_id = target_user_id;
end;
$$;
revoke all on function public.set_member_interior_layout(uuid, uuid, boolean) from public, anon, service_role;
grant execute on function public.set_member_interior_layout(uuid, uuid, boolean) to authenticated;
