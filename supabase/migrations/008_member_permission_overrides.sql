-- Sprint 2: explicit per-member action grants and denials.

create table if not exists member_permission_overrides (
  home_id uuid not null,
  user_id uuid not null,
  permission text not null check (permission in (
    'device.view', 'device.control', 'appliance.control', 'stove.control',
    'safety.control', 'light.control', 'climate.control', 'camera.live',
    'camera.history', 'camera.manage', 'lock.unlock', 'garage.open',
    'alarm.arm', 'alarm.disarm', 'automation.manage', 'member.invite'
  )),
  allowed boolean not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (home_id, user_id, permission),
  foreign key (home_id, user_id)
    references home_members(home_id, user_id) on delete cascade
);

create index if not exists idx_member_permission_overrides_user
  on member_permission_overrides(user_id);

drop trigger if exists member_permission_overrides_updated_at
  on member_permission_overrides;
create trigger member_permission_overrides_updated_at
before update on member_permission_overrides
for each row execute function set_updated_at();

alter table member_permission_overrides enable row level security;
revoke all on member_permission_overrides from anon;
grant select, insert, update, delete on member_permission_overrides
  to authenticated;

create policy member_permission_overrides_select
on member_permission_overrides
for select
using (user_id = auth.uid() or can_manage_home(home_id));

create policy member_permission_overrides_insert
on member_permission_overrides
for insert
with check (
  can_manage_home(home_id)
  and updated_by = auth.uid()
  and user_id <> (select h.owner_id from homes h where h.id = home_id)
);

create policy member_permission_overrides_update
on member_permission_overrides
for update
using (
  can_manage_home(home_id)
  and user_id <> (select h.owner_id from homes h where h.id = home_id)
)
with check (
  can_manage_home(home_id)
  and updated_by = auth.uid()
  and user_id <> (select h.owner_id from homes h where h.id = home_id)
);

create policy member_permission_overrides_delete
on member_permission_overrides
for delete
using (
  can_manage_home(home_id)
  and user_id <> (select h.owner_id from homes h where h.id = home_id)
);

create or replace function effective_member_has_action_permission(
  target_home_id uuid,
  target_user_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when hm.role = 'owner' then true
      else coalesce(
        mpo.allowed,
        role_has_action_permission(hm.role, requested_permission)
      )
    end
    from home_members hm
    left join member_permission_overrides mpo
      on mpo.home_id = hm.home_id
     and mpo.user_id = hm.user_id
     and mpo.permission = requested_permission
    where hm.home_id = target_home_id
      and hm.user_id = target_user_id
      and (
        target_user_id = auth.uid()
        or can_manage_home(target_home_id)
        or auth.role() = 'service_role'
      )
  ), false);
$$;

revoke all on function effective_member_has_action_permission(uuid, uuid, text)
  from public;
grant execute on function effective_member_has_action_permission(uuid, uuid, text)
  to authenticated, service_role;

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
      and effective_member_has_action_permission(
        d.home_id,
        hm.user_id,
        requested_permission
      )
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
grant execute on function can_perform_device_action(uuid, text)
  to authenticated;

drop policy if exists devices_select on devices;
create policy devices_select
on devices
for select
using (
  can_perform_device_action(id, 'device.view')
  and (kind <> 'camera' or can_perform_device_action(id, 'camera.live'))
);

drop policy if exists device_state_select on device_state;
create policy device_state_select
on device_state
for select
using (
  exists (
    select 1 from devices d
    where d.id = device_id
      and can_perform_device_action(d.id, 'device.view')
      and (
        d.kind <> 'camera'
        or can_perform_device_action(d.id, 'camera.live')
      )
  )
);

-- Voice authorization runs as service_role, so it must evaluate the target
-- user's effective grant explicitly instead of relying on auth.uid().
create or replace function voice_member_can_perform_device_action(
  target_user_id uuid,
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
     and hm.user_id = target_user_id
    where d.id = target_device_id
      and effective_member_has_action_permission(
        d.home_id,
        target_user_id,
        requested_permission
      )
      and (
        hm.role in ('owner', 'admin', 'member')
        or exists (
          select 1 from room_members rm
          where rm.room_id = d.room_id
            and rm.user_id = target_user_id
        )
      )
  );
