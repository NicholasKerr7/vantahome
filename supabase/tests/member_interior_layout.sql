begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(45);

insert into auth.users(id,email,email_confirmed_at) values
  ('a1900000-0000-4000-8000-000000000001','owner@layout.test',now()),
  ('a1900000-0000-4000-8000-000000000002','admin@layout.test',now()),
  ('a1900000-0000-4000-8000-000000000003','guest@layout.test',now()),
  ('a1900000-0000-4000-8000-000000000004','tenant@layout.test',now()),
  ('a1900000-0000-4000-8000-000000000005','member@layout.test',now()),
  ('a1900000-0000-4000-8000-000000000006','outsider@layout.test',now()),
  ('a1900000-0000-4000-8000-000000000007','expired@layout.test',now()),
  ('a1900000-0000-4000-8000-000000000008','fake-owner@layout.test',now());
insert into homes(id,owner_id,name) values
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000001','Layout home'),
  ('a2900000-0000-4000-8000-000000000002','a1900000-0000-4000-8000-000000000006','Foreign home'),
  ('a2900000-0000-4000-8000-000000000003','a1900000-0000-4000-8000-000000000001','Other owned home');
insert into home_members(home_id,user_id,role) values
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000001','owner'),
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000002','admin'),
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003','guest'),
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000004','tenant'),
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000005','member'),
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000008','owner'),
  ('a2900000-0000-4000-8000-000000000002','a1900000-0000-4000-8000-000000000006','owner'),
  ('a2900000-0000-4000-8000-000000000002','a1900000-0000-4000-8000-000000000003','guest'),
  ('a2900000-0000-4000-8000-000000000003','a1900000-0000-4000-8000-000000000001','owner'),
  ('a2900000-0000-4000-8000-000000000003','a1900000-0000-4000-8000-000000000003','guest');
insert into home_members(home_id,user_id,role,access_expires_at,share_interior_layout) values
  ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000007','guest',now(),true);
insert into rooms(id,home_id,name) values
  ('a3900000-0000-4000-8000-000000000001','a2900000-0000-4000-8000-000000000001','Assigned room'),
  ('a3900000-0000-4000-8000-000000000002','a2900000-0000-4000-8000-000000000001','Private room');
insert into room_members(room_id,user_id,role) values
  ('a3900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003','guest');
insert into devices(id,home_id,room_id,name,kind) values
  ('a4900000-0000-4000-8000-000000000001','a2900000-0000-4000-8000-000000000001','a3900000-0000-4000-8000-000000000001','Assigned lamp','light'),
  ('a4900000-0000-4000-8000-000000000002','a2900000-0000-4000-8000-000000000001','a3900000-0000-4000-8000-000000000002','Private lamp','light');
insert into device_state(device_id,state) values
  ('a4900000-0000-4000-8000-000000000001','{"isOn":false}'),
  ('a4900000-0000-4000-8000-000000000002','{"isOn":true}');

