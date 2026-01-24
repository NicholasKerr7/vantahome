-- Phase 4: Room-level access control and tenant/guest roles

alter table home_members
  drop constraint if exists home_members_role_check;

alter table home_members
  add constraint home_members_role_check
  check (role in ('owner', 'admin', 'member', 'guest', 'tenant'));

create table if not exists room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('member', 'guest', 'tenant')),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists idx_room_members_user on room_members(user_id);

create or replace function can_access_home_full(hid uuid)
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
      and hm.role in ('owner', 'admin', 'member')
  );
$$;

alter table room_members enable row level security;

create policy room_members_select
on room_members
for select
using (
  exists (
    select 1
    from rooms r
    where r.id = room_id
      and can_access_home_full(r.home_id)
  )
  or user_id = auth.uid()
);

create policy room_members_insert
on room_members
for insert
with check (
  exists (
    select 1
    from rooms r
    where r.id = room_id
      and can_manage_home(r.home_id)
  )
);

create policy room_members_update
on room_members
for update
using (
  exists (
    select 1
    from rooms r
    where r.id = room_id
      and can_manage_home(r.home_id)
  )
)
with check (
  exists (
    select 1
    from rooms r
    where r.id = room_id
      and can_manage_home(r.home_id)
  )
);

create policy room_members_delete
on room_members
for delete
using (
  exists (
    select 1
    from rooms r
    where r.id = room_id
      and can_manage_home(r.home_id)
  )
);

drop policy if exists rooms_select on rooms;
create policy rooms_select
on rooms
for select
using (
  can_access_home_full(home_id)
  or exists (
    select 1
    from room_members rm
    where rm.room_id = id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists devices_select on devices;
create policy devices_select
on devices
for select
using (
  can_access_home_full(home_id)
  or exists (
    select 1
    from room_members rm
    where rm.room_id = room_id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists device_state_select on device_state;
create policy device_state_select
on device_state
for select
using (
  exists (
    select 1
    from devices d
    where d.id = device_id
      and (
        can_access_home_full(d.home_id)
        or exists (
          select 1
          from room_members rm
          where rm.room_id = d.room_id
            and rm.user_id = auth.uid()
        )
      )
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
      and (
        can_access_home_full(d.home_id)
        or exists (
          select 1
          from room_members rm
          where rm.room_id = d.room_id
            and rm.user_id = auth.uid()
        )
      )
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
      and (
        can_access_home_full(d.home_id)
        or exists (
          select 1
          from room_members rm
          where rm.room_id = d.room_id
            and rm.user_id = auth.uid()
        )
      )
  )
)
with check (
  exists (
    select 1
    from devices d
    where d.id = device_id
      and (
        can_access_home_full(d.home_id)
        or exists (
          select 1
          from room_members rm
          where rm.room_id = d.room_id
            and rm.user_id = auth.uid()
        )
      )
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
      and (
        can_access_home_full(d.home_id)
        or exists (
          select 1
          from room_members rm
          where rm.room_id = d.room_id
            and rm.user_id = auth.uid()
        )
      )
  )
);
