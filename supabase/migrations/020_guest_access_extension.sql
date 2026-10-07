-- Guest deadlines change through a checked, compare-and-swap operation. Keep
-- ordinary role/identity writes and invitation inserts at their existing scope.
revoke update (access_expires_at) on public.home_members from public, anon, authenticated;

/** Extend an existing finite Guest grant without replacing its rooms or actions. */
create or replace function public.extend_guest_access(
  target_home_id uuid,
  target_user_id uuid,
  expected_expires_at timestamptz,
  duration_hours integer default null,
  new_expires_at timestamptz default null
) returns timestamptz language plpgsql security definer
set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
  actor_role text;
  target_member public.home_members%rowtype;
  recipient_email text;
  pending_invite_ids uuid[];
  next_deadline timestamptz;
  deadline_base timestamptz;
begin
  if actor_id is null or auth.role() is distinct from 'authenticated'
    or target_home_id is null or target_user_id is null or target_user_id = actor_id then
    raise exception 'Household invitation authority required' using errcode = '42501';
  end if;
  select h.owner_id into owner_id from public.homes h
    where h.id = target_home_id for share;
  -- Check authority before looking up recipient data or locking their invitations.
  select hm.role into actor_role from public.home_members hm
    where hm.home_id = target_home_id and hm.user_id = actor_id;
  if (owner_id is distinct from actor_id and actor_role is distinct from 'admin')
    or not public.can_administer_member(target_home_id, target_user_id)
    or not public.effective_member_has_action_permission(target_home_id, actor_id, 'member.invite') then
    raise exception 'Household invitation authority required' using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into recipient_email from auth.users u
    where u.id = target_user_id and u.email_confirmed_at is not null;
  -- Acceptance locks invitations before membership. Use that same order so an
  -- in-flight acceptance either finishes first (and fails our expected deadline)
  -- or observes cancellation after this operation commits.
  select array_agg(invite.id order by invite.id) into pending_invite_ids from (
    select hi.id from public.home_invites hi
    where hi.home_id = target_home_id and hi.status = 'pending'
      and (hi.invited_user_id = target_user_id or (hi.invited_user_id is null
        and lower(btrim(hi.email)) = recipient_email))
    order by hi.id for update
  ) invite;
  perform 1 from public.home_members hm
    where hm.home_id = target_home_id and hm.user_id in (actor_id, target_user_id)
    order by hm.user_id for update;
  perform 1 from public.member_permission_overrides mpo
    where mpo.home_id = target_home_id and mpo.user_id in (actor_id, target_user_id)
    order by mpo.user_id, mpo.permission for share;
  select hm.role into actor_role from public.home_members hm
    where hm.home_id = target_home_id and hm.user_id = actor_id;
  if (owner_id is distinct from actor_id and actor_role is distinct from 'admin')
    or not public.can_administer_member(target_home_id, target_user_id)
    or not public.effective_member_has_action_permission(target_home_id, actor_id, 'member.invite') then
    raise exception 'Household invitation authority required' using errcode = '42501';
  end if;
  select * into target_member from public.home_members hm
    where hm.home_id = target_home_id and hm.user_id = target_user_id;
  if not found or target_member.role <> 'guest' or target_member.access_expires_at is null
    or not isfinite(target_member.access_expires_at) then
    raise exception 'Choose a Guest with a valid access deadline' using errcode = '22023';
  end if;
  if expected_expires_at is null or not isfinite(expected_expires_at)
    or expected_expires_at is distinct from target_member.access_expires_at then
    -- A stale reviewed deadline is a business validation error, not an engine
    -- serialization failure: PostgREST can retry SQLSTATE 40001 indefinitely.
    raise exception 'Guest access changed. Review the latest deadline' using errcode = '22023';
  end if;

  -- Prolonging or reviving a grant delegates its effective actions again. An
  -- Admin cannot extend powers the Owner has withheld from that administrator.
  if owner_id is distinct from actor_id and exists (
    select 1 from unnest(array[
      'device.view', 'device.control', 'appliance.control', 'stove.control',
      'safety.control', 'light.control', 'climate.control', 'camera.live',
      'camera.history', 'camera.manage', 'lock.unlock', 'garage.open',
      'alarm.arm', 'alarm.disarm', 'automation.manage', 'member.invite'
    ]) requested(permission)
    left join public.member_permission_overrides target_override
      on target_override.home_id = target_home_id and target_override.user_id = target_user_id
      and target_override.permission = requested.permission
    where coalesce(target_override.allowed, public.role_has_action_permission('guest', requested.permission))
      and not public.effective_member_has_action_permission(target_home_id, actor_id, requested.permission)
  ) then
    raise exception 'Ask the home owner to renew this Guest''s protected permissions' using errcode = '42501';
  end if;
  if (duration_hours is null) = (new_expires_at is null) then
    raise exception 'Choose a duration or a custom end date' using errcode = '22023';
  end if;
  if duration_hours is not null and duration_hours not in (1, 24, 168) then
    raise exception 'Choose 1 hour, 24 hours, or 7 days' using errcode = '22023';
  end if;
  deadline_base := greatest(now(), target_member.access_expires_at);
  next_deadline := coalesce(new_expires_at, deadline_base + make_interval(hours => duration_hours));
  if not isfinite(next_deadline) or next_deadline <= deadline_base then
    raise exception 'Choose an end date after now and the current access deadline' using errcode = '22023';
  end if;
  if next_deadline > now() + interval '365 days' then
    raise exception 'Choose an end date within the next 365 days' using errcode = '22023';
  end if;

  -- The existing membership trigger resets interior-layout consent. Room and
  -- action assignments are deliberately retained, including explicit denials.
  update public.home_members set access_expires_at = next_deadline
    where home_id = target_home_id and user_id = target_user_id;
  update public.home_invites set status = 'cancelled', responded_at = now()
    where id = any(pending_invite_ids) and status = 'pending';
  return next_deadline;
end;
$$;
comment on function public.extend_guest_access(uuid,uuid,timestamptz,integer,timestamptz) is
  'Extends or renews an existing finite Guest deadline using current household authority; preserves rooms/actions and resets optional interior consent.';
revoke all on function public.extend_guest_access(uuid,uuid,timestamptz,integer,timestamptz)
  from public, anon, service_role;
grant execute on function public.extend_guest_access(uuid,uuid,timestamptz,integer,timestamptz)
  to authenticated;
