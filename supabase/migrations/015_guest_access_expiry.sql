-- Keep accepted guest access on a server-enforced deadline. Existing members
-- retain permanent access; no scheduler or destructive membership cleanup is required.
alter table public.home_members add column if not exists access_expires_at timestamptz;
alter table public.home_invites add column if not exists access_expires_at timestamptz;
alter table public.home_members add constraint home_members_guest_expiry_only
  check (access_expires_at is null or role = 'guest');
alter table public.home_invites add constraint home_invites_guest_expiry_only
  check (access_expires_at is null or role = 'guest');

create or replace function public.can_access_home(hid uuid)
returns boolean language sql stable security definer
set search_path = '' set row_security = off as $$
  select exists (select 1 from public.homes h where h.id = hid and h.owner_id = auth.uid())
  or exists (select 1 from public.home_members hm where hm.home_id = hid and hm.user_id = auth.uid()
    and (hm.access_expires_at is null or hm.access_expires_at > now()));
$$;

create or replace function public.can_access_room(rid uuid)
returns boolean language sql stable security definer
set search_path = '' set row_security = off as $$
  select exists (select 1 from public.rooms r where r.id = rid and (
    public.can_access_home_full(r.home_id) or exists (
      select 1 from public.room_members rm
      join public.home_members hm on hm.home_id = r.home_id and hm.user_id = rm.user_id
      where rm.room_id = r.id and rm.user_id = auth.uid()
        and (hm.access_expires_at is null or hm.access_expires_at > now())
    )
  ));
$$;

-- Both direct device commands and service-role voice commands call this function.
-- Explicit Allow overrides cannot revive an expired household membership.
create or replace function public.effective_member_has_action_permission(
  target_home_id uuid, target_user_id uuid, requested_permission text
)
returns boolean language sql stable security definer
set search_path = '' set row_security = off as $$
  select coalesce((select case when hm.role = 'owner' then true
    else coalesce(mpo.allowed, public.role_has_action_permission(hm.role, requested_permission)) end
    from public.home_members hm left join public.member_permission_overrides mpo
      on mpo.home_id = hm.home_id and mpo.user_id = hm.user_id and mpo.permission = requested_permission
    where hm.home_id = target_home_id and hm.user_id = target_user_id
      and (hm.access_expires_at is null or hm.access_expires_at > now())
      and (target_user_id = auth.uid() or public.can_manage_home(target_home_id) or auth.role() = 'service_role')
  ), false);
$$;

-- A return-column addition needs drop/create; keep the recipient-only grants explicit.
drop function public.list_my_home_invitations();
create function public.list_my_home_invitations()
returns table (id uuid, home_id uuid, home_name text, email text, invited_user_id uuid,
  role text, room_ids uuid[], status text, created_at timestamptz, expires_at timestamptz,
  access_expires_at timestamptz)
language sql stable security definer set search_path = '' set row_security = off as $$
  select invitation.id, invitation.home_id, home.name,
    lower(btrim(invitation.email)), invitation.invited_user_id,
    invitation.role, invitation.room_ids, invitation.status,
    invitation.created_at, invitation.expires_at, invitation.access_expires_at
  from public.home_invites invitation join public.homes home on home.id = invitation.home_id
  join auth.users recipient on recipient.id = auth.uid()
  where recipient.email_confirmed_at is not null
    and lower(btrim(invitation.email)) = lower(btrim(recipient.email))
    and (invitation.invited_user_id is null or invitation.invited_user_id = recipient.id)
    and invitation.status = 'pending'
  order by invitation.created_at desc, invitation.id;
$$;

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
  if response_action not in ('accept', 'decline') then raise exception 'Invalid invite action'; end if;
  select lower(btrim(email)) into current_email from auth.users
    where id = auth.uid() and email_confirmed_at is not null;
  if current_email is null then raise exception 'Verify your account email'; end if;
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
    -- overwrite active membership or resurrect old room/permission overrides.
    insert into public.home_members(home_id, user_id, role, access_expires_at)
    values (invite_row.home_id, auth.uid(), invite_row.role, invite_row.access_expires_at)
    on conflict (home_id, user_id) do update set role = excluded.role, access_expires_at = excluded.access_expires_at
      where home_members.role = 'guest' and home_members.access_expires_at <= now()
    returning user_id into accepted_user_id;
    if accepted_user_id is null then raise exception 'Already a member'; end if;
    delete from public.room_members rm using public.rooms r
      where rm.room_id = r.id and r.home_id = invite_row.home_id and rm.user_id = auth.uid();
    delete from public.member_permission_overrides where home_id = invite_row.home_id and user_id = auth.uid();
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

revoke all on function public.can_access_home(uuid), public.can_access_room(uuid),
  public.effective_member_has_action_permission(uuid, uuid, text), public.list_my_home_invitations(),
  public.respond_home_invite(uuid, text) from public, anon;
grant execute on function public.can_access_home(uuid), public.can_access_room(uuid),
  public.effective_member_has_action_permission(uuid, uuid, text), public.list_my_home_invitations(),
  public.respond_home_invite(uuid, text) to authenticated;
grant execute on function public.effective_member_has_action_permission(uuid, uuid, text) to service_role;
