begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(68);


insert into auth.users(id,email,email_confirmed_at) values
  ('e1000000-0000-4000-8000-000000000001','person1@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000002','person2@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000003','person3@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000004','person4@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000005','person5@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000006','person6@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000007','person7@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000008','person8@extend.test',now()),
  ('e1000000-0000-4000-8000-000000000009','person9@extend.test',now());

insert into homes(id,owner_id,name) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Guest extension home'), ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000007','Foreign home');

insert into home_members(home_id,user_id,role,access_expires_at,share_interior_layout) values
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','owner',null,false),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','admin',null,false),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','guest',now()+interval '1 day',true),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','guest',now()-interval '1 day',true),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005','guest',null,false),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','tenant',null,false),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','owner',null,false),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000009','member',null,false),
  ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000007','owner',null,false),
  ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000003','guest',now()+interval '1 day',false);

insert into rooms(id,home_id,name) values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Assigned room'),('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','Private room');

insert into room_members(room_id,user_id,role) values ('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','guest'),('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','guest');

insert into devices(id,home_id,room_id,name,kind) values ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Assigned lamp','light'),('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002','Private lamp','light');

insert into member_permission_overrides(home_id,user_id,permission,allowed) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','lock.unlock',false),('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','garage.open',true);

insert into home_invites(id,home_id,email,invited_user_id,role,room_ids,access_expires_at) values
  ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','person3@extend.test','e1000000-0000-4000-8000-000000000003','guest',array['e3000000-0000-4000-8000-000000000002']::uuid[],now()+interval '7 days'),
  ('e5000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001',' PERSON4@extend.test ',null,'guest',array['e3000000-0000-4000-8000-000000000002']::uuid[],now()+interval '7 days'),
  ('e5000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','person3@extend.test','e1000000-0000-4000-8000-000000000003','guest',array[]::uuid[],now()+interval '7 days'),
  ('e5000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000001','person7@extend.test','e1000000-0000-4000-8000-000000000007','guest',array['e3000000-0000-4000-8000-000000000002']::uuid[],now()+interval '7 days');

select ok(not has_function_privilege('anon','public.extend_guest_access(uuid,uuid,timestamptz,integer,timestamptz)','execute'),'anonymous extension execution denied');

select ok(not has_function_privilege('service_role','public.extend_guest_access(uuid,uuid,timestamptz,integer,timestamptz)','execute'),'service role cannot impersonate extension actor');

select ok(not has_column_privilege('authenticated','public.home_members','access_expires_at','update'),'authenticated direct deadline update denied');

select ok(has_column_privilege('authenticated','public.home_members','role','update'),'ordinary role update grant remains');

select ok(has_column_privilege('authenticated','public.home_members','access_expires_at','insert'),'initial membership inserts retain deadline column');

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@extend.test"}',true);

select throws_ok($$update home_members set access_expires_at=now()+interval '1 year' where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'$$,'42501',null,'Owner must use the scoped RPC for deadline updates');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',now()+interval '2 days',24,null)$$,'22023','Guest access changed. Review the latest deadline','stale expected deadline rejected');

