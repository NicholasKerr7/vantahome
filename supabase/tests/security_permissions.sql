begin;

select plan(10);

select ok(role_has_action_permission('owner', 'lock.unlock'), 'owner can unlock');
select ok(role_has_action_permission('admin', 'garage.open'), 'admin can open garage');
select ok(role_has_action_permission('member', 'light.control'), 'member controls lights');
select ok(not role_has_action_permission('member', 'lock.unlock'), 'member cannot unlock by default');
select ok(role_has_action_permission('tenant', 'climate.control'), 'tenant controls climate');
select ok(not role_has_action_permission('tenant', 'garage.open'), 'tenant cannot open garage');
select ok(not role_has_action_permission('guest', 'member.invite'), 'guest cannot invite');

select is(
  permission_for_device_command(
    'garage',
    'set-properties',
    '{"changes":{"openPercent":100}}'::jsonb
  ),
  'garage.open',
  'garage opening derives the sensitive action'
);
select is(
  permission_for_device_command('light', 'set-brightness', '{}'::jsonb),
  'light.control',
  'light command derives light permission'
);
select is(
  permission_for_device_command('stove', 'toggle', '{}'::jsonb),
  'stove.control',
  'stove command derives stove permission'
);

select * from finish();
rollback;
