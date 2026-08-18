begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Stable fixture IDs make it possible to call security-definer authorization
-- helpers even when RLS correctly hides the underlying device row.
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner@test.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'admin@test.invalid'),
  ('10000000-0000-0000-0000-000000000003', 'member@test.invalid'),
  ('10000000-0000-0000-0000-000000000004', 'guest@test.invalid'),
  ('10000000-0000-0000-0000-000000000005', 'tenant@test.invalid'),
  ('10000000-0000-0000-0000-000000000006', 'outsider@test.invalid'),
  ('10000000-0000-0000-0000-000000000007', 'other-owner@test.invalid');

insert into homes (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Test home'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007', 'Other home');

insert into home_members (home_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'member'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'guest'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tenant'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007', 'owner');

insert into rooms (id, home_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Assigned room'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Private room'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Foreign room');

insert into room_members (room_id, user_id, role) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'guest'),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tenant');

with kinds(kind, ordinal) as (values
  ('ac', 1), ('light', 2), ('tv', 3), ('coffee', 4),
  ('fridge', 5), ('gate', 6), ('garage', 7), ('fan', 8),
  ('door', 9), ('vacuum', 10), ('camera', 11), ('window', 12),
  ('stove', 13), ('washer', 14), ('dryer', 15), ('dishwasher', 16),
  ('microwave', 17), ('energy', 18), ('water', 19),
  ('water-heater', 20), ('air', 21), ('sprinkler', 22),
  ('speaker', 23), ('smoke', 24)
)
insert into devices (id, home_id, room_id, name, kind)
select
  format('40000000-0000-0000-0000-%s', lpad(ordinal::text, 12, '0'))::uuid,
  '20000000-0000-0000-0000-000000000001'::uuid,
  '30000000-0000-0000-0000-000000000001'::uuid,
  'matrix-' || kind,
  kind
from kinds;

insert into devices (id, home_id, room_id, name, kind) values
  ('40000000-0000-0000-0000-000000000025', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'private-light', 'light'),
  ('40000000-0000-0000-0000-000000000026', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'foreign-light', 'light');

insert into device_state (device_id, state)
select id, '{"isOn":false}'::jsonb from devices;

insert into device_audit_logs (home_id, device_id, actor_user_id, action)
values (
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'fixture.created'
);

set local role authenticated;

-- Owners, admins, and members have household-wide reads.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner@test.invalid"}', true);
select is((select count(*) from rooms), 2::bigint, 'owner sees only both rooms in their home');
select is((select count(*) from devices), 25::bigint, 'owner sees every device kind in their home');
select is((select count(*) from device_state), 25::bigint, 'owner sees state for every home device');
select is((select count(*) from device_audit_logs), 1::bigint, 'owner sees home audit rows');
select ok(can_manage_home('20000000-0000-0000-0000-000000000001'), 'owner manages their home');
select ok(not can_access_home('20000000-0000-0000-0000-000000000002'), 'owner cannot access a foreign home');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","email":"admin@test.invalid"}', true);
select is((select count(*) from rooms), 2::bigint, 'admin sees both home rooms');
select is((select count(*) from devices), 25::bigint, 'admin sees every home device kind');
select is((select count(*) from device_audit_logs), 1::bigint, 'admin sees home audit rows');
select ok(can_manage_home('20000000-0000-0000-0000-000000000001'), 'admin manages their home');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","email":"member@test.invalid"}', true);
select is((select count(*) from rooms), 2::bigint, 'member sees both home rooms');
select is((select count(*) from devices), 25::bigint, 'member sees all permitted home devices');
select is((select count(*) from device_state), 25::bigint, 'member sees all permitted home state');
select is((select count(*) from device_audit_logs), 0::bigint, 'member cannot read privileged audit rows');
select ok(not can_manage_home('20000000-0000-0000-0000-000000000001'), 'member cannot manage the home');

-- Guests and tenants are room-scoped, and cameras require a separate grant.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","email":"guest@test.invalid"}', true);
select is((select count(*) from rooms), 1::bigint, 'guest sees only the assigned room');
select is((select count(*) from devices), 23::bigint, 'guest sees assigned non-camera device kinds');
select is((select count(*) from device_state), 23::bigint, 'guest sees state only for assigned non-camera devices');
select is((select count(*) from device_audit_logs), 0::bigint, 'guest cannot read audit rows');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","email":"tenant@test.invalid"}', true);
select is((select count(*) from rooms), 1::bigint, 'tenant sees only the assigned room');
select is((select count(*) from devices), 23::bigint, 'tenant sees assigned non-camera device kinds');
select is((select count(*) from device_state), 23::bigint, 'tenant sees state only for assigned non-camera devices');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated","email":"outsider@test.invalid"}', true);
select is((select count(*) from homes), 0::bigint, 'outsider sees no homes');
select is((select count(*) from rooms), 0::bigint, 'outsider sees no rooms');
select is((select count(*) from devices), 0::bigint, 'outsider sees no devices');
select is((select count(*) from device_state), 0::bigint, 'outsider sees no state');