select is((select status from home_invites where id='e5000000-0000-4000-8000-000000000001'),'pending','failed extension leaves pending invitation untouched');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',null,24,null)$$,'22023','Guest access changed. Review the latest deadline','missing expected deadline rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','infinity'::timestamptz,24,null)$$,'22023','Guest access changed. Review the latest deadline','infinite expected deadline rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),null,null)$$,'22023','Choose a duration or a custom end date','exactly one extension choice required');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),24,now()+interval '3 days')$$,'22023','Choose a duration or a custom end date','exactly one extension choice required');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),0,null)$$,'22023','Choose 1 hour, 24 hours, or 7 days','unsupported duration 0 rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),-1,null)$$,'22023','Choose 1 hour, 24 hours, or 7 days','unsupported duration -1 rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),2,null)$$,'22023','Choose 1 hour, 24 hours, or 7 days','unsupported duration 2 rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),2147483647,null)$$,'22023','Choose 1 hour, 24 hours, or 7 days','unsupported duration 2147483647 rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),null,'infinity'::timestamptz)$$,'22023','Choose an end date after now and the current access deadline','infinite custom deadline rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),null,'-infinity'::timestamptz)$$,'22023','Choose an end date after now and the current access deadline','negative infinite custom deadline rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),null,now())$$,'22023','Choose an end date after now and the current access deadline','past custom deadline rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),null,now()+interval '1 day')$$,'22023','Choose an end date after now and the current access deadline','unchanged custom deadline rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),null,now()+interval '366 days')$$,'22023','Choose an end date within the next 365 days','custom deadline is bounded to one year');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005',now()+interval '1 day',24,null)$$,'22023','Choose a Guest with a valid access deadline','permanent Guest target rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006',now()+interval '1 day',24,null)$$,'22023','Choose a Guest with a valid access deadline','Tenant target rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000009',now()+interval '1 day',24,null)$$,'22023','Choose a Guest with a valid access deadline','Member target rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',now(),24,null)$$,'42501','Household invitation authority required','Owner cannot extend self');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000007',now(),24,null)$$,'22023','Choose a Guest with a valid access deadline','cross-home missing member rejected');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000003',now()+interval '1 day',24,null)$$,'42501','Household invitation authority required','Owner cannot extend a foreign home');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000008","role":"authenticated","email":"person8@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',now()+interval '1 day',24,null)$$,'42501','Household invitation authority required','fake owner role is not canonical ownership');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated","email":"person7@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',now()+interval '1 day',24,null)$$,'42501','Household invitation authority required','outsider cannot extend another home');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated","email":"person3@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',now()+interval '1 day',24,null)$$,'42501','Household invitation authority required','Guest cannot self extend');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated","email":"person4@extend.test"}',true);

select ok(not can_access_home('e2000000-0000-4000-8000-000000000001'),'expired Guest has no home access before renewal');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',now()-interval '1 day',24,null)$$,'42501','Household invitation authority required','expired Guest cannot self renew');

select set_config('request.jwt.claims','{"role":"authenticated"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',now()+interval '1 day',24,null)$$,'42501','Household invitation authority required','missing authenticated actor rejected');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@extend.test"}',true);

select is((select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),1,null)),now()+interval '25 hours','one hour adds to active access rather than replacing remaining time');

select is((select share_interior_layout from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),false,'extension resets optional interior layout consent');

select is((select status from home_invites where id='e5000000-0000-4000-8000-000000000001'),'cancelled','successful extension cancels obsolete same-user invitation');

select ok((select responded_at is not null from home_invites where id='e5000000-0000-4000-8000-000000000001'),'cancellation has a server timestamp');

select is((select status from home_invites where id='e5000000-0000-4000-8000-000000000004'),'pending','unrelated invitation remains pending');

reset role;

select is((select status from home_invites where id='e5000000-0000-4000-8000-000000000003'),'pending','same-user invitation for another home remains unchanged');

select is((select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000002' and user_id='e1000000-0000-4000-8000-000000000003'),now()+interval '1 day','other home membership deadline is unchanged');

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',now()+interval '1 day',24,null)$$,'22023','Guest access changed. Review the latest deadline','replayed operation cannot add time twice');

select is((select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),24,null)),now()+interval '49 hours','24 hours accumulates onto the exact current deadline');

select is((select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),168,null)),now()+interval '217 hours','seven day preset preserves existing remaining time');

select is((select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),null,now()+interval '10 days')),now()+interval '10 days','custom future deadline is stored exactly');

select is((select count(*) from room_members where user_id='e1000000-0000-4000-8000-000000000003'),1::bigint,'extension preserves room assignments');

