-- Phase 2: Cloud registry schema for VantaHome
-- Supabase Auth provides auth.users; this schema adds homes, members, rooms, devices, and state.

create extension if not exists "pgcrypto";

create table if not exists homes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists home_members (
  home_id uuid not null references homes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (home_id, user_id)
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  name text not null,
  kind text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists device_state (
  device_id uuid primary key references devices(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_home_members_user on home_members(user_id);
create index if not exists idx_rooms_home on rooms(home_id);
create index if not exists idx_devices_home on devices(home_id);
create index if not exists idx_devices_room on devices(room_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger device_state_updated_at
before update on device_state
for each row
execute function set_updated_at();

-- Helpers for row-level security
create or replace function can_access_home(hid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from homes h
    where h.id = hid and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from home_members hm
    where hm.home_id = hid and hm.user_id = auth.uid()
  );
$$;

create or replace function can_manage_home(hid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from homes h
    where h.id = hid and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from home_members hm
    where hm.home_id = hid
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin')
  );
$$;

alter table homes enable row level security;
alter table home_members enable row level security;
alter table rooms enable row level security;
alter table devices enable row level security;
alter table device_state enable row level security;

-- Homes
create policy homes_select
on homes
for select
using (can_access_home(id));

create policy homes_insert
on homes
for insert
with check (owner_id = auth.uid());

create policy homes_update
on homes
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy homes_delete
on homes
for delete
using (owner_id = auth.uid());

-- Members
create policy home_members_select
on home_members
for select
using (can_access_home(home_id));

create policy home_members_insert
on home_members
for insert
with check (can_manage_home(home_id));

create policy home_members_update
on home_members
for update
using (can_manage_home(home_id))
with check (can_manage_home(home_id));

create policy home_members_delete
on home_members
for delete
using (can_manage_home(home_id));

-- Rooms
create policy rooms_select
on rooms
for select
using (can_access_home(home_id));

create policy rooms_insert
on rooms
for insert
with check (can_manage_home(home_id));

create policy rooms_update
on rooms
for update
using (can_manage_home(home_id))
with check (can_manage_home(home_id));

create policy rooms_delete
on rooms
for delete
using (can_manage_home(home_id));

-- Devices
create policy devices_select
on devices
for select
using (can_access_home(home_id));

create policy devices_insert
on devices
for insert
with check (can_manage_home(home_id));

create policy devices_update
on devices
for update
using (can_manage_home(home_id))
with check (can_manage_home(home_id));

create policy devices_delete
on devices
for delete
using (can_manage_home(home_id));

-- Device state
create policy device_state_select
on device_state
for select
using (
  exists (
    select 1
    from devices d
    where d.id = device_id and can_access_home(d.home_id)
  )
);

create policy device_state_insert
on device_state
for insert
with check (
  exists (
    select 1
    from devices d
    where d.id = device_id and can_manage_home(d.home_id)
  )
);

create policy device_state_update
on device_state
for update
using (
  exists (
    select 1
    from devices d
    where d.id = device_id and can_manage_home(d.home_id)
  )
)
with check (
  exists (
    select 1
    from devices d
    where d.id = device_id and can_manage_home(d.home_id)
  )
);

create policy device_state_delete
on device_state
for delete
using (
  exists (
    select 1
    from devices d
    where d.id = device_id and can_manage_home(d.home_id)
  )
);
