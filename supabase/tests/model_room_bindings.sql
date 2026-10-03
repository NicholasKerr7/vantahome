begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);
insert into auth.users(id,email) values
  ('e1000000-0000-4000-8000-000000000001','owner@binding.test'),
  ('e1000000-0000-4000-8000-000000000002','admin@binding.test'),
  ('e1000000-0000-4000-8000-000000000003','guest@binding.test');
insert into homes(id,owner_id,name) values
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Home'),
  ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','Other home');
insert into home_members(home_id,user_id,role) values
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','owner'),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','admin'),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','guest');
insert into rooms(id,home_id,name,model_room_id) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Guest bedroom',null),
  ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','Private bedroom','bedroom-2'),
  ('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','Other home bedroom',null);
insert into room_members(room_id,user_id,role) values
  ('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','guest');
insert into devices(id,home_id,room_id,name,kind,model_device_id) values
  ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Guest lamp','light',null),
  ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002','Private lamp','light','bedroom-2-light'),
  ('e4000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000003','Other home lamp','light',null);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select set_model_room_binding('e3000000-0000-4000-8000-000000000001','bedroom-1','[{"deviceId":"e4000000-0000-4000-8000-000000000001","modelDeviceId":"bedroom-1-light"}]')$$,'administrator binds a room and its devices atomically');
select is((select model_room_id from rooms where id='e3000000-0000-4000-8000-000000000001'),'bedroom-1','room model identity saved');
select is((select model_device_id from devices where id='e4000000-0000-4000-8000-000000000001'),'bedroom-1-light','device model identity saved');
select throws_ok($$select set_model_room_binding('e3000000-0000-4000-8000-000000000001','bedroom-changed','[{"deviceId":"e4000000-0000-4000-8000-000000000003","modelDeviceId":"foreign-light"}]')$$,'22023','Invalid room device bindings','cross-home device is rejected');
select throws_ok($$select set_model_room_binding('e3000000-0000-4000-8000-000000000001','bedroom-changed','[{"deviceId":"e4000000-0000-4000-8000-000000000002","modelDeviceId":"other-room-light"}]')$$,'22023','Invalid room device bindings','same-home other-room device is rejected');
select is((select model_room_id from rooms where id='e3000000-0000-4000-8000-000000000001'),'bedroom-1','failed cross-room binding preserves previous room mapping');
select throws_ok($$select set_model_room_binding('e3000000-0000-4000-8000-000000000001','bedroom-2','[]')$$,'23505',null,'duplicate room mapping is rejected');
select throws_ok($$select set_model_room_binding('e3000000-0000-4000-8000-000000000001','bedroom-changed','[{"deviceId":"e4000000-0000-4000-8000-000000000001","modelDeviceId":"bedroom-2-light"}]')$$,'23505',null,'duplicate device mapping rolls back the full transaction');
select is((select model_room_id from rooms where id='e3000000-0000-4000-8000-000000000001'),'bedroom-1','failed duplicate device mapping rolls back room update');
select is((select model_device_id from devices where id='e4000000-0000-4000-8000-000000000001'),'bedroom-1-light','failed duplicate device mapping preserves previous device mapping');
select throws_ok($$select set_model_room_binding('e3000000-0000-4000-8000-000000000003','bedroom-foreign','[]')$$,'42501','Room administration required','administrator cannot bind a home they do not manage');
select is((select count(*) from room_members where user_id='e1000000-0000-4000-8000-000000000003'),1::bigint,'binding edits preserve guest room assignments');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select set_model_room_binding('e3000000-0000-4000-8000-000000000001','guest-edit','[]')$$,'42501','Room administration required','guest cannot change even their assigned room binding');
select ok(can_perform_device_action('e4000000-0000-4000-8000-000000000001','light.control'),'binding edits preserve existing authorized device control');
select ok(not can_perform_device_action('e4000000-0000-4000-8000-000000000002','light.control'),'binding edits do not grant another room');
select is_empty($$update rooms set model_room_id='guest-edit' where id='e3000000-0000-4000-8000-000000000001' returning id$$,'direct table writes also reject guest binding edits');
reset role;
select * from finish();
rollback;
