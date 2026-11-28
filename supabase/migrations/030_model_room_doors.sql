-- Add the measured architectural doors once, without resetting a household or resurrecting deleted fixtures.
-- Catalog receipt versions are server delivery versions; local modelCatalogVersion stays at format 1.
alter table public.model_simulation_setups drop constraint model_simulation_setups_catalog_version_check;
alter table public.model_simulation_setups add constraint model_simulation_setups_catalog_version_check check (catalog_version in (1,2));

/** Private immutable identities also distinguish interior openings from exterior entry permissions. */
create function public.model_room_door_catalog()
returns jsonb language sql immutable set search_path = '' as $$
  select $room_doors$[
  {
    "id": "bath-2-door",
    "name": "Northeast bathroom door",
    "roomId": "bath-2",
    "security": "interior"
  },
  {
    "id": "bedroom-2-door",
    "name": "Northeast suite door",
    "roomId": "bedroom-2",
    "security": "interior"
  },
  {
    "id": "bedroom-2-closet-door",
    "name": "Northeast suite closet",
    "roomId": "bedroom-2",
    "security": "interior"
  },
  {
    "id": "bedroom-4-closet-door",
    "name": "Southeast suite closet",
    "roomId": "bedroom-4",
    "security": "interior"
  },
  {
    "id": "laundry-exterior-door",
    "name": "Laundry outside door",
    "roomId": "laundry",
    "security": "exterior"
  },
  {
    "id": "bedroom-1-door",
    "name": "Northwest suite door",
    "roomId": "bedroom-1",
    "security": "interior"
  },
  {
    "id": "bedroom-1-closet-door",
    "name": "Northwest suite closet",
    "roomId": "bedroom-1",
    "security": "interior"
  },
  {
    "id": "bath-1-door",
    "name": "Northwest bathroom door",
    "roomId": "bath-1",
    "security": "interior"
  },
  {
    "id": "kitchen-terrace-door",
    "name": "Dining terrace doors",
    "roomId": "kitchen",
    "security": "exterior"
  },
  {
    "id": "kitchen-store-door",
    "name": "Dining storage door",
    "roomId": "kitchen",
    "security": "interior"
  },
  {
    "id": "bath-4-door",
    "name": "Southeast bathroom door",
    "roomId": "bath-4",
    "security": "interior"
  },
  {
    "id": "bedroom-4-door",
    "name": "Southeast suite door",
    "roomId": "bedroom-4",
    "security": "interior"
  },
  {
    "id": "bath-3-door",
    "name": "Southwest bathroom door",
    "roomId": "bath-3",
    "security": "interior"
  },
  {
    "id": "bedroom-3-closet-door",
    "name": "Southwest suite closet",
    "roomId": "bedroom-3",
    "security": "interior"
  },
  {
    "id": "bedroom-3-door",
    "name": "Southwest suite door",
    "roomId": "bedroom-3",
    "security": "interior"
  },
  {
    "id": "hall-storage-door",
    "name": "Hall storage door",
    "roomId": "living",
    "security": "interior"
  },
  {
    "id": "master-dressing-door",
    "name": "Dressing room door",
    "roomId": "master",
    "security": "interior"
  },
  {
    "id": "master-door",
    "name": "Primary suite door",
    "roomId": "master",
    "security": "interior"
  },
  {
    "id": "master-terrace-door",
    "name": "Primary terrace doors",
    "roomId": "master",
    "security": "exterior"
  },
  {
    "id": "family-terrace-door",
    "name": "Family terrace doors",
    "roomId": "family",
    "security": "exterior"
  },
  {
    "id": "family-balcony-door",
    "name": "Family balcony doors",
    "roomId": "family",
    "security": "exterior"
  },
  {
    "id": "bedroom-5-door",
    "name": "Upper guest suite door",
    "roomId": "bedroom-5",
    "security": "interior"
  },
  {
    "id": "bedroom-5-closet-door",
    "name": "Upper guest suite closet",
    "roomId": "bedroom-5",
    "security": "interior"
  },
  {
    "id": "bath-6-door",
    "name": "Guest bathroom door",
    "roomId": "bath-6",
    "security": "interior"
  },
  {
    "id": "upper-storage-door",
    "name": "Upper storage door",
    "roomId": "family",
    "security": "interior"
  },
  {
    "id": "bath-7-door",
    "name": "Shared upper bath door",
    "roomId": "bath-7",
    "security": "interior"
  },
  {
    "id": "gym-terrace-door",
    "name": "Exercise terrace doors",
    "roomId": "gym",
    "security": "exterior"
  }
]$room_doors$::jsonb;
$$;

