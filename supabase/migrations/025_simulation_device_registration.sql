-- A placed simulation is one durable registry entry, never a physical endpoint.
alter table public.devices add column if not exists model_placement jsonb;
comment on column public.devices.model_placement is
  'Validated versioned simulation geometry, relative to its explicit model room floor.';

-- These small immutable catalogs intentionally mirror the reviewed bundled asset
-- contract. New shapes need a migration; clients cannot inject paths or geometry.
create function public.simulation_device_template_catalog()
returns jsonb language sql immutable set search_path = '' as $$
  select $templates$[{"id":"living-fan","kind":"fan","mount":"ceiling","dimensions":[1.65,0.42,1.65]},{"id":"family-tv","kind":"tv","mount":"surface","dimensions":[1.275,0.86,0.22]},{"id":"master-ac","kind":"ac","mount":"wall","dimensions":[1.07,0.28,0.21]},{"id":"master-light","kind":"light","mount":"ceiling","dimensions":[0.52,0.09,0.52]},{"id":"master-bedside-left","kind":"light","mount":"surface","dimensions":[0.25,0.4,0.25]},{"id":"living-air","kind":"air","mount":"wall","dimensions":[0.16,0.16,0.08]},{"id":"living-speaker","kind":"speaker","mount":"wall","dimensions":[0.16,0.25,0.16]},{"id":"grounds-light","kind":"light","mount":"floor","dimensions":[0.14,0.82,0.14]}]$templates$::jsonb;
$$;
create function public.simulation_device_room_catalog()
returns jsonb language sql immutable set search_path = '' as $$
  select $placement_rooms$[{"id":"living","outdoor":false,"bounds":[4.876,10.344,-11.492,-7.072],"ceiling":2.7964},{"id":"kitchen","outdoor":false,"bounds":[10.52,16.52,-14.38,-7.1],"ceiling":2.7963999999999998},{"id":"laundry","outdoor":false,"bounds":[12.726,16.53,-16.064,-14.546],"ceiling":2.7964},{"id":"master","outdoor":false,"bounds":[7.457,12.476,-16.545,-11.745],"ceiling":2.5932},{"id":"family","outdoor":false,"bounds":[4.984,12.476,-11.55,-7.164],"ceiling":2.5932},{"id":"gym","outdoor":false,"bounds":[10.588,14.377,-6.969,-2.315],"ceiling":2.5932},{"id":"bedroom-1","outdoor":false,"bounds":[0.076,3.88,-16.064,-11.644],"ceiling":2.6799999999999997},{"id":"bedroom-2","outdoor":false,"bounds":[8.766,12.574,-16.064,-12.856],"ceiling":2.7963999999999998},{"id":"bedroom-3","outdoor":false,"bounds":[3.159,7.459,-4.496,-0.076],"ceiling":2.7963999999999998},{"id":"bedroom-4","outdoor":false,"bounds":[10.352,14.477,-6.224,-2.199],"ceiling":2.7963999999999998},{"id":"bedroom-5","outdoor":false,"bounds":[3.254,7.506,-4.398,-0.183],"ceiling":2.5932},{"id":"bath-1","outdoor":false,"bounds":[4.032,6.785,-16.064,-14.546],"ceiling":2.7964},{"id":"bath-2","outdoor":false,"bounds":[6.937,8.614,-16.064,-12.856],"ceiling":2.7964},{"id":"bath-3","outdoor":false,"bounds":[7.611,10.2,-1.753,-0.076],"ceiling":2.7964},{"id":"bath-4","outdoor":false,"bounds":[10.352,13.15,-2.047,-0.076],"ceiling":2.7964},{"id":"bath-5","outdoor":false,"bounds":[3.059,4.971,-15.96,-11.745],"ceiling":2.5932},{"id":"bath-6","outdoor":false,"bounds":[7.7,10.393,-1.815,-0.183],"ceiling":2.5932},{"id":"bath-7","outdoor":false,"bounds":[10.588,13.049,-2.12,-0.183],"ceiling":2.5932},{"id":"grounds","outdoor":true,"bounds":[-13.88,34.71,-23.25,12.65],"ceiling":2.7},{"id":"utility","outdoor":true,"bounds":[-1.338848980852,3.6,5.226471849948,11.63858307855],"ceiling":2.33}]$placement_rooms$::jsonb;
