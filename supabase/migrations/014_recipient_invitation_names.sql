-- Let recipients identify their invited property without opening the homes registry to non-members.
create index if not exists home_invites_pending_recipient_email_idx
  on public.home_invites (lower(btrim(email))) where status = 'pending';

create or replace function public.list_my_home_invitations()
returns table (
  id uuid,
  home_id uuid,
  home_name text,
  email text,
  invited_user_id uuid,
  role text,
  room_ids uuid[],
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql stable security definer
set search_path = ''
set row_security = off
as $$
  select invitation.id, invitation.home_id, home.name,
    lower(btrim(invitation.email)), invitation.invited_user_id,
    invitation.role, invitation.room_ids, invitation.status,
    invitation.created_at, invitation.expires_at
  from public.home_invites as invitation
  join public.homes as home on home.id = invitation.home_id
  join auth.users as recipient on recipient.id = auth.uid()
  where recipient.email_confirmed_at is not null
    and lower(btrim(invitation.email)) = lower(btrim(recipient.email))
    and (invitation.invited_user_id is null or invitation.invited_user_id = recipient.id)
    and invitation.status = 'pending'
  -- Expired invitations remain visible for a deliberate decline; acceptance checks expiry transactionally.
  order by invitation.created_at desc, invitation.id;
$$;

comment on function public.list_my_home_invitations() is
  'Own pending household invitations and property names, bound to the current confirmed Auth email; no membership is granted.';
revoke all on function public.list_my_home_invitations() from public, anon;
grant execute on function public.list_my_home_invitations() to authenticated;

-- Expiry blocks joining, while the verified recipient can still clear a stale invitation from their inbox.
create or replace function public.respond_home_invite(target_invite_id uuid, response_action text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  invite_row public.home_invites%rowtype;
  current_email text;
  assigned_room_id uuid;
  next_status text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if response_action not in ('accept', 'decline') then raise exception 'Invalid invite action'; end if;

  select lower(coalesce(auth.jwt() ->> 'email', '')) into current_email;
  select * into invite_row from public.home_invites where id = target_invite_id for update;
  if not found then raise exception 'Invite not found'; end if;
  if invite_row.status <> 'pending' then raise exception 'Invite already processed'; end if;
  if invite_row.invited_user_id is not null and invite_row.invited_user_id <> auth.uid() then raise exception 'Forbidden'; end if;
  if lower(invite_row.email) <> current_email then raise exception 'Forbidden'; end if;
  if response_action = 'accept' and invite_row.expires_at <= now() then raise exception 'Invite expired'; end if;

  next_status := case when response_action = 'accept' then 'accepted' else 'declined' end;
  if response_action = 'accept' then
    insert into public.home_members(home_id, user_id, role)
    values (invite_row.home_id, auth.uid(), invite_row.role)
    on conflict (home_id, user_id) do nothing;

    if invite_row.role in ('member', 'guest', 'tenant') then
      foreach assigned_room_id in array invite_row.room_ids loop
        if exists (select 1 from public.rooms as room where room.id = assigned_room_id and room.home_id = invite_row.home_id) then
          insert into public.room_members(room_id, user_id, role)
          values (assigned_room_id, auth.uid(), invite_row.role)
          on conflict (room_id, user_id) do update set role = excluded.role;
        end if;
      end loop;
    end if;
  end if;

  update public.home_invites
  set status = next_status, invited_user_id = coalesce(invited_user_id, auth.uid()), responded_at = now()
  where id = target_invite_id;
  return next_status;
end;
$$;

revoke all on function public.respond_home_invite(uuid, text) from public, anon;
grant execute on function public.respond_home_invite(uuid, text) to authenticated;
