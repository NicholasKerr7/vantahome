-- Membership admission and replacement must go through checked operations.
-- Revoke both table and column privileges: 019 granted the latter explicitly.
revoke insert, update, delete on public.home_members from public, anon, authenticated;
revoke insert (home_id, user_id, role, created_at, access_expires_at, share_interior_layout),
  update (home_id, user_id, role, created_at, access_expires_at, share_interior_layout)
  on public.home_members from public, anon, authenticated;
drop policy if exists home_members_insert on public.home_members;
drop policy if exists home_members_update on public.home_members;
drop policy if exists home_members_delete on public.home_members;

/** Return the closed permission vocabulary used by every delegation operation. */
create or replace function public.membership_action_permissions()
returns text[] language sql immutable set search_path = '' as $$
  select array['device.view','device.control','appliance.control','stove.control','safety.control',
    'light.control','climate.control','camera.live','camera.history','camera.manage',
    'lock.unlock','garage.open','alarm.arm','alarm.disarm','automation.manage','member.invite'];
$$;
revoke all on function public.membership_action_permissions() from public, anon;
grant execute on function public.membership_action_permissions() to authenticated;

/** Authorize the actor and serialize checked policy writes within one household. */
create or replace function public.lock_home_membership_management(target_home_id uuid)
returns void language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not public.can_manage_home(target_home_id) then
    raise exception 'Household administration required' using errcode = '42501';
  end if;
  -- Consistent home-first ordering avoids a role/override change racing delegation.
  perform 1 from public.homes where id = target_home_id for update;
  if not public.can_manage_home(target_home_id) then
    raise exception 'Household administration required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.lock_home_membership_management(uuid) from public, anon, authenticated, service_role;

/** Reset and set share the same explicit authority check, even when no row exists. */
create or replace function public.set_member_permission_override(
  target_home_id uuid, target_user_id uuid, requested_permission text, requested_allowed boolean
) returns boolean language plpgsql security definer set search_path = '' set row_security = off as $$
declare confirmed_allowed boolean;
begin
  perform public.lock_home_membership_management(target_home_id);
  if requested_permission is null or not requested_permission = any(public.membership_action_permissions()) then
    raise exception 'Permission is invalid' using errcode = '22023';
  end if;
  if not public.can_administer_member_permission(target_home_id, target_user_id, requested_permission)
    or not exists (select 1 from public.home_members where home_id = target_home_id and user_id = target_user_id)
    or exists (select 1 from public.homes where id = target_home_id and owner_id = target_user_id) then
    raise exception 'Permission change forbidden' using errcode = '42501';
  end if;
  if requested_allowed is null then
    delete from public.member_permission_overrides
      where home_id = target_home_id and user_id = target_user_id and permission = requested_permission;
  else
    insert into public.member_permission_overrides(home_id,user_id,permission,allowed,updated_by)
      values(target_home_id,target_user_id,requested_permission,requested_allowed,auth.uid())
      on conflict (home_id,user_id,permission) do update set allowed = excluded.allowed, updated_by = excluded.updated_by;
  end if;
  select allowed into confirmed_allowed from public.member_permission_overrides
    where home_id = target_home_id and user_id = target_user_id and permission = requested_permission;
  return confirmed_allowed;
end;
$$;
-- Prevent uncoordinated direct writes from racing checked delegation/reset.
revoke insert, update, delete on public.member_permission_overrides from public, anon, authenticated;

