-- Explicitly prepare the authored 3D property for an owner-created empty home.
-- Virtual registry entries grant no physical transport capability and are never
-- presented as device observations. Existing configured homes are left intact.
alter table public.devices add column if not exists simulation_only boolean not null default false;
comment on column public.devices.simulation_only is
  'Virtual device for isolated model interaction; never dispatch to a physical transport.';

create table public.model_simulation_setups (
  home_id uuid primary key references public.homes(id) on delete cascade,
  catalog_version integer not null check (catalog_version = 1),
  room_count integer not null,
  device_count integer not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.model_simulation_setups enable row level security;
revoke all on public.model_simulation_setups from public, anon, authenticated;
comment on table public.model_simulation_setups is
  'Private transaction receipt; retries never recreate deleted or reconfigured model entries.';

-- A virtual registry entry must be replaced by a separately paired real device,
-- never silently converted into a physical destination through a client write.
create function public.preserve_simulation_device_boundary()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if old.simulation_only and not new.simulation_only then
    raise exception 'Simulation devices cannot become physical devices' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger devices_preserve_simulation_boundary before update on public.devices
for each row execute function public.preserve_simulation_device_boundary();

-- Central queue protection covers mobile commands, direct table writes, voice
-- assistants and service-role enqueue helpers without changing room permissions.
create function public.reject_simulation_device_command()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if exists (select 1 from public.devices d where d.id = new.device_id and d.simulation_only) then
    raise exception 'Simulation devices do not accept physical commands' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger device_commands_block_simulation before insert or update on public.device_commands
for each row execute function public.reject_simulation_device_command();
revoke all on function public.preserve_simulation_device_boundary(), public.reject_simulation_device_command()
  from public, anon, authenticated;

create function public.create_model_simulation(target_home_id uuid)
returns jsonb language plpgsql security definer
set search_path = public set row_security = off as $$
declare
  owner_user_id uuid;
  receipt public.model_simulation_setups%rowtype;
  catalog_rooms constant jsonb := $model_rooms$[
  {"id":"living","name":"Living room"},
  {"id":"kitchen","name":"Kitchen & dining"},
  {"id":"laundry","name":"Laundry"},
  {"id":"master","name":"Primary suite"},
  {"id":"family","name":"Family room"},
  {"id":"gym","name":"Exercise room"},
  {"id":"bedroom-1","name":"Northwest suite"},
  {"id":"bedroom-2","name":"Northeast suite"},
  {"id":"bedroom-3","name":"Southwest suite"},
  {"id":"bedroom-4","name":"Southeast suite"},
  {"id":"bedroom-5","name":"Upper guest suite"},
  {"id":"bath-1","name":"Northwest bathroom"},
  {"id":"bath-2","name":"Northeast bathroom"},
  {"id":"bath-3","name":"Southwest bathroom"},
  {"id":"bath-4","name":"Southeast bathroom"},
  {"id":"bath-5","name":"Primary spa"},
  {"id":"bath-6","name":"Guest bathroom"},
  {"id":"bath-7","name":"Shared upper bath"},
  {"id":"grounds","name":"Grounds & entry"},
  {"id":"utility","name":"Energy pavilion"}
]$model_rooms$::jsonb;
  catalog_devices constant jsonb := $model_devices$[
  {"id":"living-light","name":"Pendant light","roomId":"living","kind":"light"},
  {"id":"living-fan","name":"Ceiling fan","roomId":"living","kind":"fan"},
  {"id":"family-tv","name":"Television","roomId":"family","kind":"tv"},
  {"id":"laundry-washer","name":"Washing machine","roomId":"laundry","kind":"washer"},
  {"id":"master-ac","name":"Air conditioning","roomId":"master","kind":"ac"},
  {"id":"master-blinds","name":"Window blinds","roomId":"master","kind":"blinds"},
  {"id":"entry-gate","name":"Entry gate","roomId":"grounds","kind":"gate"},
  {"id":"master-light","name":"Ceiling light","roomId":"master","kind":"light"},
  {"id":"master-bedside-left","name":"Left bedside lamp","roomId":"master","kind":"light"},
  {"id":"master-bedside-right","name":"Right bedside lamp","roomId":"master","kind":"light"},
  {"id":"master-smoke","name":"Smoke & CO sensor","roomId":"master","kind":"smoke"},
  {"id":"bedroom-1-light","name":"Ceiling light","roomId":"bedroom-1","kind":"light"},
  {"id":"bedroom-1-bedside-left","name":"Left bedside lamp","roomId":"bedroom-1","kind":"light"},
  {"id":"bedroom-1-bedside-right","name":"Right bedside lamp","roomId":"bedroom-1","kind":"light"},
  {"id":"bedroom-1-ac","name":"Air conditioning","roomId":"bedroom-1","kind":"ac"},
  {"id":"bedroom-1-smoke","name":"Smoke & CO sensor","roomId":"bedroom-1","kind":"smoke"},
  {"id":"bedroom-2-light","name":"Ceiling light","roomId":"bedroom-2","kind":"light"},
  {"id":"bedroom-2-bedside-left","name":"Left bedside lamp","roomId":"bedroom-2","kind":"light"},
  {"id":"bedroom-2-bedside-right","name":"Right bedside lamp","roomId":"bedroom-2","kind":"light"},
  {"id":"bedroom-2-ac","name":"Air conditioning","roomId":"bedroom-2","kind":"ac"},
  {"id":"bedroom-2-smoke","name":"Smoke & CO sensor","roomId":"bedroom-2","kind":"smoke"},
  {"id":"bedroom-3-light","name":"Ceiling light","roomId":"bedroom-3","kind":"light"},
  {"id":"bedroom-3-bedside-left","name":"Left bedside lamp","roomId":"bedroom-3","kind":"light"},
  {"id":"bedroom-3-bedside-right","name":"Right bedside lamp","roomId":"bedroom-3","kind":"light"},
  {"id":"bedroom-3-ac","name":"Air conditioning","roomId":"bedroom-3","kind":"ac"},
  {"id":"bedroom-3-smoke","name":"Smoke & CO sensor","roomId":"bedroom-3","kind":"smoke"},
  {"id":"bedroom-4-light","name":"Ceiling light","roomId":"bedroom-4","kind":"light"},
  {"id":"bedroom-4-bedside-left","name":"Left bedside lamp","roomId":"bedroom-4","kind":"light"},
  {"id":"bedroom-4-bedside-right","name":"Right bedside lamp","roomId":"bedroom-4","kind":"light"},
  {"id":"bedroom-4-ac","name":"Air conditioning","roomId":"bedroom-4","kind":"ac"},
  {"id":"bedroom-4-smoke","name":"Smoke & CO sensor","roomId":"bedroom-4","kind":"smoke"},
  {"id":"bedroom-5-light","name":"Ceiling light","roomId":"bedroom-5","kind":"light"},
  {"id":"bedroom-5-bedside-left","name":"Left bedside lamp","roomId":"bedroom-5","kind":"light"},
  {"id":"bedroom-5-bedside-right","name":"Right bedside lamp","roomId":"bedroom-5","kind":"light"},
  {"id":"bedroom-5-ac","name":"Air conditioning","roomId":"bedroom-5","kind":"ac"},
  {"id":"bedroom-5-smoke","name":"Smoke & CO sensor","roomId":"bedroom-5","kind":"smoke"},
  {"id":"living-air","name":"Air quality","roomId":"living","kind":"air"},
  {"id":"living-speaker","name":"Living room speaker","roomId":"living","kind":"speaker"},
  {"id":"living-vacuum","name":"Robot vacuum","roomId":"living","kind":"vacuum"},
  {"id":"entry-door","name":"Front entry door","roomId":"living","kind":"door"},
  {"id":"family-light","name":"Family ceiling light","roomId":"family","kind":"light"},
  {"id":"family-fan","name":"Family ceiling fan","roomId":"family","kind":"fan"},
  {"id":"family-speaker","name":"Cinema speaker","roomId":"family","kind":"speaker"},
  {"id":"family-smoke","name":"Family smoke sensor","roomId":"family","kind":"smoke"},
  {"id":"gym-light","name":"Studio ceiling light","roomId":"gym","kind":"light"},
  {"id":"gym-fan","name":"Studio fan","roomId":"gym","kind":"fan"},
  {"id":"gym-speaker","name":"Studio speaker","roomId":"gym","kind":"speaker"},
  {"id":"gym-air","name":"Studio air quality","roomId":"gym","kind":"air"},
  {"id":"kitchen-fridge","name":"Refrigerator","roomId":"kitchen","kind":"fridge"},
  {"id":"kitchen-stove","name":"Induction hob","roomId":"kitchen","kind":"stove"},
  {"id":"kitchen-coffee","name":"Espresso machine","roomId":"kitchen","kind":"coffee"},
  {"id":"kitchen-microwave","name":"Microwave","roomId":"kitchen","kind":"microwave"},
  {"id":"kitchen-dishwasher","name":"Integrated dishwasher","roomId":"kitchen","kind":"dishwasher"},
  {"id":"kitchen-light","name":"Kitchen ceiling light","roomId":"kitchen","kind":"light"},
  {"id":"dining-light","name":"Dining pendant","roomId":"kitchen","kind":"light"},
  {"id":"kitchen-window","name":"Kitchen awning window","roomId":"kitchen","kind":"window"},
  {"id":"kitchen-smoke","name":"Kitchen heat & CO sensor","roomId":"kitchen","kind":"smoke"},
  {"id":"laundry-dryer","name":"Tumble dryer","roomId":"laundry","kind":"dryer"},
  {"id":"laundry-light","name":"Laundry ceiling light","roomId":"laundry","kind":"light"},
  {"id":"bath-1-light","name":"Bathroom ceiling light","roomId":"bath-1","kind":"light"},
  {"id":"bath-1-fan","name":"Ventilation fan","roomId":"bath-1","kind":"fan"},
  {"id":"bath-2-light","name":"Bathroom ceiling light","roomId":"bath-2","kind":"light"},
  {"id":"bath-2-fan","name":"Ventilation fan","roomId":"bath-2","kind":"fan"},
  {"id":"bath-3-light","name":"Bathroom ceiling light","roomId":"bath-3","kind":"light"},
  {"id":"bath-3-fan","name":"Ventilation fan","roomId":"bath-3","kind":"fan"},
  {"id":"bath-4-light","name":"Bathroom ceiling light","roomId":"bath-4","kind":"light"},
  {"id":"bath-4-fan","name":"Ventilation fan","roomId":"bath-4","kind":"fan"},
  {"id":"bath-5-light","name":"Bathroom ceiling light","roomId":"bath-5","kind":"light"},
  {"id":"bath-5-fan","name":"Ventilation fan","roomId":"bath-5","kind":"fan"},
  {"id":"bath-6-light","name":"Bathroom ceiling light","roomId":"bath-6","kind":"light"},
  {"id":"bath-6-fan","name":"Ventilation fan","roomId":"bath-6","kind":"fan"},
  {"id":"bath-7-light","name":"Bathroom ceiling light","roomId":"bath-7","kind":"light"},
  {"id":"bath-7-fan","name":"Ventilation fan","roomId":"bath-7","kind":"fan"},
  {"id":"utility-generator","name":"Backup generator","roomId":"utility","kind":"generator"},
  {"id":"utility-battery","name":"Solar battery bank","roomId":"utility","kind":"battery"},
  {"id":"utility-energy","name":"Home energy controller","roomId":"utility","kind":"energy"},
  {"id":"utility-solar","name":"Solar array","roomId":"utility","kind":"solar"},
  {"id":"utility-water","name":"Water pressure system","roomId":"utility","kind":"water"},
  {"id":"utility-water-heater","name":"Water heater","roomId":"utility","kind":"water-heater"},
  {"id":"utility-shutter","name":"Service roller door","roomId":"utility","kind":"garage"},
  {"id":"utility-light","name":"Pavilion ceiling light","roomId":"utility","kind":"light"},
  {"id":"entry-camera","name":"Entry camera","roomId":"grounds","kind":"camera"},
  {"id":"drive-camera","name":"Driveway camera","roomId":"grounds","kind":"camera"},
  {"id":"terrace-camera","name":"Terrace camera","roomId":"grounds","kind":"camera"},
  {"id":"grounds-sprinkler","name":"East lawn irrigation","roomId":"grounds","kind":"sprinkler"},
  {"id":"grounds-light","name":"Arrival path lighting","roomId":"grounds","kind":"light"},
  {"id":"grounds-solar-nw","name":"Northwest solar streetlight","roomId":"grounds","kind":"light"},
  {"id":"grounds-solar-ne","name":"Northeast solar streetlight","roomId":"grounds","kind":"light"},
  {"id":"grounds-solar-se","name":"Southeast solar streetlight","roomId":"grounds","kind":"light"},
  {"id":"grounds-solar-sw","name":"Southwest solar streetlight","roomId":"grounds","kind":"light"},
  {"id":"utility-gas-meter","name":"Smart gas meter","roomId":"grounds","kind":"gas-meter"},
  {"id":"kitchen-gas-leak","name":"Gas leak detector","roomId":"kitchen","kind":"gas-leak"}
]$model_devices$::jsonb;
begin
  -- This lock serializes concurrent retries and blocks foreign-key inserts into
  -- the household while its empty registry is checked and populated.
  select h.owner_id into owner_user_id from public.homes h
    where h.id = target_home_id for update;
  if auth.uid() is null or owner_user_id is distinct from auth.uid() then
    raise exception 'Home owner required to prepare the model' using errcode = '42501';
  end if;
  select * into receipt from public.model_simulation_setups where home_id = target_home_id;
  if found then
    return jsonb_build_object('homeId', target_home_id, 'status', 'existing',
      'catalogVersion', receipt.catalog_version, 'roomCount', receipt.room_count, 'deviceCount', receipt.device_count);
  end if;
  if exists (select 1 from public.rooms where home_id = target_home_id)
    or exists (select 1 from public.devices where home_id = target_home_id) then
    raise exception 'This home already has rooms or devices. Connect its existing rooms to the model instead.' using errcode = '22023';
  end if;
  insert into public.rooms(home_id, name, model_room_id)
    select target_home_id, r->>'name', r->>'id' from jsonb_array_elements(catalog_rooms) r;
  insert into public.devices(home_id, room_id, name, kind, model_device_id, simulation_only, metadata)
    select target_home_id, r.id, d->>'name', d->>'kind', d->>'id', true,
      jsonb_build_object('source', 'authored-model-simulation', 'catalogVersion', 1)
    from jsonb_array_elements(catalog_devices) d
    join public.rooms r on r.home_id = target_home_id and r.model_room_id = d->>'roomId';
  insert into public.model_simulation_setups(home_id, catalog_version, room_count, device_count, created_by)
    values (target_home_id, 1, jsonb_array_length(catalog_rooms), jsonb_array_length(catalog_devices), auth.uid());
  return jsonb_build_object('homeId', target_home_id, 'status', 'created', 'catalogVersion', 1,
    'roomCount', jsonb_array_length(catalog_rooms), 'deviceCount', jsonb_array_length(catalog_devices));
end;
$$;
revoke all on function public.create_model_simulation(uuid) from public, anon;
grant execute on function public.create_model_simulation(uuid) to authenticated;