select is((select allowed from member_permission_overrides where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003' and permission='lock.unlock'),false,'extension preserves explicit action denials');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated","email":"person3@extend.test"}',true);

select results_eq($$select name from rooms$$,$$values ('Assigned room'::text)$$,'extended Guest still sees only assigned room');

select results_eq($$select name from devices$$,$$values ('Assigned lamp'::text)$$,'extended Guest still sees only assigned devices');

select ok(can_perform_device_action('e4000000-0000-4000-8000-000000000001','light.control'),'extended Guest can control assigned lamp');

select ok(not can_perform_device_action('e4000000-0000-4000-8000-000000000002','light.control'),'extension cannot control an unassigned lamp');

select throws_ok($$select respond_home_invite('e5000000-0000-4000-8000-000000000001','accept')$$,'P0001','Invite already processed','cancelled old invitation cannot replace renewed access');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated","email":"person2@extend.test"}',true);

select is((select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),1,null)),now()+interval '241 hours','authorized Admin can extend ordinary Guest access');

select throws_ok($$update home_members set access_expires_at=now()+interval '1 year' where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'$$,'42501',null,'Admin cannot bypass RPC with direct update');

reset role;

insert into member_permission_overrides(home_id,user_id,permission,allowed) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','member.invite',false);

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated","email":"person2@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),24,null)$$,'42501','Household invitation authority required','Admin invitation denial blocks extension');

reset role;

delete from member_permission_overrides where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000002';

insert into member_permission_overrides(home_id,user_id,permission,allowed) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','light.control',false);

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated","email":"person2@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),24,null)$$,'42501','Ask the home owner to renew this Guest''s protected permissions','Admin cannot prolong a default Guest action denied to Admin');

reset role;

insert into member_permission_overrides(home_id,user_id,permission,allowed) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','light.control',false);

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated","email":"person2@extend.test"}',true);

select lives_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000003'),1,null)$$,'matching target denial makes Admin extension safe');

reset role;

delete from member_permission_overrides where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000002';

insert into member_permission_overrides(home_id,user_id,permission,allowed) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','garage.open',false);

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated","email":"person2@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004'),24,null)$$,'42501','Ask the home owner to renew this Guest''s protected permissions','Admin cannot revive a saved explicit Guest grant beyond own permission');

select is((select status from home_invites where id='e5000000-0000-4000-8000-000000000002'),'pending','denied renewal preserves pending invitation');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@extend.test"}',true);

select is((select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004'),24,null)),now()+interval '24 hours','Owner renewal starts at server now for expired Guest');

select is((select share_interior_layout from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004'),false,'renewal resets old interior consent');

select is((select allowed from member_permission_overrides where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004' and permission='garage.open'),true,'Owner renewal preserves explicit action grant');

select is((select status from home_invites where id='e5000000-0000-4000-8000-000000000002'),'cancelled','verified recipient email matches obsolete unbound invitation');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated","email":"person4@extend.test"}',true);

select ok(can_access_home('e2000000-0000-4000-8000-000000000001'),'renewed Guest regains access without acceptance or account setup');

select results_eq($$select name from rooms$$,$$values ('Assigned room'::text)$$,'renewal keeps original assigned room instead of pending invite rooms');

select is((select count(*) from list_my_home_invitations()),0::bigint,'renewed Guest no longer sees obsolete pending invitation');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@extend.test"}',true);

select is((select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004'),null,now()+interval '365 days')),now()+interval '365 days','exact one-year boundary is allowed');

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',(select access_expires_at from home_members where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004'),1,null)$$,'22023','Choose an end date within the next 365 days','duration preset cannot exceed one-year cap');

reset role;

update home_members set access_expires_at='infinity' where home_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000005';

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@extend.test"}',true);

select throws_ok($$select extend_guest_access('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005','infinity'::timestamptz,24,null)$$,'22023','Choose a Guest with a valid access deadline','historical infinite Guest deadline cannot be extended');

reset role;

select * from finish();

rollback;