/** Removal cannot erase an Owner denial that this administrator could not reset. */
create or replace function public.remove_home_member(target_home_id uuid, target_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare removed_user_id uuid;
begin
  perform public.lock_home_membership_management(target_home_id);
  if not public.can_administer_member(target_home_id, target_user_id)
    or not public.effective_member_has_action_permission(target_home_id, auth.uid(), 'member.invite')
    or exists (select 1 from public.homes where id = target_home_id and owner_id = target_user_id)
    or (not public.is_home_owner(target_home_id) and exists (
      select 1 from public.member_permission_overrides where home_id = target_home_id and user_id = target_user_id
        and not allowed and not public.effective_member_has_action_permission(target_home_id, auth.uid(), permission)
    )) then
    raise exception 'Ask the home owner to remove this member' using errcode = '42501';
  end if;
  delete from public.home_members where home_id = target_home_id and user_id = target_user_id
    returning user_id into removed_user_id;
  if removed_user_id is null then raise exception 'Member not found' using errcode = '22023'; end if;
  return removed_user_id;
end;
$$;

/** Change role without replacing explicit action denials or silently renewing access. */
create or replace function public.set_home_member_role(target_home_id uuid, target_user_id uuid, requested_role text)
returns text language plpgsql security definer set search_path = '' set row_security = off as $$
declare target_member public.home_members%rowtype;
begin
  perform public.lock_home_membership_management(target_home_id);
  if requested_role is null or requested_role not in ('admin','member','guest','tenant') then
    raise exception 'Role is invalid' using errcode = '22023';
  end if;
  if not public.can_administer_member(target_home_id,target_user_id)
    or not public.effective_member_has_action_permission(target_home_id,auth.uid(),'member.invite')
    or exists (select 1 from public.homes where id = target_home_id and owner_id = target_user_id)
    or (requested_role = 'admin' and not public.is_home_owner(target_home_id)) then
    raise exception 'Role change forbidden' using errcode = '42501';
  end if;
  select * into target_member from public.home_members where home_id = target_home_id and user_id = target_user_id;
  if not found then raise exception 'Member not found' using errcode = '22023'; end if;
  if target_member.access_expires_at is not null and requested_role <> 'guest' then
    raise exception 'Use a new invitation to replace finite Guest access' using errcode = '22023';
  end if;
  if not public.is_home_owner(target_home_id) and exists (
    select 1 from unnest(public.membership_action_permissions()) requested(permission)
    left join public.member_permission_overrides existing
      on existing.home_id = target_home_id and existing.user_id = target_user_id and existing.permission = requested.permission
    where coalesce(existing.allowed,public.role_has_action_permission(requested_role,requested.permission))
      and not public.effective_member_has_action_permission(target_home_id,auth.uid(),requested.permission)
  ) then raise exception 'Cannot delegate protected permissions' using errcode = '42501'; end if;
  update public.home_members set role = requested_role where home_id = target_home_id and user_id = target_user_id;
  return requested_role;
end;
$$;

/** Preflight invitation roles before external email delivery; record rechecks under lock. */
create or replace function public.can_delegate_home_role(target_home_id uuid, requested_role text)
returns boolean language sql stable security definer set search_path = '' set row_security = off as $$
  select auth.role() = 'authenticated' and public.can_manage_home(target_home_id)
    and requested_role in ('admin','member','guest','tenant')
    and public.effective_member_has_action_permission(target_home_id,auth.uid(),'member.invite')
    and (public.is_home_owner(target_home_id) or (requested_role <> 'admin' and not exists (
      select 1 from unnest(public.membership_action_permissions()) permission
      where public.role_has_action_permission(requested_role,permission)
        and not public.effective_member_has_action_permission(target_home_id,auth.uid(),permission)
    )));
$$;
revoke all on function public.can_delegate_home_role(uuid,text) from public, anon, service_role;
grant execute on function public.can_delegate_home_role(uuid,text) to authenticated;

/** Record invitations with the authenticated actor's current delegation authority. */
create or replace function public.record_home_invitation(
  target_home_id uuid, target_user_id uuid, recipient_email text, requested_role text,
  requested_room_ids uuid[], requested_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare invite_id uuid;
begin
  perform public.lock_home_membership_management(target_home_id);
  if requested_role is null or requested_role not in ('admin','member','guest','tenant')
    or target_user_id is null or recipient_email is null
    or not exists (select 1 from auth.users where id = target_user_id and lower(btrim(email)) = lower(btrim(recipient_email)))
    or requested_room_ids is null or cardinality(requested_room_ids) > 500
    or array_position(requested_room_ids, null) is not null
    or cardinality(requested_room_ids) <> (select count(distinct room_id) from unnest(requested_room_ids) room_id)
    or (requested_role in ('guest','tenant') and cardinality(requested_room_ids) = 0)
    or exists (select 1 from unnest(requested_room_ids) room_id where not exists
      (select 1 from public.rooms where id = room_id and home_id = target_home_id))
    or (requested_expires_at is not null and (requested_role <> 'guest' or not isfinite(requested_expires_at)
      or requested_expires_at <= now() or requested_expires_at > now() + interval '30 days')) then
    raise exception 'Invitation access is invalid' using errcode = '22023';
  end if;
  if not coalesce(public.can_delegate_home_role(target_home_id,requested_role),false) then
    raise exception 'Cannot delegate protected permissions' using errcode = '42501';
  end if;
  if exists (select 1 from public.home_members where home_id = target_home_id and user_id = target_user_id
    and (role <> 'guest' or access_expires_at is null or access_expires_at > now())) then
    raise exception 'Already a member' using errcode = '22023';
  end if;
  insert into public.home_invites(home_id,email,invited_user_id,role,room_ids,access_expires_at,status)
    values(target_home_id,lower(btrim(recipient_email)),target_user_id,requested_role,requested_room_ids,requested_expires_at,'pending')
    on conflict (home_id,email) do update set invited_user_id = excluded.invited_user_id, role = excluded.role,
      room_ids = excluded.room_ids, access_expires_at = excluded.access_expires_at,
      status = 'pending', expires_at = now() + interval '7 days', responded_at = null
    returning id into invite_id;
  return invite_id;
end;
$$;

revoke all on function public.set_member_permission_override(uuid,uuid,text,boolean),
  public.remove_home_member(uuid,uuid), public.set_home_member_role(uuid,uuid,text),
  public.record_home_invitation(uuid,uuid,text,text,uuid[],timestamptz) from public, anon, service_role;
grant execute on function public.set_member_permission_override(uuid,uuid,text,boolean),
  public.remove_home_member(uuid,uuid), public.set_home_member_role(uuid,uuid,text),
  public.record_home_invitation(uuid,uuid,text,text,uuid[],timestamptz) to authenticated;

-- Replacing an expired Guest must not discard Owner-imposed action denials.
create or replace function public.respond_home_invite(target_invite_id uuid, response_action text)
returns text language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  invite_row public.home_invites%rowtype;
  current_email text;
  assigned_room_id uuid;
  next_status text;
  accepted_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if response_action is null or response_action not in ('accept', 'decline') then raise exception 'Invalid invite action'; end if;
  select lower(btrim(email)) into current_email from auth.users
    where id = auth.uid() and email_confirmed_at is not null;
  if current_email is null then raise exception 'Verify your account email'; end if;
  -- Match management and renewal's home-before-invitation lock ordering.
  perform 1 from public.homes h join public.home_invites hi on hi.home_id = h.id
    where hi.id = target_invite_id and lower(btrim(hi.email)) = current_email
      and (hi.invited_user_id is null or hi.invited_user_id = auth.uid()) for update of h;
  select * into invite_row from public.home_invites where id = target_invite_id for update;
  if not found then raise exception 'Invite not found'; end if;
  if invite_row.status <> 'pending' then raise exception 'Invite already processed'; end if;
  if invite_row.invited_user_id is not null and invite_row.invited_user_id <> auth.uid() then raise exception 'Forbidden'; end if;
  if lower(btrim(invite_row.email)) <> current_email then raise exception 'Forbidden'; end if;
  if response_action = 'accept' and invite_row.expires_at <= now() then raise exception 'Invite expired'; end if;
  if response_action = 'accept' and invite_row.access_expires_at <= now() then raise exception 'Guest access expired'; end if;

  if response_action = 'accept' and invite_row.role in ('guest', 'tenant') and (
    cardinality(invite_row.room_ids) = 0 or exists (
      select 1 from unnest(invite_row.room_ids) room_id where not exists (
        select 1 from public.rooms r where r.id = room_id and r.home_id = invite_row.home_id
      )
    )
  ) then raise exception 'Invited room access is no longer available'; end if;

  next_status := case when response_action = 'accept' then 'accepted' else 'declined' end;
  if response_action = 'accept' then
    -- A deliberate new invitation may replace an expired guest grant. It cannot
    -- overwrite active membership or resurrect old room/Allow grants. Explicit
    -- denials survive replacement until an authorized administrator resets them.
    insert into public.home_members(home_id, user_id, role, access_expires_at)
    values (invite_row.home_id, auth.uid(), invite_row.role, invite_row.access_expires_at)
    on conflict (home_id, user_id) do update set role = excluded.role, access_expires_at = excluded.access_expires_at
      where home_members.role = 'guest' and home_members.access_expires_at <= now()
    returning user_id into accepted_user_id;
    if accepted_user_id is null then raise exception 'Already a member'; end if;
    delete from public.room_members rm using public.rooms r
      where rm.room_id = r.id and r.home_id = invite_row.home_id and rm.user_id = auth.uid();
    delete from public.member_permission_overrides where home_id = invite_row.home_id and user_id = auth.uid() and allowed;
    if invite_row.role in ('member', 'guest', 'tenant') then
      foreach assigned_room_id in array invite_row.room_ids loop
        if exists (select 1 from public.rooms r where r.id = assigned_room_id and r.home_id = invite_row.home_id) then
          insert into public.room_members(room_id, user_id, role)
          values (assigned_room_id, auth.uid(), invite_row.role);
        end if;
      end loop;
    end if;
  end if;
  update public.home_invites set status = next_status,
    invited_user_id = coalesce(invited_user_id, auth.uid()), responded_at = now()
    where id = target_invite_id;
  return next_status;
end;
$$;

-- Room membership is the other membership-write surface. Checked removal and
-- invitation admission remain privileged operations; direct client writes close.
revoke insert, update, delete on public.room_members from public, anon, authenticated;
drop policy if exists room_members_insert on public.room_members;
drop policy if exists room_members_update on public.room_members;
drop policy if exists room_members_delete on public.room_members;

create or replace function public.set_home_room_memberships(
  target_home_id uuid,
  target_user_id uuid,
  target_room_ids uuid[]
) returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare target_role text;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' or target_home_id is null or target_user_id is null then
    raise exception 'Household administration required' using errcode = '42501';
  end if;
  -- Keep owner and membership authority stable until the complete replacement
  -- commits; deterministic member order also serializes simultaneous grant edits.
  perform 1 from public.homes h where h.id = target_home_id for update;
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
  -- Removing grants never expands authority. New scoped rooms delegate every
  -- action the target could use there, including explicit Allow overrides.
  if not public.is_home_owner(target_home_id) and target_role in ('guest','tenant') and exists (
    select 1 from unnest(target_room_ids) requested_room(room_id) where not exists (
      select 1 from public.room_members rm where rm.room_id = requested_room.room_id and rm.user_id = target_user_id
    )
  ) and (
    not public.effective_member_has_action_permission(target_home_id,auth.uid(),'member.invite')
    or exists (
      select 1 from unnest(public.membership_action_permissions()) requested(permission)
      left join public.member_permission_overrides target_override
        on target_override.home_id = target_home_id and target_override.user_id = target_user_id
        and target_override.permission = requested.permission
      where coalesce(target_override.allowed,public.role_has_action_permission(target_role,requested.permission))
        and not public.effective_member_has_action_permission(target_home_id,auth.uid(),requested.permission)
    )
  ) then raise exception 'Cannot delegate protected room permissions' using errcode = '42501'; end if;
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
