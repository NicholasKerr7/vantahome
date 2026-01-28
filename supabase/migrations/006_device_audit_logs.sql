-- Phase 6: Device audit log

create table if not exists device_audit_logs (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_email text,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists device_audit_logs_home_id_idx
on device_audit_logs(home_id, created_at desc);

create index if not exists device_audit_logs_device_id_idx
on device_audit_logs(device_id, created_at desc);

alter table device_audit_logs enable row level security;

drop policy if exists device_audit_logs_select on device_audit_logs;
create policy device_audit_logs_select
on device_audit_logs
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
);