$$;

/** Validate exactly the same bounds, mounting heights and inward wall poses as the editor. */
create function public.valid_simulation_device_placement(placement jsonb, device_kind text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  fixture jsonb; room jsonb; x double precision; y double precision; z double precision;
  yaw double precision; left_edge double precision; right_edge double precision;
  back_edge double precision; front_edge double precision; width double precision;
  depth double precision; height double precision; inset double precision;
  x_margin double precision; z_margin double precision; ceiling_y double precision;
  epsilon constant double precision := 0.000001;
begin
  if placement is null or jsonb_typeof(placement) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(placement)) <> 6
    or not placement ?& array['version','templateId','modelRoomId','position','rotationY','mount']
    or placement->'version' is distinct from '1'::jsonb
    or jsonb_typeof(placement->'templateId') is distinct from 'string'
    or jsonb_typeof(placement->'modelRoomId') is distinct from 'string'
    or jsonb_typeof(placement->'mount') is distinct from 'string'
    or jsonb_typeof(placement->'rotationY') is distinct from 'number'
    or jsonb_typeof(placement->'position') is distinct from 'array' then return false; end if;
  if jsonb_array_length(placement->'position') <> 3
    or exists (select 1 from jsonb_array_elements(placement->'position') v where jsonb_typeof(v) <> 'number') then return false; end if;
  select t into fixture from jsonb_array_elements(public.simulation_device_template_catalog()) t where t->>'id' = placement->>'templateId';
  select r into room from jsonb_array_elements(public.simulation_device_room_catalog()) r where r->>'id' = placement->>'modelRoomId';
  if fixture is null or room is null or fixture->>'kind' is distinct from device_kind
    or fixture->>'mount' is distinct from placement->>'mount'
    or (fixture->>'id' = 'grounds-light' and room->>'id' <> 'grounds')
    or (fixture->>'id' <> 'grounds-light' and (room->>'outdoor')::boolean) then return false; end if;
  x := (placement->'position'->>0)::double precision;
  y := (placement->'position'->>1)::double precision;
  z := (placement->'position'->>2)::double precision;
  yaw := (placement->>'rotationY')::double precision;
  if not (x between -100 and 100 and y between -1 and 4 and z between -100 and 100
    and yaw >= -pi() and yaw < pi()) then return false; end if;
  left_edge := (room->'bounds'->>0)::double precision; right_edge := (room->'bounds'->>1)::double precision;
  back_edge := (room->'bounds'->>2)::double precision; front_edge := (room->'bounds'->>3)::double precision;
  width := (fixture->'dimensions'->>0)::double precision; height := (fixture->'dimensions'->>1)::double precision;
  depth := (fixture->'dimensions'->>2)::double precision;
  if fixture->>'mount' = 'floor' and abs(y + 0.35) > epsilon then return false; end if;
  if fixture->>'mount' = 'ceiling' then
    ceiling_y := (room->>'ceiling')::double precision - height;
    if abs(y - ceiling_y) > epsilon then return false; end if;
  elsif fixture->>'mount' = 'wall' then
    if y < 0.4 - epsilon or y > least(2.3, 2.75 - height) + epsilon then return false; end if;
  elsif fixture->>'mount' = 'surface' then
    if y < 0.4 - epsilon or y > 1.3 + epsilon then return false; end if;
  end if;
  if fixture->>'mount' = 'wall' then
    inset := depth / 2 + 0.025;
    return (
      ((abs(x - (left_edge + inset)) <= epsilon and abs(yaw - pi()/2) <= epsilon)
        or (abs(x - (right_edge - inset)) <= epsilon and abs(yaw + pi()/2) <= epsilon))
        and z between back_edge + width/2 + 0.04 - epsilon and front_edge - width/2 - 0.04 + epsilon
    ) or (
      ((abs(z - (back_edge + inset)) <= epsilon and abs(yaw) <= epsilon)
        or (abs(z - (front_edge - inset)) <= epsilon and abs(yaw + pi()) <= epsilon))
        and x between left_edge + width/2 + 0.04 - epsilon and right_edge - width/2 - 0.04 + epsilon
    );
  end if;
  x_margin := abs(cos(yaw))*width/2 + abs(sin(yaw))*depth/2 + 0.04;
  z_margin := abs(sin(yaw))*width/2 + abs(cos(yaw))*depth/2 + 0.04;
  return x between left_edge + x_margin - epsilon and right_edge - x_margin + epsilon
    and z between back_edge + z_margin - epsilon and front_edge - z_margin + epsilon;
