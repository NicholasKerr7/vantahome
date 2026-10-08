-- Property weather is household configuration, separate from personal timezone
-- preferences, room assignments, device telemetry, and action permissions.
create table public.home_weather_settings (
  home_id uuid primary key references public.homes(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  time_zone text not null check (char_length(time_zone) between 1 and 80),
  provider_consent_at timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table public.home_weather_settings is
  'Owner-confirmed coordinates shared with authorized household members and the weather provider; absent row uses public town coordinates. Grants no room or device access.';
alter table public.home_weather_settings enable row level security;
revoke all on public.home_weather_settings from public, anon, authenticated, service_role;
grant select on public.home_weather_settings to authenticated;
create policy home_weather_settings_select on public.home_weather_settings
  for select to authenticated using (public.can_access_home(home_id));

/** Save coordinates only after explicit provider consent from the canonical home owner. */
create or replace function public.set_home_weather_settings(
  target_home_id uuid,
  location_name text,
  property_latitude double precision,
  property_longitude double precision,
  property_time_zone text,
  provider_location_consent boolean
) returns jsonb language plpgsql security definer
set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
  saved public.home_weather_settings%rowtype;
begin
  if actor_id is null or auth.role() is distinct from 'authenticated' or target_home_id is null then
    raise exception 'Home owner required to change the weather location' using errcode = '42501';
  end if;
  -- Serialize config writes/reset while holding canonical ownership stable.
  select h.owner_id into owner_id from public.homes h where h.id = target_home_id for update;
  if owner_id is distinct from actor_id then
    raise exception 'Home owner required to change the weather location' using errcode = '42501';
  end if;
  if provider_location_consent is distinct from true then
    raise exception 'Confirm sharing these coordinates with the weather provider' using errcode = '22023';
  end if;
  if location_name is null or char_length(btrim(location_name)) not between 1 and 120
    or location_name ~ '[[:cntrl:]]'
    or property_latitude is null or not (property_latitude between -90 and 90)
    or property_longitude is null or not (property_longitude between -180 and 180)
    or property_time_zone is null or char_length(property_time_zone) not between 1 and 80
    or not exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = property_time_zone) then
    raise exception 'Choose valid property coordinates, name, and time zone' using errcode = '22023';
  end if;
  insert into public.home_weather_settings(home_id,name,latitude,longitude,time_zone,provider_consent_at,updated_at)
    values (target_home_id,btrim(location_name),property_latitude,property_longitude,property_time_zone,now(),now())
    on conflict (home_id) do update set name=excluded.name,latitude=excluded.latitude,
      longitude=excluded.longitude,time_zone=excluded.time_zone,
      provider_consent_at=excluded.provider_consent_at,updated_at=excluded.updated_at
    returning * into saved;
  return to_jsonb(saved);
end;
$$;

/** Revoke precise-location configuration without changing any membership or device permissions. */
create or replace function public.reset_home_weather_settings(target_home_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
begin
  if actor_id is null or auth.role() is distinct from 'authenticated' or target_home_id is null then
    raise exception 'Home owner required to change the weather location' using errcode = '42501';
  end if;
  select h.owner_id into owner_id from public.homes h where h.id = target_home_id for update;
  if owner_id is distinct from actor_id then
    raise exception 'Home owner required to change the weather location' using errcode = '42501';
  end if;
  delete from public.home_weather_settings where home_id = target_home_id;
end;
$$;
revoke all on function public.set_home_weather_settings(uuid,text,double precision,double precision,text,boolean),
  public.reset_home_weather_settings(uuid) from public, anon, service_role;
grant execute on function public.set_home_weather_settings(uuid,text,double precision,double precision,text,boolean),
  public.reset_home_weather_settings(uuid) to authenticated;
