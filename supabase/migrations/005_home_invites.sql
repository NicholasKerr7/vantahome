-- Phase 5: Home invites and acceptance flow

create table if not exists home_invites (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  email text not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('admin', 'member', 'guest', 'tenant')),
  room_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists home_invites_home_email_idx
on home_invites(home_id, email);

create index if not exists home_invites_home_status_idx
on home_invites(home_id, status);

create index if not exists home_invites_user_idx
on home_invites(invited_user_id);

alter table home_invites enable row level security;

drop policy if exists home_invites_select on home_invites;
create policy home_invites_select
on home_invites
for select
using (
  exists (
    select 1
    from homes h
    where h.id = home_id and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from home_members hm
    where hm.home_id = home_id
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin')
  )
  or invited_user_id = auth.uid()
  or email = (auth.jwt() ->> 'email')
);

drop policy if exists home_invites_update on home_invites;
create policy home_invites_update
on home_invites
for update
using (
  invited_user_id = auth.uid()
  or email = (auth.jwt() ->> 'email')
);