exception when numeric_value_out_of_range or invalid_text_representation then return false;
end;
$$;

/** Direct administrator writes must preserve the same registry, room and simulation boundary. */
create function public.guard_simulation_device_placement()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if (new.model_placement is not null or (tg_op = 'UPDATE' and old.model_placement is not null))
    and (auth.role() = 'authenticated' or current_setting('role', true) = 'authenticated') then
    -- A parent-home cascade has already authorized and removed the household.
    -- Its referential cleanup must not require membership rows already deleted.
    if not exists (select 1 from public.homes where id = new.home_id) then return new; end if;
    if tg_op = 'UPDATE' and old.home_id is distinct from new.home_id then
      perform public.require_simulation_device_administrator(old.home_id);
    end if;
    perform public.require_simulation_device_administrator(new.home_id);
  end if;
  if tg_op = 'UPDATE' and old.simulation_only and not new.simulation_only then
    raise exception 'Simulation devices cannot become physical devices' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.model_placement is not null and new.model_placement is null then
    raise exception 'Remove a placed simulation device instead of detaching its placement' using errcode = '22023';
  end if;
  if new.model_placement is null then return new; end if;
  if not new.simulation_only or new.model_device_id is distinct from 'placed-' || new.id::text
    or not public.valid_simulation_device_placement(new.model_placement, new.kind)
    or length(btrim(new.name)) not between 1 and 80 or new.name ~ '[[:cntrl:]]'
    or not exists (select 1 from public.rooms r where r.id = new.room_id and r.home_id = new.home_id
      and r.model_room_id = new.model_placement->>'modelRoomId') then
    raise exception 'Invalid simulation device placement' using errcode = '22023';
  end if;
  perform 1 from public.homes where id = new.home_id for update;
  if (select count(*) from public.devices where home_id = new.home_id and model_placement is not null and id <> new.id) >= 32 then
    raise exception 'This home already has 32 placed simulation devices' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger devices_guard_simulation_placement before insert or update on public.devices
for each row execute function public.guard_simulation_device_placement();

/** Raw table deletes use the same verified administrator boundary as the checked removal RPC. */
create function public.guard_simulation_device_deletion()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if old.model_placement is not null
    and (auth.role() = 'authenticated' or current_setting('role', true) = 'authenticated')
    and exists (select 1 from public.homes where id = old.home_id) then
    perform public.require_simulation_device_administrator(old.home_id);
  end if;
  return old;
end;
$$;
create trigger devices_guard_simulation_deletion before delete on public.devices
for each row execute function public.guard_simulation_device_deletion();

/** A room cannot silently strand placed devices under another model or household. */
create function public.guard_placed_device_room_binding()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if (new.model_room_id is distinct from old.model_room_id or new.home_id is distinct from old.home_id)
    and exists (select 1 from public.devices where room_id = old.id and model_placement is not null) then
    raise exception 'Remove placed devices before changing this room connection' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger rooms_guard_placed_device_binding before update of model_room_id, home_id on public.rooms
