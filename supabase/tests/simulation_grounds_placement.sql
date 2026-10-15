-- All fixtures and mutations roll back; this suite retains no household data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

select ok(not valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,-8],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'path light cannot occupy the house interior');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,0.75],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'path light clearance cannot intersect front wall');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,0.81],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'touching the front clearance edge is legal');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,0.809998],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'penetrating the front clearance edge is rejected');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,0.8099995],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'floating point snap tolerance matches the renderer');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[-0.81,-0.35,-8],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'touching the left clearance edge is legal');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[17.41,-0.35,-8],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'touching the right clearance edge is legal');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,-17.01],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'touching the rear clearance edge is legal');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[17.41,-0.35,-8],"rotationY":0.7853981633974483,"mount":"floor"}'::jsonb,'light'),'rotation includes the full rotated footprint');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[17.438994949366116,-0.35,-8],"rotationY":0.7853981633974483,"mount":"floor"}'::jsonb,'light'),'rotated fixture can touch its full clearance edge');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[34.7,-0.35,4],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'lot boundary still rejects an overhanging fixture');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[-5,-0.35,-3],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'open garden placement remains valid');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb,'light'),'indoor fixture validation remains unchanged');
select ok(not has_function_privilege('anon','public.valid_simulation_device_placement(jsonb,text)','execute'),'replacement preserves private validator privileges');
insert into auth.users(id,email,email_confirmed_at) values('a1260000-0000-4000-8000-000000000001','owner@grounds.test',now());
insert into homes(id,owner_id,name) values('a2260000-0000-4000-8000-000000000001','a1260000-0000-4000-8000-000000000001','Grounds test home');
insert into home_members(home_id,user_id,role) values('a2260000-0000-4000-8000-000000000001','a1260000-0000-4000-8000-000000000001','owner');
insert into rooms(id,home_id,name,model_room_id) values('a3260000-0000-4000-8000-000000000001','a2260000-0000-4000-8000-000000000001','Grounds','grounds');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1260000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select throws_ok($$select register_simulation_device('a2260000-0000-4000-8000-000000000001','a3260000-0000-4000-8000-000000000001','a5260000-0000-4000-8000-000000000001','Garden light','{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,-8],"rotationY":0,"mount":"floor"}'::jsonb)$$,'22023','Choose a valid device template and position','registration rejects house intrusion');
select is((select count(*) from devices),0::bigint,'rejected placement cannot create a disappearing device');
select is((register_simulation_device('a2260000-0000-4000-8000-000000000001','a3260000-0000-4000-8000-000000000001','a5260000-0000-4000-8000-000000000001','Garden light','{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,1],"rotationY":0,"mount":"floor"}'::jsonb)->>'status'),'created','corrected draft can save outside the house');
select throws_ok($$update devices set model_placement='{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,-8],"rotationY":0,"mount":"floor"}'::jsonb where model_placement is not null$$,'22023','Invalid simulation device placement','direct edits cannot bypass the house exclusion');
select is((select model_placement from devices),'{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,1],"rotationY":0,"mount":"floor"}'::jsonb,'failed update preserves the saved outdoor pose');
select throws_ok($$insert into devices(id,home_id,room_id,name,kind,model_device_id,simulation_only,model_placement) values ('a4260000-0000-4000-8000-000000000002','a2260000-0000-4000-8000-000000000001','a3260000-0000-4000-8000-000000000001','Inside lamp','light','placed-a4260000-0000-4000-8000-000000000002',true,'{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,-8],"rotationY":0,"mount":"floor"}'::jsonb)$$,'22023','Invalid simulation device placement','raw insertion cannot bypass the house exclusion');
select is((register_simulation_device('a2260000-0000-4000-8000-000000000001','a3260000-0000-4000-8000-000000000001','a5260000-0000-4000-8000-000000000001','Garden light','{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[10,-0.35,1],"rotationY":0,"mount":"floor"}'::jsonb)->>'status'),'existing','outside placement retry remains idempotent');
select is((select count(*) from devices),1::bigint,'failed and retried operations leave one saved device');
reset role;
select is((select count(*) from simulation_device_registrations where home_id='a2260000-0000-4000-8000-000000000001'),1::bigint,'invalid initial placement created no orphan receipt');
select * from finish();
rollback;