-- Exercise every app device kind for every household role. The expected
-- command decision is independently derived from the canonical role matrix.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
with kinds(kind, ordinal) as (values
  ('ac', 1), ('light', 2), ('tv', 3), ('coffee', 4), ('fridge', 5),
  ('gate', 6), ('garage', 7), ('fan', 8), ('door', 9), ('vacuum', 10),
  ('camera', 11), ('window', 12), ('stove', 13), ('washer', 14),
  ('dryer', 15), ('dishwasher', 16), ('microwave', 17), ('energy', 18),
  ('water', 19), ('water-heater', 20), ('air', 21), ('sprinkler', 22),
  ('speaker', 23), ('smoke', 24)
)
select ok(
  can_perform_device_action(
    format('40000000-0000-0000-0000-%s', lpad(ordinal::text, 12, '0'))::uuid,
    permission_for_device_command(kind, 'toggle', '{}'::jsonb)
  ),
  'owner command matrix: ' || kind
) from kinds;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
with kinds(kind, ordinal) as (values
  ('ac', 1), ('light', 2), ('tv', 3), ('coffee', 4), ('fridge', 5),
  ('gate', 6), ('garage', 7), ('fan', 8), ('door', 9), ('vacuum', 10),
  ('camera', 11), ('window', 12), ('stove', 13), ('washer', 14),
  ('dryer', 15), ('dishwasher', 16), ('microwave', 17), ('energy', 18),
  ('water', 19), ('water-heater', 20), ('air', 21), ('sprinkler', 22),
  ('speaker', 23), ('smoke', 24)
)
select ok(
  can_perform_device_action(
    format('40000000-0000-0000-0000-%s', lpad(ordinal::text, 12, '0'))::uuid,
    permission_for_device_command(kind, 'toggle', '{}'::jsonb)
  ),
  'admin command matrix: ' || kind
) from kinds;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
with kinds(kind, ordinal) as (values
  ('ac', 1), ('light', 2), ('tv', 3), ('coffee', 4), ('fridge', 5),
  ('gate', 6), ('garage', 7), ('fan', 8), ('door', 9), ('vacuum', 10),
  ('camera', 11), ('window', 12), ('stove', 13), ('washer', 14),
  ('dryer', 15), ('dishwasher', 16), ('microwave', 17), ('energy', 18),
  ('water', 19), ('water-heater', 20), ('air', 21), ('sprinkler', 22),
  ('speaker', 23), ('smoke', 24)
)
select is(
  can_perform_device_action(
    format('40000000-0000-0000-0000-%s', lpad(ordinal::text, 12, '0'))::uuid,
    permission_for_device_command(kind, 'toggle', '{}'::jsonb)
  ),
  role_has_action_permission('member', permission_for_device_command(kind, 'toggle', '{}'::jsonb)),
  'member command matrix: ' || kind
) from kinds;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
with kinds(kind, ordinal) as (values
  ('ac', 1), ('light', 2), ('tv', 3), ('coffee', 4), ('fridge', 5),
  ('gate', 6), ('garage', 7), ('fan', 8), ('door', 9), ('vacuum', 10),
  ('camera', 11), ('window', 12), ('stove', 13), ('washer', 14),
  ('dryer', 15), ('dishwasher', 16), ('microwave', 17), ('energy', 18),
  ('water', 19), ('water-heater', 20), ('air', 21), ('sprinkler', 22),
  ('speaker', 23), ('smoke', 24)
)
select is(
  can_perform_device_action(
    format('40000000-0000-0000-0000-%s', lpad(ordinal::text, 12, '0'))::uuid,
    permission_for_device_command(kind, 'toggle', '{}'::jsonb)
  ),
  role_has_action_permission('guest', permission_for_device_command(kind, 'toggle', '{}'::jsonb)),
  'guest command matrix: ' || kind
) from kinds;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
with kinds(kind, ordinal) as (values
  ('ac', 1), ('light', 2), ('tv', 3), ('coffee', 4), ('fridge', 5),
  ('gate', 6), ('garage', 7), ('fan', 8), ('door', 9), ('vacuum', 10),
  ('camera', 11), ('window', 12), ('stove', 13), ('washer', 14),
  ('dryer', 15), ('dishwasher', 16), ('microwave', 17), ('energy', 18),
  ('water', 19), ('water-heater', 20), ('air', 21), ('sprinkler', 22),
  ('speaker', 23), ('smoke', 24)
)
select is(
  can_perform_device_action(
    format('40000000-0000-0000-0000-%s', lpad(ordinal::text, 12, '0'))::uuid,
    permission_for_device_command(kind, 'toggle', '{}'::jsonb)
  ),
  role_has_action_permission('tenant', permission_for_device_command(kind, 'toggle', '{}'::jsonb)),
  'tenant command matrix: ' || kind
) from kinds;

