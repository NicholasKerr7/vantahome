-- Sprint 2: action-level authorization, durable command envelopes, and
-- transactional invitation acceptance.

alter table home_invites
  add column if not exists expires_at timestamptz not null
  default (now() + interval '7 days');

alter table voice_oauth_tokens
  add column if not exists refresh_expires_at timestamptz;
update voice_oauth_tokens
set refresh_expires_at = created_at + interval '30 days'
where refresh_expires_at is null;
alter table voice_oauth_tokens
  alter column refresh_expires_at set default (now() + interval '30 days'),
  alter column refresh_expires_at set not null;

-- Earlier room-policy helpers are security-definer functions. Keep them
-- callable only by authenticated policy evaluation, never anonymous callers.
revoke all on function can_access_room(uuid) from public;
revoke all on function can_manage_room(uuid) from public;
grant execute on function can_access_room(uuid) to authenticated;
grant execute on function can_manage_room(uuid) to authenticated;

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

-- Room membership alone must not reveal camera registry metadata or state.
drop policy if exists devices_select on devices;
create policy devices_select
on devices
for select
using (
  (
    can_access_home_full(home_id)
    or exists (
      select 1 from room_members rm
      where rm.room_id = room_id and rm.user_id = auth.uid()
    )
  )
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
      and (
        can_access_home_full(d.home_id)
        or exists (
          select 1 from room_members rm
          where rm.room_id = d.room_id and rm.user_id = auth.uid()
        )
      )
      and (
        d.kind <> 'camera'
        or can_perform_device_action(d.id, 'camera.live')
      )
  )
);

create table if not exists device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  command jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  command_id text,
  home_id uuid references homes(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete cascade,
  action text,
  payload jsonb,
  nonce text,
  idempotency_key text,
  expires_at timestamptz
);

-- Migration 002 already created a smaller command queue. Add the security
-- envelope columns explicitly so this migration is safe on upgraded projects,
-- not only on fresh databases.
alter table device_commands add column if not exists command_id text;
alter table device_commands add column if not exists home_id uuid
  references homes(id) on delete cascade;
alter table device_commands add column if not exists actor_user_id uuid
  references auth.users(id) on delete cascade;
alter table device_commands add column if not exists action text;
alter table device_commands add column if not exists payload jsonb;
alter table device_commands add column if not exists nonce text;
alter table device_commands add column if not exists idempotency_key text;
alter table device_commands add column if not exists expires_at timestamptz;

-- Preserve legacy queue rows for audit purposes. They cannot be dispatched as
-- authenticated Sprint 2 commands and are marked expired during the upgrade.
update device_commands dc
set command_id = coalesce(dc.command_id, dc.id::text),
    home_id = coalesce(
      dc.home_id,
      (select d.home_id from devices d where d.id = dc.device_id)
    ),
    action = coalesce(dc.action, dc.command ->> 'op', 'legacy'),
    payload = coalesce(dc.payload, dc.command, '{}'::jsonb)
      || jsonb_build_object(
        'op', coalesce(dc.action, dc.command ->> 'op', 'legacy'),
        'deviceId', dc.device_id::text
      ),
    nonce = coalesce(dc.nonce, 'legacy-' || dc.id::text),
    idempotency_key = coalesce(
      dc.idempotency_key,
      'legacy-' || dc.id::text
    ),
    expires_at = coalesce(dc.expires_at, dc.created_at + interval '60 seconds'),
    status = case when dc.actor_user_id is null then 'expired' else dc.status end;

alter table device_commands alter column command drop not null;
alter table device_commands alter column command_id set not null;
alter table device_commands alter column home_id set not null;
alter table device_commands alter column action set not null;
alter table device_commands alter column payload set not null;
alter table device_commands alter column payload set default '{}'::jsonb;
alter table device_commands alter column nonce set not null;
alter table device_commands alter column idempotency_key set not null;
alter table device_commands alter column expires_at set not null;
alter table device_commands alter column status set default 'created';

alter table device_commands
  drop constraint if exists device_commands_status_check;
alter table device_commands
  add constraint device_commands_status_check check (status in (
    'created', 'authorized', 'dispatched', 'bridge_accepted',
    'integration_sent', 'physical_observed', 'confirmed', 'rejected',
    'expired', 'timed_out', 'device_unavailable', 'unsupported',
    'permission_denied', 'partially_completed'
  ));
alter table device_commands
  add constraint device_commands_actor_check check (
    actor_user_id is not null
    or (
      status = 'expired'
      and command_id = id::text
      and nonce = 'legacy-' || id::text
    )
  );
alter table device_commands
  add constraint device_commands_lifetime_check check (
    expires_at > created_at and expires_at <= created_at + interval '60 seconds'
  );
alter table device_commands
  add constraint device_commands_payload_action_check check (
    payload ->> 'op' = action
  );
alter table device_commands
  add constraint device_commands_payload_device_check check (
    payload ->> 'deviceId' = device_id::text
  );

create unique index if not exists device_commands_command_id_unique
on device_commands(home_id, command_id);
create unique index if not exists device_commands_nonce_unique
on device_commands(home_id, actor_user_id, nonce);
create unique index if not exists device_commands_idempotency_unique
on device_commands(home_id, actor_user_id, idempotency_key);