select ok(not has_function_privilege('anon','public.set_member_interior_layout(uuid,uuid,boolean)','execute'),'anonymous execution denied');
select ok(not has_function_privilege('service_role','public.set_member_interior_layout(uuid,uuid,boolean)','execute'),'RPC does not grant service-role impersonation');
select ok(not has_column_privilege('authenticated','public.home_members','share_interior_layout','update'),'direct layout-column updates denied');
select ok(not has_column_privilege('authenticated','public.home_members','share_interior_layout','insert'),'direct layout-column inserts denied');
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'),false,'existing and new memberships default to no layout sharing');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true)$$,'canonical owner grants Guest layout');
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'),true,'owner sees the confirmed grant');
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000003' and user_id='a1900000-0000-4000-8000-000000000003'),false,'another owned home is unchanged');
select lives_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000004',true)$$,'canonical owner grants Tenant layout');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000002','a1900000-0000-4000-8000-000000000003',true)$$,'42501','Home owner required to share the interior layout','owner cannot grant in a foreign home');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000003','a1900000-0000-4000-8000-000000000004',true)$$,'22023','Choose a Guest or Tenant in this home','cross-home target rejected');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000005',true)$$,'22023','Choose a Guest or Tenant in this home','Member already has whole-home layout');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000002',true)$$,'22023','Choose a Guest or Tenant in this home','Admin target rejected');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000001',true)$$,'22023','Choose a Guest or Tenant in this home','Owner target rejected');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',null)$$,'22023','Choose whether to share the interior layout','null layout setting rejected');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000007',true)$$,'22023','Guest access has expired','owner cannot grant an expired guest');
select lives_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000007',false)$$,'owner can revoke an expired guest');
select throws_ok($$update home_members set share_interior_layout=false where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'$$,'42501',null,'even owner uses the scoped RPC for layout writes');

select set_config('request.jwt.claims','{"sub":"a1900000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',false)$$,'42501','Home owner required to share the interior layout','Admin cannot revoke owner layout consent');
select throws_ok($$update home_members set share_interior_layout=true where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'$$,'42501',null,'Admin generic update cannot grant layout');
select throws_ok($$insert into home_members(home_id,user_id,role,share_interior_layout) values ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000006','guest',true)$$,'42501',null,'Admin cannot grant layout during insert');
select throws_ok($$insert into home_members(home_id,user_id,role,share_interior_layout) values ('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003','guest',true) on conflict(home_id,user_id) do update set share_interior_layout=excluded.share_interior_layout$$,'42501',null,'Admin upsert cannot bypass layout protection');

select set_config('request.jwt.claims','{"sub":"a1900000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000001' and user_id=auth.uid()),true,'Guest can read owner-confirmed layout consent');
select results_eq($$select name from rooms$$,$$values ('Assigned room'::text)$$,'layout sharing exposes no additional rooms');
select results_eq($$select name from devices$$,$$values ('Assigned lamp'::text)$$,'layout sharing exposes no additional devices');
select is((select count(*) from device_state),1::bigint,'layout sharing exposes no additional telemetry');
select ok(can_perform_device_action('a4900000-0000-4000-8000-000000000001','light.control'),'assigned device control remains available');
select ok(not can_perform_device_action('a4900000-0000-4000-8000-000000000002','light.control'),'layout sharing cannot control unassigned device');
select ok(not effective_member_has_action_permission('a2900000-0000-4000-8000-000000000001',auth.uid(),'alarm.disarm'),'layout sharing grants no additional action permissions');
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true)$$,'42501','Home owner required to share the interior layout','Guest cannot self-grant layout');
select throws_ok($$update home_members set share_interior_layout=true where home_id='a2900000-0000-4000-8000-000000000001' and user_id=auth.uid()$$,'42501',null,'ordinary own-row update cannot tamper with layout');

select set_config('request.jwt.claims','{"sub":"a1900000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true)$$,'42501','Home owner required to share the interior layout','expired Guest cannot grant layout');
select is((select count(*) from home_members),0::bigint,'expired Guest cannot read layout settings');
select set_config('request.jwt.claims','{"sub":"a1900000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true)$$,'42501','Home owner required to share the interior layout','owner role label is not canonical ownership');
select set_config('request.jwt.claims','{"sub":"a1900000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true)$$,'42501','Home owner required to share the interior layout','outsider cannot grant layout');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true)$$,'42501','Home owner required to share the interior layout','missing authenticated actor rejected');

select set_config('request.jwt.claims','{"sub":"a1900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',false)$$,'owner revokes layout consent');
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'),false,'revocation is visible in the next membership snapshot');
select is((select count(*) from room_members),1::bigint,'layout revocation preserves room assignments');
select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true);
update home_members set role='tenant' where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003';
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'),false,'changed role clears old consent');
select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true);
update home_members set role='member' where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003';
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'),false,'whole-home role never retains a latent scoped grant');
update home_members set role='guest',access_expires_at=now()+interval '1 day' where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003';
select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000003',true);
update home_members set access_expires_at=now()+interval '2 days' where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003';
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000003'),false,'extended access requires renewed layout consent');
select set_member_interior_layout('a2900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000004',true);
update home_members set home_id='a2900000-0000-4000-8000-000000000003' where home_id='a2900000-0000-4000-8000-000000000001' and user_id='a1900000-0000-4000-8000-000000000004';
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000003' and user_id='a1900000-0000-4000-8000-000000000004'),false,'moving membership cannot carry consent across homes');
select set_member_interior_layout('a2900000-0000-4000-8000-000000000003','a1900000-0000-4000-8000-000000000004',true);
update home_members set user_id='a1900000-0000-4000-8000-000000000006' where home_id='a2900000-0000-4000-8000-000000000003' and user_id='a1900000-0000-4000-8000-000000000004';
select is((select share_interior_layout from home_members where home_id='a2900000-0000-4000-8000-000000000003' and user_id='a1900000-0000-4000-8000-000000000006'),false,'changing membership identity clears consent');
select is((select count(*) from member_permission_overrides),0::bigint,'layout operations never create action overrides');

reset role;
select * from finish();
rollback;
