-- Phase 3: Voice OAuth + command queue

create table if not exists voice_oauth_clients (
  id text primary key,
  name text not null,
  provider text not null check (provider in ('alexa', 'google')),
  client_secret_hash text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists voice_oauth_codes (
  code text primary key,
  client_id text not null references voice_oauth_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists voice_oauth_tokens (
  access_token text primary key,
  refresh_token text unique,
  client_id text not null references voice_oauth_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  command jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_tokens_user on voice_oauth_tokens(user_id);
create index if not exists idx_voice_tokens_client on voice_oauth_tokens(client_id);
create index if not exists idx_device_commands_device on device_commands(device_id);

alter table voice_oauth_clients enable row level security;
alter table voice_oauth_codes enable row level security;
alter table voice_oauth_tokens enable row level security;
alter table device_commands enable row level security;

-- Default-deny policies to keep tokens private (service role bypasses RLS).
create policy voice_oauth_clients_deny
on voice_oauth_clients
for all
using (false)
with check (false);

create policy voice_oauth_codes_deny
on voice_oauth_codes
for all
using (false)
with check (false);

create policy voice_oauth_tokens_deny
on voice_oauth_tokens
for all
using (false)
with check (false);

create policy device_commands_deny
on device_commands
for all
using (false)
with check (false);