$$;

revoke all on function voice_member_can_perform_device_action(uuid, uuid, text)
  from public;
grant execute on function voice_member_can_perform_device_action(uuid, uuid, text)
  to service_role;

create or replace function enqueue_voice_device_command(
  target_user_id uuid,
  target_device_id uuid,
  voice_source text,
  command_patch jsonb
)
returns table(command_id text, status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_device devices%rowtype;
  required_permission text;
  issued_at timestamptz := clock_timestamp();
  next_command_id text := gen_random_uuid()::text;
  next_nonce text := encode(gen_random_bytes(16), 'hex');
  next_payload jsonb;
begin
  if voice_source not in ('alexa', 'google') then
    raise exception 'Unsupported voice source';
  end if;
  if jsonb_typeof(command_patch) <> 'object'
     or command_patch = '{}'::jsonb
     or octet_length(command_patch::text) > 2048
     or exists (
       select 1
       from jsonb_object_keys(command_patch) as keys(key_name)
       where key_name not in ('isOn', 'brightness', 'tempC')
     ) then
    raise exception 'Invalid voice command';
  end if;

  select * into target_device from devices where id = target_device_id;
  if not found
     or target_device.kind not in ('light', 'ac', 'tv', 'fan', 'speaker') then
    raise exception 'Device is not voice controllable';
  end if;
  if command_patch ? 'isOn'
     and jsonb_typeof(command_patch -> 'isOn') <> 'boolean' then
    raise exception 'Invalid power value';
  end if;
  if command_patch ? 'brightness'
     and (
       target_device.kind <> 'light'
       or jsonb_typeof(command_patch -> 'brightness') <> 'number'
       or (command_patch ->> 'brightness')::numeric not between 0 and 100
     ) then
    raise exception 'Invalid brightness value';
  end if;
  if command_patch ? 'tempC'
     and (
       target_device.kind <> 'ac'
       or jsonb_typeof(command_patch -> 'tempC') <> 'number'
       or (command_patch ->> 'tempC')::numeric not between 10 and 35
     ) then
    raise exception 'Invalid temperature value';
  end if;

  required_permission := permission_for_device_command(
    target_device.kind,
    'set-properties',
    jsonb_build_object('changes', command_patch)
  );
  if not voice_member_can_perform_device_action(
    target_user_id,
    target_device_id,
    required_permission
  ) then
    raise exception 'Voice command forbidden';
  end if;

  if (select count(*) from device_commands dc
      where dc.actor_user_id = target_user_id
        and dc.created_at > issued_at - interval '1 minute') >= 120
     or (select count(*) from device_commands dc
         where dc.home_id = target_device.home_id
           and dc.created_at > issued_at - interval '1 minute') >= 600
     or (select count(*) from device_commands dc
         where dc.device_id = target_device_id
           and dc.created_at > issued_at - interval '1 minute') >= 30 then
    raise exception 'Voice command rate limit exceeded';
  end if;

  next_payload := jsonb_build_object(
    'op', 'set-properties',
    'deviceId', target_device_id::text,
    'changes', command_patch,
    'source', voice_source,
    'commandId', next_command_id,
    'nonce', next_nonce,
    'idempotencyKey', next_command_id,
    'createdAt', floor(extract(epoch from issued_at) * 1000),
    'expiresAt', floor(extract(epoch from issued_at + interval '15 seconds') * 1000)
  );

  insert into device_commands(
    command_id, home_id, device_id, actor_user_id, action, payload,
    nonce, idempotency_key, created_at, expires_at
  ) values (
    next_command_id, target_device.home_id, target_device_id, target_user_id,
    'set-properties', next_payload, next_nonce, next_command_id, issued_at,
    issued_at + interval '15 seconds'
  );

  return query select next_command_id, 'created'::text,
    issued_at + interval '15 seconds';
end;
$$;

revoke all on function enqueue_voice_device_command(uuid, uuid, text, jsonb)
  from public;
grant execute on function enqueue_voice_device_command(uuid, uuid, text, jsonb)
  to service_role;
