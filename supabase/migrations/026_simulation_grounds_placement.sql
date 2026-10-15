-- Extend the deployed registration validator without rewriting migration 025.
-- The conservative exterior envelope is shared with the property's scene geometry.
-- This changes future validation only; it does not silently move saved devices.
create or replace function public.valid_simulation_device_placement(placement jsonb, device_kind text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  fixture jsonb; room jsonb; x double precision; y double precision; z double precision;
  yaw double precision; left_edge double precision; right_edge double precision;
  back_edge double precision; front_edge double precision; width double precision;
  depth double precision; height double precision; inset double precision;
  x_margin double precision; z_margin double precision; ceiling_y double precision;
  epsilon constant double precision := 0.000001;
  house_bounds constant jsonb := $house_exclusion$[-0.7,17.3,-16.9,0.7]$house_exclusion$::jsonb;
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
  -- A bollard's rotated footprint and clearance must remain outside the house.
  -- Touching the expanded edge is allowed, matching the editor's snapped pose.
  if fixture->>'id' = 'grounds-light'
    and x > (house_bounds->>0)::double precision - x_margin + epsilon
    and x < (house_bounds->>1)::double precision + x_margin - epsilon
    and z > (house_bounds->>2)::double precision - z_margin + epsilon
    and z < (house_bounds->>3)::double precision + z_margin - epsilon then return false; end if;
  return x between left_edge + x_margin - epsilon and right_edge - x_margin + epsilon
    and z between back_edge + z_margin - epsilon and front_edge - z_margin + epsilon;
exception when numeric_value_out_of_range or invalid_text_representation then return false;
end;
$$;
