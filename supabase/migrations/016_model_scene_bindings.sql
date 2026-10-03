-- Explicit administrator-owned model identities keep UUID registries independent
-- of display names. Existing rooms/devices RLS controls all binding writes.
alter table public.rooms add column if not exists model_room_id text;
alter table public.devices add column if not exists model_device_id text;

alter table public.rooms add constraint rooms_model_room_id_format
  check (model_room_id is null or model_room_id ~ '^[a-z0-9][a-z0-9-]{0,79}$');
alter table public.devices add constraint devices_model_device_id_format
  check (model_device_id is null or model_device_id ~ '^[a-z0-9][a-z0-9-]{0,79}$');

create unique index rooms_model_room_per_home on public.rooms(home_id, model_room_id)
  where model_room_id is not null;
create unique index devices_model_device_per_home on public.devices(home_id, model_device_id)
  where model_device_id is not null;

comment on column public.rooms.model_room_id is
  'Explicit authored-model room binding. Never inferred from a room name.';
comment on column public.devices.model_device_id is
  'Explicit authored-model device binding; renderer also checks kind and room.';

-- Replace a room and its device bindings atomically, never accepting another
-- household's registry IDs or granting device control through this operation.
create or replace function public.set_model_room_binding(
  target_room_id uuid,
  target_model_room_id text,
  device_bindings jsonb default '[]'::jsonb
) returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare target_home_id uuid;
begin
  select r.home_id into target_home_id from public.rooms r
    where r.id = target_room_id for update;
  if target_home_id is null or not public.can_manage_home(target_home_id) then
    raise exception 'Room administration required' using errcode = '42501';
  end if;
  if jsonb_typeof(device_bindings) is distinct from 'array'
    or jsonb_array_length(device_bindings) > 200 then
    raise exception 'Invalid model bindings' using errcode = '22023';
  end if;
  if target_model_room_id is null and jsonb_array_length(device_bindings) > 0 then
    raise exception 'A modeled room is required' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(device_bindings) b
    where jsonb_typeof(b) is distinct from 'object'
      or jsonb_typeof(b->'deviceId') is distinct from 'string'
      or jsonb_typeof(b->'modelDeviceId') is distinct from 'string'
      or not exists (select 1 from public.devices d
        where d.id::text = b->>'deviceId' and d.room_id = target_room_id and d.home_id = target_home_id))
    or (select count(*) <> count(distinct b->>'deviceId') from jsonb_array_elements(device_bindings) b)
    or (select count(*) <> count(distinct b->>'modelDeviceId') from jsonb_array_elements(device_bindings) b) then
    raise exception 'Invalid room device bindings' using errcode = '22023';
  end if;
  update public.rooms set model_room_id = target_model_room_id where id = target_room_id;
  update public.devices set model_device_id = null where room_id = target_room_id and home_id = target_home_id;
  update public.devices d set model_device_id = b->>'modelDeviceId'
    from jsonb_array_elements(device_bindings) b
    where d.id::text = b->>'deviceId' and d.room_id = target_room_id and d.home_id = target_home_id;
end;
$$;
revoke all on function public.set_model_room_binding(uuid, text, jsonb) from public, anon;
grant execute on function public.set_model_room_binding(uuid, text, jsonb) to authenticated;
