-- Sprint 2: action-level authorization, durable command envelopes, and
-- transactional invitation acceptance.

alter table home_invites
  add column if not exists expires_at timestamptz not null
  default (now() + interval '7 days');

-- A household admin may manage members but cannot create, demote, or remove the
-- canonical home owner through direct table writes.
drop policy if exists home_members_insert on home_members;
create policy home_members_insert
on home_members
for insert
with check (
  can_manage_home(home_id)
  and (
    role <> 'owner'
    or exists (
      select 1 from homes h
      where h.id = home_id and h.owner_id = auth.uid()
    )
  )
);

drop policy if exists home_members_update on home_members;
create policy home_members_update
on home_members
for update
using (
  can_manage_home(home_id)
  and (
    user_id <> (select h.owner_id from homes h where h.id = home_id)
    or auth.uid() = (select h.owner_id from homes h where h.id = home_id)
  )
)
with check (
  can_manage_home(home_id)
  and (
    role <> 'owner'
    or auth.uid() = (select h.owner_id from homes h where h.id = home_id)
  )
);

drop policy if exists home_members_delete on home_members;
create policy home_members_delete
on home_members
for delete
using (
  can_manage_home(home_id)
  and (
    user_id <> (select h.owner_id from homes h where h.id = home_id)
    or auth.uid() = (select h.owner_id from homes h where h.id = home_id)
  )
);

create or replace function role_has_action_permission(
  member_role text,
  requested_permission text
)
returns boolean
language sql
immutable
as $$
  select case member_role
    when 'owner' then true
    when 'admin' then true
    when 'member' then requested_permission = any(array[
      'device.view', 'device.control', 'appliance.control',
      'light.control', 'climate.control',
      'camera.live', 'camera.history', 'automation.manage'
    ])
    when 'guest' then requested_permission = any(array[
      'device.view', 'light.control', 'climate.control'
    ])
    when 'tenant' then requested_permission = any(array[
      'device.view', 'device.control', 'light.control', 'climate.control'
    ])
    else false
  end;
$$;