create index if not exists device_commands_dispatch_idx
on device_commands(home_id, status, created_at);
create index if not exists device_commands_actor_rate_idx
on device_commands(actor_user_id, created_at);
create index if not exists device_commands_device_rate_idx
on device_commands(device_id, created_at);
create index if not exists device_commands_home_rate_idx
on device_commands(home_id, created_at);

create or replace function enforce_device_command_rate_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_user_id is null then
    raise exception 'Command actor is required';
  end if;
  -- Consistent lock order makes the count-and-insert decision atomic enough for
  -- concurrent API and voice requests without an external rate-limit service.
  perform pg_advisory_xact_lock(hashtext('actor:' || new.actor_user_id::text));
  perform pg_advisory_xact_lock(hashtext('home:' || new.home_id::text));
  perform pg_advisory_xact_lock(hashtext('device:' || new.device_id::text));
  if (select count(*) from device_commands dc
      where dc.actor_user_id = new.actor_user_id
        and dc.created_at > now() - interval '1 minute') >= 120
     or (select count(*) from device_commands dc
         where dc.home_id = new.home_id
           and dc.created_at > now() - interval '1 minute') >= 600
     or (select count(*) from device_commands dc
         where dc.device_id = new.device_id
           and dc.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Device command rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists device_commands_rate_limit on device_commands;
create trigger device_commands_rate_limit
before insert on device_commands
for each row execute function enforce_device_command_rate_limits();
revoke all on function enforce_device_command_rate_limits() from public;

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
  member_role text;
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
  if not found or target_device.kind not in ('light', 'ac', 'tv', 'fan', 'speaker') then
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

  select hm.role into member_role
  from home_members hm
  where hm.home_id = target_device.home_id
    and hm.user_id = target_user_id;
  required_permission := permission_for_device_command(
    target_device.kind,
    'set-properties',
    jsonb_build_object('changes', command_patch)
  );
  if member_role is null
     or not role_has_action_permission(member_role, required_permission)
     or (
       member_role in ('guest', 'tenant')
       and not exists (
         select 1 from room_members rm
         where rm.room_id = target_device.room_id
           and rm.user_id = target_user_id
       )
     ) then
    raise exception 'Voice command forbidden';
  end if;

  -- Layered limits contain a compromised voice token to its actor, home, and
  -- individual device instead of relying on a single global threshold.
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

create or replace function exchange_voice_authorization_code(
  oauth_code text,
  oauth_client_id text,
  oauth_redirect_uri text,
  new_access_token text,
  new_refresh_token text,
  new_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row voice_oauth_codes%rowtype;
begin
  select * into code_row
  from voice_oauth_codes
  where code = oauth_code
  for update;
  if not found
     or code_row.client_id <> oauth_client_id
     or code_row.redirect_uri <> oauth_redirect_uri
     or code_row.expires_at <= now() then
    if found and code_row.expires_at <= now() then
      delete from voice_oauth_codes where code = oauth_code;
    end if;
    return false;
  end if;

  insert into voice_oauth_tokens(
    access_token, refresh_token, client_id, user_id, expires_at,
    refresh_expires_at
  ) values (
    new_access_token, new_refresh_token, oauth_client_id, code_row.user_id,
    new_expires_at, now() + interval '30 days'
  );
  delete from voice_oauth_codes where code = oauth_code;
  return true;
end;
$$;

revoke all on function exchange_voice_authorization_code(
  text, text, text, text, text, timestamptz
) from public;
grant execute on function exchange_voice_authorization_code(
  text, text, text, text, text, timestamptz
) to service_role;

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
  and (
    select count(*) < 600
    from device_commands recent
    where recent.home_id = device_commands.home_id
      and recent.created_at > now() - interval '1 minute'
  )
  and (
    select count(*) < 30
    from device_commands recent
    where recent.device_id = device_commands.device_id
      and recent.created_at > now() - interval '1 minute'
  )
);

-- Clients request commands; only the trusted bridge/service role advances them.
revoke update, delete on device_commands from authenticated;

-- Flexible state JSON is an observation sink, not a client command surface.
drop policy if exists device_state_insert on device_state;
drop policy if exists device_state_update on device_state;
drop policy if exists device_state_delete on device_state;

create or replace function bootstrap_home(home_name text)
returns homes
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  home_row homes%rowtype;
begin
  if current_user_id is null then raise exception 'Unauthorized'; end if;
  if length(btrim(home_name)) not between 1 and 120 then
    raise exception 'Invalid home name';
  end if;

  -- Serialize bootstrap attempts for one account so concurrent taps cannot
  -- create multiple owner households.
  perform pg_advisory_xact_lock(hashtext(current_user_id::text));
  select h.* into home_row
  from homes h
  join home_members hm on hm.home_id = h.id
  where hm.user_id = current_user_id
  order by hm.created_at
  limit 1;
  if found then return home_row; end if;

  insert into homes(owner_id, name)
  values (current_user_id, btrim(home_name))
  returning * into home_row;
  insert into home_members(home_id, user_id, role)
  values (home_row.id, current_user_id, 'owner');
  return home_row;
end;
$$;

revoke all on function bootstrap_home(text) from public;
grant execute on function bootstrap_home(text) to authenticated;

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
