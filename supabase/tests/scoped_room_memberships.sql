begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);
insert into auth.users(id,email) values
  ('f1000000-0000-4000-8000-000000000001','owner@scope.test'),
  ('f1000000-0000-4000-8000-000000000002','admin@scope.test'),
  ('f1000000-0000-4000-8000-000000000003','guest@scope.test'),
  ('f1000000-0000-4000-8000-000000000004','outsider@scope.test');
insert into homes(id,owner_id,name) values
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','First home'),
  ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','Second home');
insert into home_members(home_id,user_id,role) values
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','owner'),
  ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','owner'),
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','admin'),
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','guest'),
  ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','tenant');
insert into rooms(id,home_id,name) values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','First bedroom'),
  ('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','First lounge'),
  ('f3000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000002','Second bedroom');
insert into room_members(room_id,user_id,role) values
  ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','guest'),
  ('f3000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','tenant');
select ok(not has_function_privilege('anon','public.set_home_room_memberships(uuid,uuid,uuid[])','execute'),'anonymous execution denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array['f3000000-0000-4000-8000-000000000002']::uuid[])$$,'owner replaces grants in selected home');
select is((select array_agg(room_id order by room_id) from room_members where user_id='f1000000-0000-4000-8000-000000000003'),array['f3000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000003']::uuid[],'other managed home grant survives replacement');
select is((select role from room_members where room_id='f3000000-0000-4000-8000-000000000002'),'guest','assignment uses authoritative household role');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array['f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000003']::uuid[])$$,'22023','Every room must belong to the selected home','mixed-home batch is rejected');
select is((select count(*) from room_members where room_id='f3000000-0000-4000-8000-000000000002'),1::bigint,'failed batch retains previous selected-home grant');
select is((select count(*) from room_members where room_id='f3000000-0000-4000-8000-000000000001'),0::bigint,'failed batch cannot partially add a room');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array['f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001']::uuid[])$$,'22023','Invalid room assignments','duplicate rooms rejected');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',null)$$,'22023','Invalid room assignments','null room list rejected');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array[null]::uuid[])$$,'22023','Invalid room assignments','null room identity rejected');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004',array[]::uuid[])$$,'22023','Choose a current room-assignable member','a missing member cannot receive assignments');
select lives_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array[]::uuid[])$$,'empty assignment explicitly clears selected home');
select is((select array_agg(room_id) from room_members where user_id='f1000000-0000-4000-8000-000000000003'),array['f3000000-0000-4000-8000-000000000003']::uuid[],'other managed home grant survives clear');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array['f3000000-0000-4000-8000-000000000001']::uuid[])$$,'administrator may update ordinary member grants');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',array[]::uuid[])$$,'42501','Household administration required','administrator cannot affect unmanaged home');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',array[]::uuid[])$$,'42501','Household administration required','administrator cannot edit owner assignments');
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',array[]::uuid[])$$,'42501','Household administration required','administrator cannot edit their own assignments');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array['f3000000-0000-4000-8000-000000000002']::uuid[])$$,'42501','Household administration required','guest cannot grant their own access');
select ok(can_access_room('f3000000-0000-4000-8000-000000000001'),'guest keeps assigned room');
select ok(not can_access_room('f3000000-0000-4000-8000-000000000002'),'rejected guest write grants no extra room');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array[]::uuid[])$$,'42501','Household administration required','outsider cannot revoke assignments');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update home_members set role='tenant' where home_id='f2000000-0000-4000-8000-000000000001' and user_id='f1000000-0000-4000-8000-000000000003';
select lives_ok($$select set_home_room_memberships('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',array['f3000000-0000-4000-8000-000000000001']::uuid[])$$,'replacement accepts authoritative role change');
select is((select role from room_members where room_id='f3000000-0000-4000-8000-000000000001'),'tenant','room membership role refreshes from server');
reset role;
select * from finish();
rollback;
