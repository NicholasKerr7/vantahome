-- Resolve production database-lint failures in security-definer functions.

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
  assigned_room_id uuid;
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
      foreach assigned_room_id in array invite_row.room_ids loop
        if exists (
          select 1 from rooms r
          where r.id = assigned_room_id and r.home_id = invite_row.home_id
        ) then
          insert into room_members(room_id, user_id, role)
          values (assigned_room_id, auth.uid(), invite_row.role)
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
  next_nonce text := replace(gen_random_uuid()::text, '-', '');
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