/** Serialize with setup and membership mutations; only newly inserted devices receive initial shared values. */
create function public.append_model_room_doors(target_home_id uuid)
returns void language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  perform 1 from public.homes where id=target_home_id for update;
  if not exists(select 1 from public.model_simulation_setups where home_id=target_home_id and catalog_version=1) then return; end if;
  with added as (
    insert into public.devices(home_id,room_id,name,kind,model_device_id,simulation_only,metadata)
    select target_home_id,r.id,c->>'name','door',c->>'id',true,
      jsonb_build_object('source','authored-model-simulation','catalogVersion',2)
    from jsonb_array_elements(public.model_room_door_catalog()) c
    join public.rooms r on r.home_id=target_home_id and r.model_room_id=c->>'roomId'
    on conflict do nothing
    returning id,home_id,model_device_id
  )
  insert into public.household_simulation_devices(device_id,home_id,model_device_id,state,revision)
    select a.id,a.home_id,a.model_device_id,'{"on":false,"level":0}'::jsonb,1 from added a
    join public.household_simulation_homes h on h.home_id=a.home_id;
  update public.model_simulation_setups set catalog_version=2,
    device_count=device_count+jsonb_array_length(public.model_room_door_catalog()) where home_id=target_home_id;
end;
$$;

-- Keep the original, proven owner/empty-home/retry checks. Its implementation is private after wrapping.
alter function public.create_model_simulation(uuid) rename to create_model_simulation_v1;
create function public.create_model_simulation(target_home_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare result jsonb; receipt public.model_simulation_setups%rowtype;
begin
  result := public.create_model_simulation_v1(target_home_id);
  perform public.append_model_room_doors(target_home_id);
  select * into strict receipt from public.model_simulation_setups where home_id=target_home_id;
  return result || jsonb_build_object('catalogVersion',receipt.catalog_version,'roomCount',receipt.room_count,'deviceCount',receipt.device_count);
end;
$$;

/** Match native authored-interior permission, with an additional canonical room-binding check. */
create or replace function public.can_control_household_simulation_device(target_device_id uuid)
returns boolean language sql volatile security definer set search_path = '' set row_security = off as $$
  select exists(select 1 from public.devices d where d.id=target_device_id
    and public.can_read_household_simulation_device(d.home_id,d.id,d.model_device_id)
    and public.can_perform_device_action(d.id,case
      when d.kind in ('gas-meter','gas-leak') then 'safety.control'
      when d.kind='door' and d.simulation_only and exists (
        select 1 from jsonb_array_elements(public.model_room_door_catalog()) c
        join public.rooms r on r.id=d.room_id and r.home_id=d.home_id and r.model_room_id=c->>'roomId'
        where c->>'id'=d.model_device_id and c->>'security'='interior'
      ) then 'device.control'
      else public.permission_for_device_command(d.kind,'toggle','{}'::jsonb) end)
    and (d.kind not in ('door','gate','garage') or public.can_perform_device_action(d.id,'device.control')));
$$;

revoke all on function public.model_room_door_catalog(),public.append_model_room_doors(uuid),public.create_model_simulation_v1(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.create_model_simulation(uuid) from public,anon;
grant execute on function public.create_model_simulation(uuid) to authenticated;

-- Preserve every reviewed 029 authorization/revision guard while extending its
-- bounded batch size from 92+32 to 119+32. Refuse unexpected source drift.
do $$declare signature text; definition text;
begin
  foreach signature in array array[
    'public.enable_household_simulation(uuid,uuid,jsonb)',
    'public.patch_household_simulation(uuid,uuid,uuid,text,jsonb)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if (length(definition)-length(replace(definition,'between 1 and 124','')))/length('between 1 and 124') <> 1 then
      raise exception 'Unexpected household simulation limit definition';
    end if;
    execute replace(definition,'between 1 and 124','between 1 and 151');
  end loop;
end$$;

-- Existing prepared homes receive only this additive release. Configured physical homes are untouched.
do $$declare target record;
begin
  for target in select home_id from public.model_simulation_setups where catalog_version=1 order by home_id loop
    perform public.append_model_room_doors(target.home_id);
  end loop;
end$$;
