-- Keep authorization and command validation at the database boundary, including
-- callers which do not use the mobile application's HTTP endpoints.

drop policy if exists home_invites_select on public.home_invites;
create policy home_invites_select on public.home_invites for select using (
  public.can_manage_home(home_invites.home_id)
  or (
    lower(home_invites.email) = lower(auth.jwt() ->> 'email')
    and (home_invites.invited_user_id is null or home_invites.invited_user_id = auth.uid())
  )
);
drop policy if exists device_audit_logs_select on public.device_audit_logs;
create policy device_audit_logs_select on public.device_audit_logs for select
using (public.can_manage_home(device_audit_logs.home_id));

create or replace function public.can_access_room(rid uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.rooms r
    where r.id = rid and (
      public.can_access_home_full(r.home_id)
      or exists (
        select 1 from public.room_members rm
        join public.home_members hm on hm.home_id = r.home_id and hm.user_id = rm.user_id
        where rm.room_id = r.id and rm.user_id = auth.uid()
      )
    )
  );
$$;

create or replace function public.remove_departed_room_memberships()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  delete from public.room_members rm using public.rooms r
  where rm.room_id = r.id and r.home_id = old.home_id and rm.user_id = old.user_id;
  return old;
end;
$$;
drop trigger if exists home_members_remove_room_memberships on public.home_members;
create trigger home_members_remove_room_memberships
after delete or update of home_id, user_id on public.home_members
for each row execute function public.remove_departed_room_memberships();

-- Remove already-revoked assignments so a later invitation cannot revive them.
delete from public.room_members rm using public.rooms r
where rm.room_id = r.id and not exists (
  select 1 from public.home_members hm
  where hm.home_id = r.home_id and hm.user_id = rm.user_id
);

create or replace function public.require_current_room_membership()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  -- Hold the membership until commit so removal and assignment cannot race.
  perform 1 from public.home_members hm join public.rooms r on r.home_id = hm.home_id
  where r.id = new.room_id and hm.user_id = new.user_id for key share of hm;
  if not found then
    raise exception using errcode = '23514', message = 'A current home membership is required';
  end if;
  return new;
end;
$$;
drop trigger if exists room_members_require_current_home on public.room_members;
create trigger room_members_require_current_home
before insert or update on public.room_members
for each row execute function public.require_current_room_membership();