-- Room scope must still apply even when the role grants the action.
select ok(
  not can_perform_device_action('40000000-0000-0000-0000-000000000025', 'light.control'),
  'tenant cannot command an unassigned room'
);
select ok(
  not can_perform_device_action('40000000-0000-0000-0000-000000000026', 'light.control'),
  'tenant cannot command a foreign home'
);

-- Observed state is immutable to every authenticated client, including owner.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is_empty(
  $$update device_state set state = '{"isOn":true}'::jsonb
    where device_id = '40000000-0000-0000-0000-000000000002'
    returning device_id$$,
  'owner cannot mutate observed device state'
);
select throws_ok(
  $$insert into device_state (device_id, state) values ('40000000-0000-0000-0000-000000000025', '{}'::jsonb)$$,
  '42501',
  null,
  'authenticated state inserts are rejected'
);

-- Per-member decisions override role defaults, but never canonical ownership.
insert into member_permission_overrides
  (home_id, user_id, permission, allowed, updated_by)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'garage.open', false, '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'camera.live', true, '10000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok(
  not can_perform_device_action('40000000-0000-0000-0000-000000000007', 'garage.open'),
  'explicit denial removes a member role permission'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*) from devices), 24::bigint, 'explicit grant reveals assigned camera');
select ok(
  can_perform_device_action('40000000-0000-0000-0000-000000000011', 'camera.live'),
  'explicit grant permits assigned camera access'
);

-- Command writes must pass actor, household, room, capability, and envelope
-- checks at the table boundary.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
insert into device_commands (
  command_id, home_id, device_id, actor_user_id, action, payload,
  nonce, idempotency_key, created_at, expires_at
) values (
  'guest-light-ok',
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000004',
  'toggle',
  '{"op":"toggle","deviceId":"40000000-0000-0000-0000-000000000002","commandId":"guest-light-ok","nonce":"guest-light-ok-nonce","idempotencyKey":"guest-light-ok-key"}'::jsonb,
  'guest-light-ok-nonce', 'guest-light-ok-key', now(), now() + interval '15 seconds'
);
select is((select count(*) from device_commands), 1::bigint, 'guest can queue an allowed assigned-room command');

select throws_ok($$
  insert into device_commands (
    command_id, home_id, device_id, actor_user_id, action, payload,
    nonce, idempotency_key, created_at, expires_at
  ) values (
    'guest-private-denied', '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000004',
    'toggle',
    '{"op":"toggle","deviceId":"40000000-0000-0000-0000-000000000025","commandId":"guest-private-denied","nonce":"guest-private-denied-nonce","idempotencyKey":"guest-private-denied-key"}'::jsonb,
    'guest-private-denied-nonce', 'guest-private-denied-key', now(), now() + interval '15 seconds'
  )
$$, '42501', null, 'unassigned-room command insert is rejected');

select throws_ok($$
  insert into device_commands (
    command_id, home_id, device_id, actor_user_id, action, payload,
    nonce, idempotency_key, created_at, expires_at
  ) values (
    'spoofed-actor-denied', '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
    'toggle',
    '{"op":"toggle","deviceId":"40000000-0000-0000-0000-000000000002","commandId":"spoofed-actor-denied","nonce":"spoofed-actor-denied-nonce","idempotencyKey":"spoofed-actor-denied-key"}'::jsonb,
    'spoofed-actor-denied-nonce', 'spoofed-actor-denied-key', now(), now() + interval '15 seconds'
  )
$$, '42501', null, 'spoofed command actor is rejected');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select ok(
  not can_perform_device_action('40000000-0000-0000-0000-000000000002', 'light.control'),
  'outsider cannot command a known device ID'
);

select * from finish();
rollback;
