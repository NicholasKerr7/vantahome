-- A home/email pair reuses its invitation ID. Track each change so a stale
-- cancellation cannot revoke a replacement invitation reviewed in another session.
alter table public.home_invites add column management_revision bigint not null default 1
  check (management_revision > 0);

/** Advance the opaque receipt for every lifecycle or access change. */
create or replace function public.advance_home_invitation_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Acceptance may have waited for the household lock after its transaction
  -- began. Check wall time at the final transition and roll back any admission.
  if old.status = 'pending' and new.status = 'accepted' then
    if old.expires_at <= clock_timestamp() then raise exception 'Invite expired'; end if;
    if old.access_expires_at <= clock_timestamp() then raise exception 'Guest access expired'; end if;
  end if;
  new.management_revision := old.management_revision + 1;
  return new;
end;
$$;
create trigger home_invites_advance_management_revision
before update on public.home_invites
for each row execute function public.advance_home_invitation_revision();
revoke all on function public.advance_home_invitation_revision() from public, anon, authenticated, service_role;

-- Recipients keep their existing inbox visibility. Household senders see only
-- roles they may currently delegate, including the effective invitation override.
drop policy if exists home_invites_select on public.home_invites;
create policy home_invites_select on public.home_invites for select using (
  public.can_delegate_home_role(home_invites.home_id, home_invites.role)
  or (
    lower(home_invites.email) = lower(auth.jwt() ->> 'email')
    and (home_invites.invited_user_id is null or home_invites.invited_user_id = auth.uid())
  )
);
revoke insert, update, delete on public.home_invites from public, anon, authenticated;
-- A table-level revocation does not clear independently granted column rights.
revoke insert (id, home_id, email, invited_user_id, role, room_ids, status, created_at,
  responded_at, expires_at, access_expires_at, management_revision),
  update (id, home_id, email, invited_user_id, role, room_ids, status, created_at,
  responded_at, expires_at, access_expires_at, management_revision)
on public.home_invites from public, anon, authenticated;

/** List pending rows with server-derived expiry; no recipient or sender grant is inferred locally. */
create or replace function public.list_sent_home_invitations(target_home_id uuid)
returns table (
  id uuid, home_id uuid, home_name text, email text, role text, room_ids uuid[],
  created_at timestamptz, expires_at timestamptz, access_expires_at timestamptz,
  revision text, status text, can_cancel boolean
) language plpgsql security definer set search_path = '' set row_security = off as $$
declare checked_at timestamptz;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or target_home_id is null or not public.can_manage_home(target_home_id) then
    raise exception 'Household invitation authority required' using errcode = '42501';
  end if;
  -- Compatible reads may share the home lock; writes/reissues/acceptance use
  -- the same home-first ordering and wait until this authorized snapshot finishes.
  perform 1 from public.homes h where h.id = target_home_id for share;
  if not public.can_manage_home(target_home_id)
    or not public.effective_member_has_action_permission(target_home_id,auth.uid(),'member.invite') then
    raise exception 'Household invitation authority required' using errcode = '42501';
  end if;
  checked_at := clock_timestamp();
  return query
    select hi.id, hi.home_id, h.name, lower(btrim(hi.email)), hi.role, hi.room_ids,
      hi.created_at, hi.expires_at, hi.access_expires_at, hi.management_revision::text,
      case when hi.expires_at <= checked_at or hi.access_expires_at <= checked_at
        then 'expired' else 'pending' end,
      not (hi.expires_at <= checked_at or coalesce(hi.access_expires_at <= checked_at,false))
    from public.home_invites hi join public.homes h on h.id = hi.home_id
    where hi.home_id = target_home_id and hi.status = 'pending'
      and public.can_delegate_home_role(target_home_id,hi.role)
    order by hi.created_at desc, hi.id
    limit 100;
end;
$$;

/** Cancel only the reviewed pending generation; never alter an already-admitted household member. */
create or replace function public.cancel_sent_home_invitation(
  target_home_id uuid, target_invite_id uuid, expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  invitation public.home_invites%rowtype;
  effective_status text;
begin
  perform public.lock_home_membership_management(target_home_id);
  if target_invite_id is null or expected_revision is null or expected_revision < 1 then
    raise exception 'Choose a current invitation' using errcode = '22023';
  end if;
  if not public.effective_member_has_action_permission(target_home_id,auth.uid(),'member.invite') then
    raise exception 'Household invitation authority required' using errcode = '42501';
  end if;
  select * into invitation from public.home_invites hi
    where hi.id = target_invite_id and hi.home_id = target_home_id for update;
  if not found or not coalesce(public.can_delegate_home_role(target_home_id,invitation.role),false) then
    raise exception 'Invitation unavailable for this household authority' using errcode = '42501';
  end if;
  -- A terminal result is safe and useful when acceptance, decline or cancellation
  -- won the home lock. It must never be presented as a successful new revocation.
  effective_status := invitation.status;
  if invitation.status = 'pending' then
    if invitation.management_revision <> expected_revision then
      raise exception 'Invitation changed. Refresh sent invitations' using errcode = '22023';
    end if;
    -- Read wall time after locks: waiting cannot turn an expired invitation into
    -- a successful cancellation or an active home grant.
    if invitation.expires_at <= clock_timestamp() or invitation.access_expires_at <= clock_timestamp() then
      effective_status := 'expired';
    else
      update public.home_invites hi set status = 'cancelled', responded_at = clock_timestamp()
        where hi.id = invitation.id returning * into invitation;
      effective_status := invitation.status;
    end if;
  end if;
  return jsonb_build_object('id',invitation.id,'home_id',invitation.home_id,
    'status',effective_status,'revision',invitation.management_revision::text);
end;
$$;
comment on function public.cancel_sent_home_invitation(uuid,uuid,bigint) is
  'Revokes only an unexpired pending invitation generation. Existing memberships and Auth sign-in links remain unchanged; cancelled invitations cannot be accepted.';
revoke all on function public.list_sent_home_invitations(uuid),
  public.cancel_sent_home_invitation(uuid,uuid,bigint) from public, anon, service_role;
grant execute on function public.list_sent_home_invitations(uuid),
  public.cancel_sent_home_invitation(uuid,uuid,bigint) to authenticated;
