-- Placement edits keep the existing registry identity and simulation settings.
alter table public.devices add column model_revision integer not null default 0
  check (model_revision >= 0);
comment on column public.devices.model_revision is
  'Server-owned optimistic revision for the name, room and pose of a placed simulation.';

/** Direct writes cannot forge revisions or replace the identity/template of an existing fixture. */
create function public.guard_simulation_device_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.model_revision <> 0 then
      raise exception 'Device revision is managed by the server' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.model_revision is distinct from old.model_revision then
    raise exception 'Device revision is managed by the server' using errcode = '22023';
  end if;
  if old.model_placement is not null then
    if new.id is distinct from old.id or new.home_id is distinct from old.home_id
      or new.kind is distinct from old.kind or new.model_device_id is distinct from old.model_device_id
      or new.model_placement->>'templateId' is distinct from old.model_placement->>'templateId' then
      raise exception 'A placed device keeps its household, identity and device model' using errcode = '22023';
    end if;
    if new.name is distinct from old.name or new.room_id is distinct from old.room_id
      or new.model_placement is distinct from old.model_placement then
      new.model_revision := old.model_revision + 1;
    end if;
  end if;
  return new;
end;
$$;
create trigger devices_track_simulation_revision before insert or update on public.devices
for each row execute function public.guard_simulation_device_revision();

create table public.simulation_device_edits (
  home_id uuid not null references public.homes(id) on delete cascade,
  request_id uuid not null,
  device_id uuid not null,
  expected_revision integer not null,
  room_id uuid not null,
  device_name text not null,
  placement jsonb not null,
  saved_revision integer not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (home_id, request_id)
);
alter table public.simulation_device_edits enable row level security;
revoke all on public.simulation_device_edits from public, anon, authenticated;
comment on table public.simulation_device_edits is
  'Permanent private edit receipts. Replays never overwrite subsequent edits or recreate deleted fixtures.';

/** Compare-and-save under the household management lock; a retry only reads its original receipt. */
create function public.update_simulation_device(
  target_home_id uuid, target_device_id uuid, target_room_id uuid, request_id uuid,
  expected_revision integer, device_name text, placement jsonb
) returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  candidate public.devices%rowtype;
  receipt public.simulation_device_edits%rowtype;
  normalized_name text := btrim(device_name);
  saved_revision integer;
begin
  perform public.require_simulation_device_administrator(target_home_id);
  if request_id is null or target_device_id is null or target_room_id is null
    or expected_revision is null or expected_revision < 0 or normalized_name is null
    or length(normalized_name) not between 1 and 80 or normalized_name ~ '[[:cntrl:]]' then
    raise exception 'Choose a valid device, name and edit revision' using errcode = '22023';
  end if;
  select * into receipt from public.simulation_device_edits e
    where e.home_id = target_home_id and e.request_id = update_simulation_device.request_id;
  if found then
    if receipt.device_id is distinct from target_device_id or receipt.room_id is distinct from target_room_id
      or receipt.expected_revision is distinct from expected_revision or receipt.device_name is distinct from normalized_name
      or receipt.placement is distinct from placement then
      raise exception 'This edit already belongs to a different draft' using errcode = '22023';
    end if;
    if not exists (select 1 from public.devices d where d.id = target_device_id and d.home_id = target_home_id) then
      raise exception 'This device has been removed' using errcode = 'VH404';
    end if;
    return jsonb_build_object('homeId',target_home_id,'deviceId',target_device_id,'status','existing','revision',receipt.saved_revision);
  end if;
  select * into candidate from public.devices d where d.id = target_device_id and d.home_id = target_home_id for update;
  if not found then raise exception 'This device has been removed' using errcode = 'VH404'; end if;
  if not candidate.simulation_only or candidate.model_placement is null then
    raise exception 'Only user-placed simulation devices can be edited here' using errcode = '22023';
  end if;
  if candidate.model_revision <> expected_revision then
    raise exception 'This device changed while you were editing. Reload its latest placement' using errcode = 'VH409';
  end if;
  if placement->>'templateId' is distinct from candidate.model_placement->>'templateId'
    or not public.valid_simulation_device_placement(placement,candidate.kind) then
    raise exception 'Keep the device model and choose a valid position' using errcode = '22023';
  end if;
  perform 1 from public.rooms r where r.id = target_room_id and r.home_id = target_home_id
    and r.model_room_id = placement->>'modelRoomId' for update;
  if not found then raise exception 'Choose a connected room in this home' using errcode = '22023'; end if;
  update public.devices d set name = normalized_name, room_id = target_room_id, model_placement = placement
    where d.id = target_device_id and d.home_id = target_home_id
    returning d.model_revision into saved_revision;
  insert into public.simulation_device_edits(home_id,request_id,device_id,expected_revision,room_id,device_name,placement,saved_revision,created_by)
    values(target_home_id,request_id,target_device_id,expected_revision,target_room_id,normalized_name,placement,saved_revision,auth.uid());
  return jsonb_build_object('homeId',target_home_id,'deviceId',target_device_id,'status','updated','revision',saved_revision);
end;
$$;
revoke all on function public.guard_simulation_device_revision(),
  public.update_simulation_device(uuid,uuid,uuid,uuid,integer,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_simulation_device(uuid,uuid,uuid,uuid,integer,text,jsonb) to authenticated;
