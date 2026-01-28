-- Fix room_members recursion by using security definer helpers

create or replace function can_access_room(rid uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from rooms r
    join homes h on h.id = r.home_id
    where r.id = rid
      and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from rooms r
    join home_members hm on hm.home_id = r.home_id
    where r.id = rid
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin', 'member')
  )
  or exists (
    select 1
    from room_members rm
    where rm.room_id = rid
      and rm.user_id = auth.uid()
  );
$$;

create or replace function can_manage_room(rid uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from rooms r
    join homes h on h.id = r.home_id
    where r.id = rid
      and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from rooms r
    join home_members hm on hm.home_id = r.home_id
    where r.id = rid
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin')
  );
$$;

drop policy if exists room_members_select on room_members;
drop policy if exists room_members_insert on room_members;
drop policy if exists room_members_update on room_members;
drop policy if exists room_members_delete on room_members;

create policy room_members_select
on room_members
for select
using (can_access_room(room_id));

create policy room_members_insert
on room_members
for insert
with check (can_manage_room(room_id));

create policy room_members_update
on room_members
for update
using (can_manage_room(room_id))
with check (can_manage_room(room_id));

create policy room_members_delete
on room_members
for delete
using (can_manage_room(room_id));

drop policy if exists rooms_select on rooms;
create policy rooms_select
on rooms
for select
using (can_access_room(id));

drop policy if exists devices_select on devices;
create policy devices_select
on devices
for select
using (can_access_room(room_id));

drop policy if exists device_state_select on device_state;
create policy device_state_select
on device_state
for select
using (
  exists (
    select 1
    from devices d
    where d.id = device_id
      and can_access_room(d.room_id)
  )
);

drop policy if exists device_state_insert on device_state;
create policy device_state_insert
on device_state
for insert
with check (
  exists (
    select 1
    from devices d
    where d.id = device_id
      and can_access_room(d.room_id)
  )
);

drop policy if exists device_state_update on device_state;
create policy device_state_update
on device_state
for update
using (
  exists (
    select 1
    from devices d
    where d.id = device_id
      and can_access_room(d.room_id)
  )
)
with check (
  exists (
    select 1
    from devices d
    where d.id = device_id
      and can_access_room(d.room_id)
  )
);

drop policy if exists device_state_delete on device_state;
create policy device_state_delete
on device_state
for delete
using (
  exists (
    select 1
    from devices d
    where d.id = device_id
      and can_access_room(d.room_id)
  )
);
