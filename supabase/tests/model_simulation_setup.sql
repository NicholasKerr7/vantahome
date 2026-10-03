begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);
insert into auth.users(id,email) values
  ('f1000000-0000-4000-8000-000000000001','owner@model.test'),
  ('f1000000-0000-4000-8000-000000000002','admin@model.test'),
  ('f1000000-0000-4000-8000-000000000003','guest@model.test'),
  ('f1000000-0000-4000-8000-000000000004','other-owner@model.test');
insert into homes(id,owner_id,name) values
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Empty home'),
  ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','Configured home'),
  ('f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','Another home');
insert into home_members(home_id,user_id,role) values
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','owner'),
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','admin'),
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','guest');
insert into rooms(id,home_id,name) values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','Existing room');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select create_model_simulation('f2000000-0000-4000-8000-000000000001')$$,'42501','Home owner required to prepare the model','administrator cannot create the model catalog');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select create_model_simulation('f2000000-0000-4000-8000-000000000001')$$,'42501','Home owner required to prepare the model','guest cannot create the model catalog');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select create_model_simulation('f2000000-0000-4000-8000-000000000003')$$,'42501','Home owner required to prepare the model','owner cannot modify a different household');
select throws_ok($$select create_model_simulation('f2000000-0000-4000-8000-000000000002')$$,'22023','This home already has rooms or devices. Connect its existing rooms to the model instead.','existing configured rooms are not overwritten');
select is((select create_model_simulation('f2000000-0000-4000-8000-000000000001')->>'status'),'created','owner explicitly creates the model catalog');
select is((select count(*) from rooms where home_id='f2000000-0000-4000-8000-000000000001'),20::bigint,'all authored rooms created in one household');
select is((select count(*) from devices where home_id='f2000000-0000-4000-8000-000000000001'),92::bigint,'all authored devices created in one household');
select ok((select bool_and(model_room_id is not null) from rooms where home_id='f2000000-0000-4000-8000-000000000001'),'every room has explicit model identity');
select ok((select bool_and(simulation_only and model_device_id is not null) from devices where home_id='f2000000-0000-4000-8000-000000000001'),'all virtual devices have immutable simulation marker and model identity');
select is((select count(*) from device_state s join devices d on d.id=s.device_id where d.home_id='f2000000-0000-4000-8000-000000000001'),0::bigint,'simulation creates no physical observations');
select is((select count(*) from devices d join rooms r on r.id=d.room_id where d.home_id='f2000000-0000-4000-8000-000000000001' and r.home_id=d.home_id),92::bigint,'devices reference rooms in the same home');
select is((select create_model_simulation('f2000000-0000-4000-8000-000000000001')->>'status'),'existing','network retry returns existing receipt');
select is((select count(*) from devices where home_id='f2000000-0000-4000-8000-000000000001'),92::bigint,'retry creates no duplicate devices');
select throws_ok($$update devices set simulation_only=false where model_device_id='living-light' and home_id='f2000000-0000-4000-8000-000000000001'$$,'42501','Simulation devices cannot become physical devices','owner cannot convert virtual entries into physical destinations');
select lives_ok($$update devices set name='My living light' where model_device_id='living-light' and home_id='f2000000-0000-4000-8000-000000000001'$$,'ordinary virtual device edits remain possible');
select lives_ok($$delete from devices where model_device_id='living-light' and home_id='f2000000-0000-4000-8000-000000000001'$$,'owner can remove unwanted virtual entries');
select is((select create_model_simulation('f2000000-0000-4000-8000-000000000001')->>'status'),'existing','later replay remains idempotent after customization');
select is((select count(*) from devices where home_id='f2000000-0000-4000-8000-000000000001'),91::bigint,'retry never restores deliberately removed entries');
select throws_ok($$select * from model_simulation_setups$$,'42501',null,'transaction receipts are not a public registry');
reset role;
select is((select count(*) from rooms where home_id='f2000000-0000-4000-8000-000000000003'),0::bigint,'other home stays empty');
select is((select name from rooms where id='f3000000-0000-4000-8000-000000000001'),'Existing room','configured home remains unchanged');
-- Trigger rejection comes before envelope validation, including service-side callers.
select throws_ok($$insert into device_commands(device_id) select id from devices where home_id='f2000000-0000-4000-8000-000000000001' limit 1$$,'42501','Simulation devices do not accept physical commands','queue boundary rejects virtual targets before physical dispatch');
set local role anon;
select throws_ok($$select create_model_simulation('f2000000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous callers cannot invoke setup');
reset role;
select * from finish();
rollback;