create or replace function permission_for_device_command(
  device_kind text,
  command_action text,
  command_payload jsonb
)
returns text
language sql
immutable
as $$
  select case
    when device_kind = 'light' then 'light.control'
    when device_kind = 'ac' then 'climate.control'
    when device_kind = 'camera' then 'camera.manage'
    when device_kind in ('stove', 'microwave') then 'stove.control'
    when device_kind in ('smoke', 'water') then 'safety.control'
    when device_kind in (
      'coffee', 'fridge', 'washer', 'dryer', 'dishwasher',
      'water-heater', 'sprinkler'
    ) then 'appliance.control'
    when device_kind = 'door'
      and (
        command_action = 'toggle'
        or (
          command_action = 'set-properties'
          and case
            when jsonb_typeof(command_payload #> '{changes,openPercent}') = 'number'
              then (command_payload #>> '{changes,openPercent}')::numeric > 0
            else false
          end
        )
      )
      then 'lock.unlock'
    when device_kind in ('garage', 'gate')
      and (
        command_action = 'toggle'
        or (
          command_action = 'set-properties'
          and case
            when jsonb_typeof(command_payload #> '{changes,openPercent}') = 'number'
              then (command_payload #>> '{changes,openPercent}')::numeric > 0
            else false
          end
        )
      )
      then 'garage.open'
    else 'device.control'
  end;
$$;

create or replace function can_perform_device_action(
  target_device_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from devices d
    join home_members hm
      on hm.home_id = d.home_id
     and hm.user_id = auth.uid()
    where d.id = target_device_id
      and role_has_action_permission(hm.role, requested_permission)
      and (
        hm.role in ('owner', 'admin', 'member')
        or exists (
          select 1
          from room_members rm
          where rm.room_id = d.room_id
            and rm.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function can_perform_device_action(uuid, text) from public;
grant execute on function can_perform_device_action(uuid, text) to authenticated;

create table if not exists device_commands (
  id uuid primary key default gen_random_uuid(),
  command_id text not null,
  home_id uuid not null references homes(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  nonce text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'created' check (status in (
    'created', 'authorized', 'dispatched', 'bridge_accepted',
    'integration_sent', 'physical_observed', 'confirmed', 'rejected',
    'expired', 'timed_out', 'device_unavailable', 'unsupported',
    'permission_denied', 'partially_completed'
  )),
  constraint device_commands_lifetime_check check (
    expires_at > created_at and expires_at <= created_at + interval '60 seconds'
  ),
  constraint device_commands_payload_action_check check (
    payload ->> 'op' = action
  ),
  constraint device_commands_payload_device_check check (
    payload ->> 'deviceId' = device_id::text
  ),
  unique (home_id, command_id),
  unique (home_id, actor_user_id, nonce),
  unique (home_id, actor_user_id, idempotency_key)
);

create index if not exists device_commands_dispatch_idx
on device_commands(home_id, status, created_at);

alter table device_commands enable row level security;
revoke all on device_commands from anon;
grant select, insert on device_commands to authenticated;

drop policy if exists device_commands_select on device_commands;
create policy device_commands_select
on device_commands
for select
using (
  actor_user_id = auth.uid()
  or can_manage_home(home_id)
);

drop policy if exists device_commands_insert on device_commands;
create policy device_commands_insert
on device_commands
for insert
with check (
  actor_user_id = auth.uid()
  and created_at >= now() - interval '30 seconds'
  and created_at <= now() + interval '5 seconds'
  and expires_at > now()
  and expires_at <= now() + interval '60 seconds'
  and home_id = (select d.home_id from devices d where d.id = device_id)
  and command_id = payload ->> 'commandId'
  and nonce = payload ->> 'nonce'
  and idempotency_key = payload ->> 'idempotencyKey'
  and can_perform_device_action(
    device_id,
    permission_for_device_command(
      (select d.kind from devices d where d.id = device_id),
      action,
      payload
    )
  )
  and (
    select count(*) < 120
    from device_commands recent
    where recent.actor_user_id = auth.uid()
      and recent.created_at > now() - interval '1 minute'
  )
);

-- Clients request commands; only the trusted bridge/service role advances them.
revoke update, delete on device_commands from authenticated;

-- Flexible state JSON is an observation sink, not a client command surface.
drop policy if exists device_state_insert on device_state;
drop policy if exists device_state_update on device_state;
drop policy if exists device_state_delete on device_state;

create or replace function respond_home_invite(
  target_invite_id uuid,
  response_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row home_invites%rowtype;
  current_email text;
  room_id uuid;
  next_status text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if response_action not in ('accept', 'decline') then
    raise exception 'Invalid invite action';
  end if;

  select lower(coalesce(auth.jwt() ->> 'email', '')) into current_email;
  select * into invite_row
  from home_invites
  where id = target_invite_id
  for update;

  if not found then raise exception 'Invite not found'; end if;
  if invite_row.status <> 'pending' then raise exception 'Invite already processed'; end if;
  if invite_row.expires_at <= now() then raise exception 'Invite expired'; end if;
  if invite_row.invited_user_id is not null
     and invite_row.invited_user_id <> auth.uid() then
    raise exception 'Forbidden';
  end if;
  if lower(invite_row.email) <> current_email then raise exception 'Forbidden'; end if;

  next_status := case when response_action = 'accept' then 'accepted' else 'declined' end;
  if response_action = 'accept' then
    insert into home_members(home_id, user_id, role)
    values (invite_row.home_id, auth.uid(), invite_row.role)
    on conflict (home_id, user_id) do nothing;

    if invite_row.role in ('member', 'guest', 'tenant') then
      foreach room_id in array invite_row.room_ids loop
        if exists (
          select 1 from rooms r
          where r.id = room_id and r.home_id = invite_row.home_id
        ) then
          insert into room_members(room_id, user_id, role)
          values (room_id, auth.uid(), invite_row.role)
          on conflict (room_id, user_id) do update set role = excluded.role;
        end if;
      end loop;
    end if;
  end if;

  update home_invites
  set status = next_status,
      invited_user_id = coalesce(invited_user_id, auth.uid()),
      responded_at = now()
  where id = target_invite_id;

  return next_status;
end;
$$;

revoke all on function respond_home_invite(uuid, text) from public;
grant execute on function respond_home_invite(uuid, text) to authenticated;

-- Invitees may read their invite but cannot mutate its status directly.
drop policy if exists home_invites_update on home_invites;
