begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

insert into auth.users(id,email,email_confirmed_at) values
  ('d1000000-0000-4000-8000-000000000001','owner@guest.test',now()),
  ('d1000000-0000-4000-8000-000000000002','guest@guest.test',now());
insert into homes(id,owner_id,name) values
  ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Guest access test');
insert into home_members(home_id,user_id,role) values
  ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','owner');
insert into rooms(id,home_id,name) values
  ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Guest bedroom'),
  ('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','Private room');
insert into devices(id,home_id,room_id,name,kind) values
  ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Guest lamp','light'),
  ('d4000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002','Private lamp','light');
insert into device_state(device_id,state) values
  ('d4000000-0000-4000-8000-000000000001','{"isOn":true}'),
  ('d4000000-0000-4000-8000-000000000002','{"isOn":false}');
insert into home_invites(id,home_id,email,invited_user_id,role,room_ids,access_expires_at) values
  ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','guest@guest.test','d1000000-0000-4000-8000-000000000002','guest',array['d3000000-0000-4000-8000-000000000001']::uuid[],now()+interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated","email":"guest@guest.test"}',true);
select is((select access_expires_at from list_my_home_invitations()),now()+interval '1 hour','recipient sees the exact guest deadline before accepting');
select is(respond_home_invite('d5000000-0000-4000-8000-000000000001','accept'),'accepted','guest accepts an explicitly scoped invitation');
select is((select access_expires_at from home_members where user_id=auth.uid()),now()+interval '1 hour','acceptance preserves the send-time deadline');
select results_eq($$select name from rooms$$,$$values ('Guest bedroom'::text)$$,'guest sees only the deliberately selected room');
select results_eq($$select name from devices$$,$$values ('Guest lamp'::text)$$,'guest sees only devices in the selected room');
select is((select count(*) from device_state),1::bigint,'guest sees only authorized telemetry');
select ok(can_perform_device_action('d4000000-0000-4000-8000-000000000001','light.control'),'guest can control their assigned light before expiry');
select ok(not can_perform_device_action('d4000000-0000-4000-8000-000000000002','light.control'),'guest cannot control an unassigned light');

reset role;
-- The exact boundary is denied, without deleting membership or waiting for a job.
update home_members set access_expires_at=now() where user_id='d1000000-0000-4000-8000-000000000002';
insert into member_permission_overrides(home_id,user_id,permission,allowed) values
  ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','light.control',true);
set local role authenticated;
select is((select count(*) from homes),0::bigint,'expired guest cannot read the home registry');
select is((select count(*) from home_members),0::bigint,'expired guest cannot read household membership, including own row');
select is((select count(*) from rooms),0::bigint,'expired guest cannot read rooms');
select is((select count(*) from devices),0::bigint,'expired guest cannot read devices');
select is((select count(*) from device_state),0::bigint,'expired guest cannot read telemetry');
select ok(not effective_member_has_action_permission('d2000000-0000-4000-8000-000000000001',auth.uid(),'light.control'),'explicit allow cannot revive expired guest access');
select ok(not can_perform_device_action('d4000000-0000-4000-8000-000000000001','light.control'),'expired guest cannot enqueue control');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok(not voice_member_can_perform_device_action('d1000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001','light.control'),'trusted voice dispatch also denies expired membership');
reset role;
select is((select count(*) from home_members where user_id='d1000000-0000-4000-8000-000000000002'),1::bigint,'expired membership stays available for owner review');
update home_invites set status='pending', access_expires_at=now(),room_ids=array['d3000000-0000-4000-8000-000000000002']::uuid[];
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated","email":"guest@guest.test"}',true);
select throws_ok($$select respond_home_invite('d5000000-0000-4000-8000-000000000001','accept')$$,'P0001','Guest access expired','an access deadline is independently checked at acceptance');
reset role;
update home_invites set access_expires_at=now()+interval '1 day';
set local role authenticated;
select is(respond_home_invite('d5000000-0000-4000-8000-000000000001','accept'),'accepted','a new invitation deliberately renews expired access');
select results_eq($$select name from rooms$$,$$values ('Private room'::text)$$,'renewal replaces old room assignments rather than reviving them');
select is((select count(*) from member_permission_overrides),0::bigint,'renewal removes old per-person permission grants');
select is((select access_expires_at from home_members where user_id=auth.uid()),now()+interval '1 day','renewal installs the new fixed deadline');
reset role;
update home_invites set status='pending',access_expires_at=now()+interval '2 days';
set local role authenticated;
select throws_ok($$select respond_home_invite('d5000000-0000-4000-8000-000000000001','accept')$$,'P0001','Already a member','an old or duplicate invitation cannot overwrite active access');
reset role;
select throws_ok($$update home_members set role='tenant' where user_id='d1000000-0000-4000-8000-000000000002'$$,'23514',null,'only guest roles can carry expiry');
update home_members set role='tenant',access_expires_at=null where user_id='d1000000-0000-4000-8000-000000000002';
set local role authenticated;
select ok(can_access_home('d2000000-0000-4000-8000-000000000001'),'permanent tenant access remains unchanged');
select is((select count(*) from rooms),1::bigint,'tenant still retains assigned-room scope');
select ok(can_perform_device_action('d4000000-0000-4000-8000-000000000002','light.control'),'permanent tenant can use assigned device');
reset role;
select * from finish();
rollback;