for each row execute function public.guard_placed_device_room_binding();

create table public.simulation_device_registrations (
  home_id uuid not null references public.homes(id) on delete cascade,
  request_id uuid not null,
  device_id uuid not null,
  room_id uuid not null,
  device_name text not null,
  placement jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (home_id, request_id)
);
alter table public.simulation_device_registrations enable row level security;
revoke all on public.simulation_device_registrations from public, anon, authenticated;
comment on table public.simulation_device_registrations is
  'Private idempotency journal. Receipts survive deletion so a retry never recreates a removed device.';

/** Lock with membership mutations, then require a confirmed current canonical owner or administrator. */
create function public.require_simulation_device_administrator(target_home_id uuid)
returns void language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  perform public.lock_home_membership_management(target_home_id);
  if not exists (select 1 from auth.users u join public.home_members m on m.user_id = u.id
    join public.homes h on h.id = m.home_id
    where u.id = auth.uid() and u.email_confirmed_at is not null and h.id = target_home_id
      and (m.role = 'admin' or (m.role = 'owner' and h.owner_id = u.id))) then
    raise exception 'Verified household owner or administrator required' using errcode = '42501';
  end if;
end;
$$;

/** Persist identity and geometry together. Matching retries recover the original record without duplication. */
create function public.register_simulation_device(
  target_home_id uuid, target_room_id uuid, request_id uuid, device_name text, placement jsonb
) returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare receipt public.simulation_device_registrations%rowtype; device_id uuid; fixture jsonb; normalized_name text := btrim(device_name);
begin
  perform public.require_simulation_device_administrator(target_home_id);
  if request_id is null or target_room_id is null or normalized_name is null
    or length(normalized_name) not between 1 and 80 or normalized_name ~ '[[:cntrl:]]' then
    raise exception 'Choose a valid device name and registration identifier' using errcode = '22023';
  end if;
  select t into fixture from jsonb_array_elements(public.simulation_device_template_catalog()) t where t->>'id' = placement->>'templateId';
  if not public.valid_simulation_device_placement(placement, fixture->>'kind') then
    raise exception 'Choose a valid device template and position' using errcode = '22023';
  end if;
  select * into receipt from public.simulation_device_registrations r
    where r.home_id = target_home_id and r.request_id = register_simulation_device.request_id;
  if found then
    if receipt.room_id is distinct from target_room_id or receipt.device_name is distinct from normalized_name
      or receipt.placement is distinct from placement then
      raise exception 'This registration already belongs to a different draft' using errcode = '22023';
    end if;
    if not exists (select 1 from public.devices d where d.id = receipt.device_id and d.home_id = target_home_id) then
      raise exception 'This device was already removed. Start a new draft to add another' using errcode = '22023';
    end if;
    return jsonb_build_object('homeId', target_home_id, 'deviceId', receipt.device_id, 'status', 'existing');
  end if;
  perform 1 from public.rooms r where r.id = target_room_id and r.home_id = target_home_id
    and r.model_room_id = placement->>'modelRoomId' for update;
  if not found then raise exception 'Choose a connected room in this home' using errcode = '22023'; end if;
  device_id := gen_random_uuid();
  insert into public.devices(id,home_id,room_id,name,kind,model_device_id,simulation_only,model_placement,metadata)
    values(device_id,target_home_id,target_room_id,normalized_name,fixture->>'kind','placed-' || device_id::text,true,placement,
      jsonb_build_object('source','placed-model-simulation','catalogVersion',1));
  insert into public.simulation_device_registrations(home_id,request_id,device_id,room_id,device_name,placement,created_by)
    values(target_home_id,request_id,device_id,target_room_id,normalized_name,placement,auth.uid());
  return jsonb_build_object('homeId',target_home_id,'deviceId',device_id,'status','created');
end;
$$;

