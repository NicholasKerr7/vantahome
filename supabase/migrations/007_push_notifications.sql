create table if not exists push_notification_devices (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null unique,
  expo_push_token text,
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  device_name text,
  device_model text,
  app_version text,
  preference_state jsonb not null default '{}'::jsonb,
  disabled_at timestamptz,
  last_seen_at timestamptz not null default now(),
  last_receipt_status text,
  last_receipt_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_push_notification_devices_token
on push_notification_devices(expo_push_token)
where expo_push_token is not null;

create index if not exists idx_push_notification_devices_home
on push_notification_devices(home_id);

create index if not exists idx_push_notification_devices_user
on push_notification_devices(user_id);

drop trigger if exists push_notification_devices_updated_at on push_notification_devices;
create trigger push_notification_devices_updated_at
before update on push_notification_devices
for each row
execute function set_updated_at();

create table if not exists push_notification_tickets (
  id uuid primary key default gen_random_uuid(),
  push_device_id uuid not null references push_notification_devices(id) on delete cascade,
  expo_ticket_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  error text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_notification_tickets_status
on push_notification_tickets(status, created_at desc);

alter table push_notification_devices enable row level security;
alter table push_notification_tickets enable row level security;