create or replace function public.is_home_owner(target_home_id uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from public.homes h where h.id = target_home_id and h.owner_id = auth.uid());
$$;
create or replace function public.can_administer_member(target_home_id uuid, target_user_id uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.is_home_owner(target_home_id) or (
    public.can_manage_home(target_home_id) and target_user_id <> auth.uid()
    and exists (select 1 from public.home_members hm
      where hm.home_id = target_home_id and hm.user_id = target_user_id
      and hm.role in ('member', 'guest', 'tenant'))
  );
$$;

create or replace function public.can_administer_member_permission(target_home_id uuid, target_user_id uuid, requested_permission text)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.can_administer_member(target_home_id, target_user_id) and (
    public.is_home_owner(target_home_id)
    or public.effective_member_has_action_permission(target_home_id, auth.uid(), requested_permission)
  );
$$;

-- Delegated administrators retain ordinary member management. Only the
-- canonical owner can change administrator authority, including restrictions.
drop policy if exists home_members_insert on public.home_members;
create policy home_members_insert on public.home_members for insert with check (
  (public.is_home_owner(home_members.home_id)
    and (home_members.role <> 'owner' or home_members.user_id = auth.uid()))
  or (public.can_manage_home(home_members.home_id)
    and home_members.role in ('member', 'guest', 'tenant')
    and home_members.user_id <> auth.uid())
);
drop policy if exists home_members_update on public.home_members;
create policy home_members_update on public.home_members for update
using (public.can_administer_member(home_members.home_id, home_members.user_id))
with check (
  (public.is_home_owner(home_members.home_id)
    and (home_members.role <> 'owner' or home_members.user_id = auth.uid()))
  or (public.can_manage_home(home_members.home_id)
    and home_members.role in ('member', 'guest', 'tenant')
    and home_members.user_id <> auth.uid())
);
drop policy if exists home_members_delete on public.home_members;
create policy home_members_delete on public.home_members for delete
using (public.can_administer_member(home_members.home_id, home_members.user_id));

drop policy if exists member_permission_overrides_insert on public.member_permission_overrides;
create policy member_permission_overrides_insert on public.member_permission_overrides for insert with check (
  public.can_administer_member_permission(member_permission_overrides.home_id, member_permission_overrides.user_id, member_permission_overrides.permission)
  and member_permission_overrides.updated_by = auth.uid()
  and member_permission_overrides.user_id <> (select h.owner_id from public.homes h where h.id = member_permission_overrides.home_id)
);
drop policy if exists member_permission_overrides_update on public.member_permission_overrides;
create policy member_permission_overrides_update on public.member_permission_overrides for update
using (public.can_administer_member_permission(member_permission_overrides.home_id, member_permission_overrides.user_id, member_permission_overrides.permission)
  and member_permission_overrides.user_id <> (select h.owner_id from public.homes h where h.id = member_permission_overrides.home_id))
with check (
  public.can_administer_member_permission(member_permission_overrides.home_id, member_permission_overrides.user_id, member_permission_overrides.permission)
  and member_permission_overrides.updated_by = auth.uid()
  and member_permission_overrides.user_id <> (select h.owner_id from public.homes h where h.id = member_permission_overrides.home_id)
);
drop policy if exists member_permission_overrides_delete on public.member_permission_overrides;
create policy member_permission_overrides_delete on public.member_permission_overrides for delete
using (public.can_administer_member_permission(member_permission_overrides.home_id, member_permission_overrides.user_id, member_permission_overrides.permission)
  and member_permission_overrides.user_id <> (select h.owner_id from public.homes h where h.id = member_permission_overrides.home_id));

-- Opening via a power or automatic-opening property is still an opening
-- action; using an alternate typed control must not lower its permission.
create or replace function public.permission_for_device_command(device_kind text, command_action text, command_payload jsonb)
returns text language sql immutable set search_path = public as $$
  select case
    when device_kind = 'light' then 'light.control'
    when device_kind = 'ac' then 'climate.control'
    when device_kind = 'camera' then 'camera.manage'
    when device_kind in ('stove','microwave') then 'stove.control'
    when device_kind in ('smoke','water') then 'safety.control'
    when device_kind in ('coffee','fridge','washer','dryer','dishwasher','water-heater','sprinkler') then 'appliance.control'
    when device_kind in ('door','garage','gate') and (
      command_action = 'toggle' or (command_action = 'set-properties' and (
        command_payload #> '{changes,isOn}' = 'true'::jsonb
        or command_payload #> '{changes,autoOpenEnabled}' = 'true'::jsonb
        or case when jsonb_typeof(command_payload #> '{changes,openPercent}') = 'number'
          then (command_payload #>> '{changes,openPercent}')::numeric > 0 else false end
      ))
    ) then case when device_kind = 'door' then 'lock.unlock' else 'garage.open' end
    else 'device.control'
  end;
$$;

-- Descriptors are intentionally explicit: boolean, bounded number/string,
-- enum, or the one supported structured schedule. Registry and telemetry-only
-- fields are not implied by a generic JSON object or a client-side type cast.
create or replace function public.device_command_property_schema(device_kind text)
returns jsonb language sql immutable set search_path = public as $$
  select case when schemas ? device_kind then '{"isOn":["boolean"]}'::jsonb || (schemas -> device_kind) else null end
  from (values ($schema${
    "ac":{"tempC":["number",10,35],"mode":["enum","cold","fan","dry"],"acFanSpeed":["number",0,100],"acSwingMode":["enum","off","vertical","horizontal","both"],"acEcoMode":["boolean"],"acTurboMode":["boolean"],"acQuietMode":["boolean"],"acTargetHumidity":["number",30,80]},
    "light":{"brightness":["number",0,100],"color":["color"],"colorTempK":["number",2000,6500],"lightEffect":["enum","focus","relax","sunset","party"],"adaptiveLighting":["boolean"],"motionBoost":["boolean"],"nightShift":["boolean"],"autoOffMin":["number",0,120]},
    "tv":{"volume":["number",0,100],"channel":["integer",1,9999],"muted":["boolean"],"source":["string",128]},
    "coffee":{"coffeeStrength":["enum","mild","normal","strong"],"coffeeSizeOz":["number",1,32],"coffeeTempC":["number",60,100],"coffeeKeepWarmMin":["number",0,120],"coffeeCupCount":["integer",1,12],"coffeeGrinder":["boolean"],"coffeeMilkFrother":["boolean"],"coffeeAutoBrewTime":["time"]},
    "fridge":{"tempC":["number",1,8],"freezerTempC":["number",-24,-12],"fridgeMode":["enum","eco","normal","boost","vacation"],"fridgeDoorAlarm":["boolean"],"fridgeIceMaker":["boolean"],"fridgeQuickCool":["boolean"],"fridgeQuickFreeze":["boolean"],"fridgeEnergySaver":["boolean"],"fridgeHumidity":["number",20,90]},
    "gate":{"openPercent":["number",0,100],"openLastActor":["string",128],"autoOpenEnabled":["boolean"]},
    "garage":{"openPercent":["number",0,100],"openLastActor":["string",128],"autoOpenEnabled":["boolean"]},
    "door":{"openPercent":["number",0,100],"openLastActor":["string",128],"autoOpenEnabled":["boolean"]},
    "window":{"openPercent":["number",0,100],"openLastActor":["string",128],"autoOpenEnabled":["boolean"]},
    "fan":{"speed":["number",0,100],"fanOscillation":["boolean"],"fanDirection":["enum","forward","reverse"],"fanTimerMin":["number",0,480],"fanAutoMode":["boolean"],"fanLightOn":["boolean"],"fanSleepMode":["boolean"]},
    "vacuum":{"status":["enum","docked","cleaning","paused"],"vacuumSuction":["number",0,100],"vacuumMode":["enum","auto","spot","edge","room"],"vacuumMop":["boolean"],"vacuumQuietMode":["boolean"]},
    "camera":{"armed":["boolean"],"recording":["boolean"],"nightVision":["boolean"],"motionAlerts":["boolean"],"motionSensitivity":["number",1,10],"micMuted":["boolean"],"twoWayAudio":["boolean"]},
    "stove":{"burnerLevel":["number",0,10],"stoveMode":["enum","simmer","boil","sear","keep-warm"],"stoveTimerMin":["number",0,60],"stoveLock":["boolean"]},
    "washer":{"remainingMin":["number",0,1440],"cycle":["enum","Normal","Quick","Delicate","Bedding","Eco"],"progress":["number",0,100],"washTemp":["enum","Cold","Warm","Hot"],"spinSpeedRpm":["enum",800,1000,1200],"soilLevel":["enum","Light","Normal","Heavy"],"loadSize":["enum","Small","Medium","Large"],"rinseCount":["enum",1,2,3],"prewash":["boolean"],"steamWash":["boolean"],"sanitizeWash":["boolean"],"smartDispense":["boolean"],"extraSpin":["boolean"],"ecoWash":["boolean"]},
    "dryer":{"remainingMin":["number",0,1440],"cycle":["enum","Normal","Quick","Delicate","Bedding","Towels","Air Fluff"],"progress":["number",0,100],"heatLevel":["enum","Low","Med","High"],"drynessLevel":["enum","Damp","Dry","Extra"],"sensorDry":["boolean"],"wrinkleGuard":["boolean"],"steamRefresh":["boolean"],"ecoDry":["boolean"],"airFluff":["boolean"],"coolDown":["boolean"],"lintFilterOk":["boolean"],"antiStatic":["boolean"]},
    "dishwasher":{"remainingMin":["number",0,1440],"cycle":["enum","Auto","Normal","Quick","Eco","Intensive","Rinse"],"progress":["number",0,100],"washTemp":["enum","Cold","Warm","Hot"],"soilLevel":["enum","Light","Normal","Heavy"],"rinseCount":["enum",1,2,3],"prewash":["boolean"],"steamWash":["boolean"],"sanitizeWash":["boolean"],"smartDispense":["boolean"],"extraSpin":["boolean"],"ecoWash":["boolean"]},
    "microwave":{"timeRemainingSec":["number",0,900],"microwavePower":["integer",1,10],"microwaveMode":["enum","Reheat","Defrost","Grill","Popcorn"]},
    "energy":{"energyBudgetKwh":["number",50,200],"gridAvailable":["boolean"],"gridOutageAlerts":["boolean"]},
    "water":{"waterLeakAlerts":["boolean"],"waterAutoShutoff":["boolean"],"waterBudgetL":["number",100,400],"waterPressureLowPsi":["number",20,60],"waterPressureHighPsi":["number",60,100],"waterPressureAlerts":["boolean"]},
    "water-heater":{"tempC":["number",40,70],"waterHeaterType":["enum","electric-tank","gas-tank","heat-pump","tankless"],"heaterMode":["enum","eco","standard","boost","vacation"],"recirculation":["boolean"],"antiLegionella":["boolean"],"heaterScheduleEnabled":["boolean"],"vacationDays":["integer",0,30]},
    "air":{"airPurifierMode":["enum","auto","manual","sleep","boost"],"airPurifierSpeed":["number",0,100],"airIonizerEnabled":["boolean"],"airAutoVentilation":["boolean"],"airAlertsEnabled":["boolean"],"airAlertAqi":["number",50,200],"airAlertCo2":["number",600,2000],"airAlertVoc":["number",80,800],"airAlertPm25":["number",10,120],"airAlertPm10":["number",20,160],"airAlertPollen":["number",1,5]},
    "sprinkler":{"durationMin":["number",0,60],"zone":["string",128],"schedule":["schedule"]},
    "speaker":{"volume":["number",0,100],"muted":["boolean"],"speakerSource":["enum","Spotify","AirPlay","Bluetooth","AUX","TV"],"speakerPreset":["enum","Flat","Warm","Bright","Bass","Vocal"],"bass":["number",0,100],"treble":["number",0,100],"spatialAudio":["boolean"],"partyMode":["boolean"],"nightMode":["boolean"],"voiceAssistantEnabled":["boolean"],"micEnabled":["boolean"],"shuffle":["boolean"],"repeat":["enum","off","all","one"]},
    "smoke":{"smokeSensorStatus":["enum","ok","warning","error"],"smokeDetected":["boolean"],"coDetected":["boolean"],"smokeSilenced":["boolean"],"smokeLastTestAt":["integer",0,9007199254740991],"smokeLastAlarmAt":["integer",0,9007199254740991]}
  }$schema$::jsonb)) as definitions(schemas);
$$;

create or replace function public.device_command_value_is_valid(value jsonb, descriptor jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare entry jsonb; day jsonb; kind text := descriptor ->> 0;
begin
  if value is null or value = 'null'::jsonb or descriptor is null then return false; end if;
  case kind
    when 'boolean' then return jsonb_typeof(value) = 'boolean';
    when 'number', 'integer' then
      if jsonb_typeof(value) <> 'number' then return false; end if;
      return (value #>> '{}')::numeric between (descriptor ->> 1)::numeric and (descriptor ->> 2)::numeric
        and (kind <> 'integer' or trunc((value #>> '{}')::numeric) = (value #>> '{}')::numeric);
    when 'enum' then return (descriptor - 0) @> jsonb_build_array(value);
    when 'string' then return jsonb_typeof(value) = 'string' and length(value #>> '{}') between 1 and (descriptor ->> 1)::integer;
    when 'color' then return jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^#[0-9A-Fa-f]{6}$';
    when 'time' then return jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    when 'schedule' then
      if jsonb_typeof(value) <> 'array' then return false; end if;
      if jsonb_array_length(value) > 32 then return false; end if;
      for entry in select jsonb_array_elements(value) loop
        if jsonb_typeof(entry) <> 'object' then return false; end if;
        if not entry ?& array['id','hour','minute','days','enabled']
          or entry - array['id','hour','minute','days','enabled'] <> '{}'::jsonb
          or not public.device_command_value_is_valid(entry -> 'id', '["string",128]')
          or not public.device_command_value_is_valid(entry -> 'hour', '["integer",0,23]')
          or not public.device_command_value_is_valid(entry -> 'minute', '["integer",0,59]')
          or not public.device_command_value_is_valid(entry -> 'enabled', '["boolean"]')
          or jsonb_typeof(entry -> 'days') <> 'array' then return false; end if;
        if jsonb_array_length(entry -> 'days') not between 1 and 7 then return false; end if;
        for day in select jsonb_array_elements(entry -> 'days') loop
          if not public.device_command_value_is_valid(day, '["enum","Mon","Tue","Wed","Thu","Fri","Sat","Sun"]') then return false; end if;
        end loop;
      end loop;
      return true;
    else return false;
  end case;
end;
$$;

create or replace function public.device_command_payload_is_valid(device_kind text, command_action text, command_payload jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  schema jsonb := public.device_command_property_schema(device_kind);
  fields text[] := array['op','deviceId','commandId','nonce','idempotencyKey','createdAt','expiresAt','source'];
  patch jsonb; property record;
begin
  if schema is null or jsonb_typeof(command_payload) is distinct from 'object'
    or octet_length(command_payload::text) > 16384 then return false; end if;
  if command_payload ? 'source' and not public.device_command_value_is_valid(command_payload -> 'source', '["enum","alexa","google"]') then return false; end if;
  case command_action
    when 'toggle' then
      fields := fields || 'on'::text;
      if command_payload ? 'on' and not public.device_command_value_is_valid(command_payload -> 'on', '["boolean"]') then return false; end if;
    when 'set-properties' then
      fields := fields || 'changes'::text; patch := command_payload -> 'changes';
      if jsonb_typeof(patch) is distinct from 'object' or patch = '{}'::jsonb then return false; end if;
      for property in select * from jsonb_each(patch) loop
        if not public.device_command_value_is_valid(property.value, schema -> property.key) then return false; end if;
      end loop;
    when 'set-temp' then
      fields := fields || array['value','mode'];
      if not public.device_command_value_is_valid(command_payload -> 'value', schema -> 'tempC') then return false; end if;
      if command_payload ? 'mode' and not public.device_command_value_is_valid(command_payload -> 'mode', schema -> 'mode') then return false; end if;
    when 'set-brightness' then
      fields := fields || 'value'::text;
      if not public.device_command_value_is_valid(command_payload -> 'value', schema -> 'brightness') then return false; end if;
    when 'set-volume' then
      fields := fields || 'value'::text;
      if not public.device_command_value_is_valid(command_payload -> 'value', schema -> 'volume') then return false; end if;
    when 'set-channel' then
      fields := fields || 'value'::text;
      if not public.device_command_value_is_valid(command_payload -> 'value', schema -> 'channel') then return false; end if;
    when 'set-muted' then
      fields := fields || 'value'::text;
      if not public.device_command_value_is_valid(command_payload -> 'value', schema -> 'muted') then return false; end if;
    when 'set-mode' then
      fields := fields || 'mode'::text;
      if not public.device_command_value_is_valid(command_payload -> 'mode', schema -> 'mode') then return false; end if;
    when 'launch-app' then
      fields := fields || 'app'::text;
      if device_kind <> 'tv' or not public.device_command_value_is_valid(command_payload -> 'app', '["string",128]') then return false; end if;
    when 'media' then
      fields := fields || 'action'::text;
      if device_kind not in ('tv','speaker') or not public.device_command_value_is_valid(command_payload -> 'action', '["enum","play","play-pause","next","previous","rewind","fast-forward"]') then return false; end if;
    when 'nav' then
      fields := fields || 'action'::text;
      if device_kind <> 'tv' or not public.device_command_value_is_valid(command_payload -> 'action', '["enum","up","down","left","right","select","home"]') then return false; end if;
    else return false;
  end case;
  return command_payload - fields = '{}'::jsonb;
end;
$$;

create or replace function public.validate_device_command_insert()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
declare target_device public.devices%rowtype;
begin
  select * into target_device from public.devices where id = new.device_id;
  if not found or new.status is distinct from 'created' or new.actor_user_id is null
    or new.command is not null or new.home_id is distinct from target_device.home_id
    or new.created_at < now() - interval '30 seconds' or new.created_at > now() + interval '5 seconds'
    or new.expires_at <= now() or new.expires_at > new.created_at + interval '60 seconds'
    or not public.device_command_payload_is_valid(target_device.kind, new.action, new.payload)
    or not coalesce(new.payload ?& array['op','deviceId','commandId','nonce','idempotencyKey','createdAt','expiresAt'], false)
    or not public.device_command_value_is_valid(new.payload -> 'op', '["string",64]')
    or not public.device_command_value_is_valid(new.payload -> 'deviceId', '["string",64]')
    or not public.device_command_value_is_valid(new.payload -> 'commandId', '["string",128]')
    or not public.device_command_value_is_valid(new.payload -> 'nonce', '["string",128]')
    or not public.device_command_value_is_valid(new.payload -> 'idempotencyKey', '["string",128]')
    or not public.device_command_value_is_valid(new.payload -> 'createdAt', '["integer",0,9007199254740991]')
    or not public.device_command_value_is_valid(new.payload -> 'expiresAt', '["integer",0,9007199254740991]') then
    raise exception using errcode = '23514', message = 'Invalid device command envelope';
  end if;
  -- Voice timestamps originate in PostgreSQL; compare the millisecond value
  -- emitted in JSON without losing the authoritative column's precision.
  if new.payload ->> 'op' is distinct from new.action
    or new.payload ->> 'deviceId' is distinct from new.device_id::text
    or new.payload ->> 'commandId' is distinct from new.command_id
    or new.payload ->> 'nonce' is distinct from new.nonce
    or new.payload ->> 'idempotencyKey' is distinct from new.idempotency_key
    or (new.payload ->> 'createdAt')::numeric <> floor(extract(epoch from new.created_at) * 1000)
    or (new.payload ->> 'expiresAt')::numeric <> floor(extract(epoch from new.expires_at) * 1000) then
    raise exception using errcode = '23514', message = 'Invalid device command envelope';
  end if;
  return new;
end;
$$;
-- Alphabetical trigger ordering validates input before acquiring quota locks.
drop trigger if exists device_commands_check_envelope on public.device_commands;
create trigger device_commands_check_envelope before insert on public.device_commands
for each row execute function public.validate_device_command_insert();

create or replace function public.find_auth_user_id_by_email(target_email text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare matched_ids uuid[];
begin
  if target_email is null or length(btrim(target_email)) not between 3 and 254 then return null; end if;
  select array_agg(u.id) into matched_ids from auth.users u
  where lower(btrim(u.email)) = lower(btrim(target_email));
  if cardinality(matched_ids) > 1 then raise exception 'Account lookup is ambiguous'; end if;
  return matched_ids[1];
end;
$$;

create or replace function public.revoke_voice_link(target_user_id uuid, target_client_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Lock/remove codes before tokens, matching redemption's code-before-token
  -- order. A concurrent redemption cannot leave a fresh token after unlink.
  delete from public.voice_oauth_codes where user_id = target_user_id and client_id = target_client_id;
  delete from public.voice_oauth_tokens where user_id = target_user_id and client_id = target_client_id;
end;
$$;

-- Named platform default grants survive a revoke from PUBLIC. State every
-- caller role explicitly, for both older and restrictive project defaults.
revoke all on function public.exchange_voice_authorization_code(text,text,text,text,text,timestamptz),
  public.enqueue_voice_device_command(uuid,uuid,text,jsonb),
  public.voice_member_can_perform_device_action(uuid,uuid,text),
  public.find_auth_user_id_by_email(text), public.revoke_voice_link(uuid,text)
from public, anon, authenticated;
grant execute on function public.exchange_voice_authorization_code(text,text,text,text,text,timestamptz),
  public.enqueue_voice_device_command(uuid,uuid,text,jsonb),
  public.voice_member_can_perform_device_action(uuid,uuid,text),
  public.find_auth_user_id_by_email(text), public.revoke_voice_link(uuid,text) to service_role;

revoke all on function public.can_access_home(uuid), public.can_manage_home(uuid),
  public.can_access_home_full(uuid), public.can_access_room(uuid), public.can_manage_room(uuid),
  public.can_perform_device_action(uuid,text), public.effective_member_has_action_permission(uuid,uuid,text),
  public.bootstrap_home(text), public.respond_home_invite(uuid,text),
  public.is_home_owner(uuid), public.can_administer_member(uuid,uuid), public.can_administer_member_permission(uuid,uuid,text),
  public.role_has_action_permission(text,text), public.permission_for_device_command(text,text,jsonb)
from public, anon, authenticated;
grant execute on function public.can_access_home(uuid), public.can_manage_home(uuid),
  public.can_access_home_full(uuid), public.can_access_room(uuid), public.can_manage_room(uuid),
  public.can_perform_device_action(uuid,text), public.effective_member_has_action_permission(uuid,uuid,text),
  public.bootstrap_home(text), public.respond_home_invite(uuid,text),
  public.is_home_owner(uuid), public.can_administer_member(uuid,uuid), public.can_administer_member_permission(uuid,uuid,text),
  public.role_has_action_permission(text,text), public.permission_for_device_command(text,text,jsonb)
to authenticated, service_role;

revoke all on function public.remove_departed_room_memberships(), public.require_current_room_membership(),
  public.device_command_property_schema(text), public.device_command_value_is_valid(jsonb,jsonb),
  public.device_command_payload_is_valid(text,text,jsonb), public.validate_device_command_insert(),
  public.enforce_device_command_rate_limits(), public.set_updated_at()
from public, anon, authenticated;

-- RLS protects row operations, not table-level privileges such as TRUNCATE.
revoke all on public.homes, public.home_members, public.rooms, public.room_members,
  public.devices, public.device_state, public.home_invites, public.device_commands,
  public.device_audit_logs, public.member_permission_overrides from anon, authenticated;
grant select, insert, update, delete on public.homes, public.home_members, public.rooms,
  public.room_members, public.devices, public.member_permission_overrides to authenticated;
grant select on public.device_state, public.home_invites, public.device_audit_logs to authenticated;
grant select, insert on public.device_commands to authenticated;
grant all on public.homes, public.home_members, public.rooms, public.room_members, public.devices,
  public.device_state, public.home_invites, public.device_commands, public.device_audit_logs,
  public.member_permission_overrides, public.voice_oauth_codes, public.voice_oauth_tokens, public.voice_oauth_clients to service_role;
revoke all on public.voice_oauth_codes, public.voice_oauth_tokens, public.voice_oauth_clients from public, anon, authenticated;
