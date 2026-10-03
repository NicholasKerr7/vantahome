-- Replace one person's assignments in one home as a single operation. A person
-- may belong to several homes managed by the same owner; no other home is edited.
create or replace function public.set_home_room_memberships(
  target_home_id uuid,
  target_user_id uuid,
  target_room_ids uuid[]
) returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare target_role text;
begin
  if auth.uid() is null or target_home_id is null or target_user_id is null then
    raise exception 'Household administration required' using errcode = '42501';
  end if;
  -- Keep owner and membership authority stable until the complete replacement
  -- commits; deterministic member order also serializes simultaneous grant edits.
  perform 1 from public.homes h where h.id = target_home_id for share;
  perform 1 from public.home_members hm
    where hm.home_id = target_home_id and hm.user_id in (auth.uid(), target_user_id)
    order by hm.user_id for update;
  if not public.can_administer_member(target_home_id, target_user_id) then
    raise exception 'Household administration required' using errcode = '42501';
  end if;
  select hm.role into target_role from public.home_members hm
    where hm.home_id = target_home_id and hm.user_id = target_user_id;
  if target_role is null or target_role not in ('member', 'guest', 'tenant') then
    raise exception 'Choose a current room-assignable member' using errcode = '22023';
  end if;
  if target_room_ids is null or cardinality(target_room_ids) > 500
    or array_position(target_room_ids, null) is not null
    or cardinality(target_room_ids) <> (select count(distinct id) from unnest(target_room_ids) id) then
    raise exception 'Invalid room assignments' using errcode = '22023';
  end if;
  -- Lock validated rooms before writes so a concurrent move or removal cannot
  -- change their home while the replacement transaction is using them.
  perform 1 from public.rooms r where r.home_id = target_home_id and r.id = any(target_room_ids)
    order by r.id for share;
  if (select count(*) from public.rooms r where r.home_id = target_home_id and r.id = any(target_room_ids))
    <> cardinality(target_room_ids) then
    raise exception 'Every room must belong to the selected home' using errcode = '22023';
  end if;
  delete from public.room_members rm using public.rooms r
    where rm.room_id = r.id and r.home_id = target_home_id and rm.user_id = target_user_id
      and not (rm.room_id = any(target_room_ids));
  insert into public.room_members(room_id, user_id, role)
    select id, target_user_id, target_role from unnest(target_room_ids) id
    on conflict (room_id, user_id) do update set role = excluded.role;
end;
$$;
revoke all on function public.set_home_room_memberships(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_home_room_memberships(uuid, uuid, uuid[]) to authenticated;