/** An authorized repeat delete succeeds; authored fixtures, foreign homes and physical endpoints remain untouched. */
create function public.remove_simulation_device(target_home_id uuid, target_device_id uuid)
returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare candidate public.devices%rowtype;
begin
  perform public.require_simulation_device_administrator(target_home_id);
  if target_device_id is null then raise exception 'Choose a placed simulation device' using errcode = '22023'; end if;
  select * into candidate from public.devices d where d.id = target_device_id and d.home_id = target_home_id for update;
  if found then
    if not candidate.simulation_only or candidate.model_placement is null then
      raise exception 'Only user-placed simulation devices can be removed here' using errcode = '22023';
    end if;
    delete from public.devices where id = target_device_id and home_id = target_home_id;
  end if;
  return target_device_id;
end;
$$;
revoke all on function public.simulation_device_template_catalog(), public.simulation_device_room_catalog(),
  public.valid_simulation_device_placement(jsonb,text), public.guard_simulation_device_placement(),
  public.guard_simulation_device_deletion(), public.guard_placed_device_room_binding(),
  public.require_simulation_device_administrator(uuid) from public, anon, authenticated, service_role;
revoke all on function public.register_simulation_device(uuid,uuid,uuid,text,jsonb),
  public.remove_simulation_device(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.register_simulation_device(uuid,uuid,uuid,text,jsonb),
  public.remove_simulation_device(uuid,uuid) to authenticated;

/** Preserve placed fixtures while updating the existing authored-fixture connection workflow. */
create or replace function public.set_model_room_binding(
  target_room_id uuid, target_model_room_id text, device_bindings jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public set row_security = off as $$
declare target_home_id uuid; previous_model_room_id text;
begin
  select r.home_id into target_home_id from public.rooms r where r.id = target_room_id;
  if target_home_id is null or not public.can_manage_home(target_home_id) then
    raise exception 'Room administration required' using errcode = '42501';
  end if;
  -- Match registration's home-first ordering so rebind and add cannot deadlock.
  perform 1 from public.homes where id = target_home_id for update;
  select r.model_room_id into previous_model_room_id from public.rooms r where r.id = target_room_id and r.home_id = target_home_id for update;
  if not found or not public.can_manage_home(target_home_id) then
    raise exception 'Room administration required' using errcode = '42501';
  end if;
  if jsonb_typeof(device_bindings) is distinct from 'array' or jsonb_array_length(device_bindings) > 200 then
    raise exception 'Invalid model bindings' using errcode = '22023';
  end if;
  if target_model_room_id is distinct from previous_model_room_id and exists
    (select 1 from public.devices d where d.room_id = target_room_id and d.model_placement is not null) then
    raise exception 'Remove placed devices before changing this room connection' using errcode = '22023';
  end if;
  if target_model_room_id is null and jsonb_array_length(device_bindings) > 0 then
    raise exception 'A modeled room is required' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(device_bindings) b
    where jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'deviceId') is distinct from 'string'
      or jsonb_typeof(b->'modelDeviceId') is distinct from 'string'
      or not exists (select 1 from public.devices d where d.id::text = b->>'deviceId'
        and d.room_id = target_room_id and d.home_id = target_home_id and d.model_placement is null))
    or (select count(*) <> count(distinct b->>'deviceId') from jsonb_array_elements(device_bindings) b)
    or (select count(*) <> count(distinct b->>'modelDeviceId') from jsonb_array_elements(device_bindings) b) then
    raise exception 'Invalid room device bindings' using errcode = '22023';
  end if;
  update public.rooms set model_room_id = target_model_room_id where id = target_room_id;
  update public.devices set model_device_id = null where room_id = target_room_id and home_id = target_home_id and model_placement is null;
  update public.devices d set model_device_id = b->>'modelDeviceId' from jsonb_array_elements(device_bindings) b
    where d.id::text = b->>'deviceId' and d.room_id = target_room_id and d.home_id = target_home_id and d.model_placement is null;
end;
$$;
