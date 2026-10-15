-- Test fixtures and all mutations are rolled back; no household data is retained.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(84);
insert into auth.users(id,email,email_confirmed_at) values
('a1250000-0000-4000-8000-000000000001','owner@placement.test',now()),
('a1250000-0000-4000-8000-000000000002','admin@placement.test',now()),
('a1250000-0000-4000-8000-000000000003','guest@placement.test',now()),
('a1250000-0000-4000-8000-000000000004','tenant@placement.test',now()),
('a1250000-0000-4000-8000-000000000005','member@placement.test',now()),
('a1250000-0000-4000-8000-000000000006','other@placement.test',now()),
('a1250000-0000-4000-8000-000000000007','unverified@placement.test',null),
('a1250000-0000-4000-8000-000000000008','fake-owner@placement.test',now());
insert into homes(id,owner_id,name) values
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000001','Placement home'),
('a2250000-0000-4000-8000-000000000002','a1250000-0000-4000-8000-000000000006','Other home');
insert into home_members(home_id,user_id,role) values
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000001','owner'),
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000002','admin'),
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000003','guest'),
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000004','tenant'),
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000005','member'),
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000007','admin'),
('a2250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000008','owner'),
('a2250000-0000-4000-8000-000000000002','a1250000-0000-4000-8000-000000000006','owner');
insert into rooms(id,home_id,name,model_room_id) values
('a3250000-0000-4000-8000-000000000001','a2250000-0000-4000-8000-000000000001','Living room','living'),
('a3250000-0000-4000-8000-000000000002','a2250000-0000-4000-8000-000000000001','Kitchen','kitchen'),
('a3250000-0000-4000-8000-000000000003','a2250000-0000-4000-8000-000000000002','Other living room','living');
insert into room_members(room_id,user_id,role) values
('a3250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000003','guest');
insert into devices(id,home_id,room_id,name,kind,model_device_id,simulation_only) values
('a4250000-0000-4000-8000-000000000001','a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','Existing fixture','light','living-light',true),
('a4250000-0000-4000-8000-000000000002','a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','Physical device','light',null,false);
select ok(valid_simulation_device_placement('{"version":1,"templateId":"master-light","modelRoomId":"living","position":[7.61,2.7064,-9.282],"rotationY":0,"mount":"ceiling"}'::jsonb,'light'),'valid master-light standalone pose accepted');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb,'light'),'valid master-bedside-left standalone pose accepted');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"living-fan","modelRoomId":"living","position":[7.61,2.3764,-9.282],"rotationY":0,"mount":"ceiling"}'::jsonb,'fan'),'valid living-fan standalone pose accepted');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"master-ac","modelRoomId":"living","position":[7.61,1.5,-11.362],"rotationY":0,"mount":"wall"}'::jsonb,'ac'),'valid master-ac standalone pose accepted');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"living-speaker","modelRoomId":"living","position":[7.61,1.5,-11.387],"rotationY":0,"mount":"wall"}'::jsonb,'speaker'),'valid living-speaker standalone pose accepted');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"living-air","modelRoomId":"living","position":[7.61,1.5,-11.427],"rotationY":0,"mount":"wall"}'::jsonb,'air'),'valid living-air standalone pose accepted');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"family-tv","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb,'tv'),'valid family-tv standalone pose accepted');
select ok(valid_simulation_device_placement('{"version":1,"templateId":"grounds-light","modelRoomId":"grounds","position":[-5,-0.35,-3],"rotationY":0,"mount":"floor"}'::jsonb,'light'),'valid grounds-light standalone pose accepted');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"family-tv","modelRoomId":"living","position":[5.51,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb,'tv'),'TV stand footprint cannot intersect wall');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"master-ac","modelRoomId":"living","position":[7.61,1.5,-9.282],"rotationY":0,"mount":"wall"}'::jsonb,'ac'),'wall appliance cannot float in room');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"master-ac","modelRoomId":"living","position":[7.61,1.5,-11.362],"rotationY":1.5,"mount":"wall"}'::jsonb,'ac'),'wall appliance must face inward');
select ok(not valid_simulation_device_placement('{"version":1,"templateId":"master-light","modelRoomId":"living","position":[7.61,2,-9.282],"rotationY":0,"mount":"ceiling"}'::jsonb,'light'),'ceiling fixture must reach correct ceiling');
select ok(not has_function_privilege('anon','public.register_simulation_device(uuid,uuid,uuid,text,jsonb)','execute'),'anonymous registration denied');
select ok(not has_function_privilege('service_role','public.register_simulation_device(uuid,uuid,uuid,text,jsonb)','execute'),'service role cannot bypass user registration');
select ok(not has_function_privilege('anon','public.remove_simulation_device(uuid,uuid)','execute'),'anonymous removal denied');
select ok(not has_table_privilege('authenticated','public.simulation_device_registrations','select'),'private retry journal cannot be read');
select ok(not has_table_privilege('authenticated','public.simulation_device_registrations','insert'),'private retry journal cannot be forged');
set local role authenticated;

select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Household administration required','guest cannot register devices');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Household administration required','tenant cannot register devices');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Household administration required','member cannot register devices');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Household administration required','outsider cannot register devices');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Verified household owner or administrator required','unverified Admin cannot register devices');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Verified household owner or administrator required','noncanonical Owner cannot register devices');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000002','a3250000-0000-4000-8000-000000000003','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Household administration required','Owner cannot add to another household');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000003','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a connected room in this home','foreign room cannot cross household boundary');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000002','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a connected room in this home','model room must match registry room');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device name and registration identifier','invalid name rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device name and registration identifier','invalid name rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Lamp
name','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device name and registration identifier','invalid name rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":2,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','unknown version rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"arbitrary-asset","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','unknown asset rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"wall"}'::jsonb)$$,'22023','Choose a valid device template and position','mount spoof rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"missing","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','unknown room rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[0,0.7,0],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','outside room rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,10,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','invalid height rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":["NaN",0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','non-numeric coordinate rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282,0],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','oversized vector rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":10,"mount":"surface"}'::jsonb)$$,'22023','Choose a valid device template and position','invalid rotation rejected');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface","asset":"https://arbitrary.example/model.glb"}'::jsonb)$$,'22023','Choose a valid device template and position','arbitrary field rejected');
select is((register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)->>'status'),'created','Owner saves the device and placement atomically');
select is((select count(*) from devices where model_placement is not null),1::bigint,'one durable user-placed device exists');
select ok((select simulation_only and model_device_id='placed-' || id::text from devices where model_placement is not null),'new identity is isolated to simulation');
select is((select model_placement from devices where model_placement is not null),'{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb,'complete placement persisted');
select is((select count(*) from device_state),0::bigint,'registration invents no physical telemetry');
select is((select count(*) from device_commands),0::bigint,'registration sends no physical command');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select throws_ok($$insert into devices(id,home_id,room_id,name,kind,model_device_id,simulation_only,model_placement) values ('a4250000-0000-4000-8000-000000000099','a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','Raw lamp','light','placed-a4250000-0000-4000-8000-000000000099',true,'{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Verified household owner or administrator required','direct insert rejects unverified Admin');
select throws_ok($$update devices set name='Changed by unverified' where model_placement is not null$$,'42501','Verified household owner or administrator required','direct update rejects unverified Admin');
select throws_ok($$delete from devices where model_placement is not null$$,'42501','Verified household owner or administrator required','direct delete rejects unverified Admin');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select throws_ok($$insert into devices(id,home_id,room_id,name,kind,model_device_id,simulation_only,model_placement) values ('a4250000-0000-4000-8000-000000000099','a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','Raw lamp','light','placed-a4250000-0000-4000-8000-000000000099',true,'{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'42501','Verified household owner or administrator required','direct insert rejects noncanonical Owner');
select throws_ok($$update devices set name='Changed by unverified' where model_placement is not null$$,'42501','Verified household owner or administrator required','direct update rejects noncanonical Owner');
select throws_ok($$delete from devices where model_placement is not null$$,'42501','Verified household owner or administrator required','direct delete rejects noncanonical Owner');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$update devices set home_id='a2250000-0000-4000-8000-000000000002',room_id='a3250000-0000-4000-8000-000000000003' where model_placement is not null$$,'42501','Household administration required','direct move requires authority in destination home');
reset role;
update home_members set role='guest' where user_id='a1250000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000002","role":"authenticated"}',true);
delete from devices where model_placement is not null;
reset role;
select is((select count(*) from devices where model_placement is not null),1::bigint,'revoked administrator cannot delete existing placements');
update home_members set role='admin' where user_id='a1250000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is((register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)->>'status'),'existing','matching retry recovers existing identity');
select is((select count(*) from devices where model_placement is not null),1::bigint,'retry creates no duplicate');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Different name','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','This registration already belongs to a different draft','reused request cannot overwrite another draft');
select throws_ok($$update devices set simulation_only=false where model_placement is not null$$,'42501','Simulation devices cannot become physical devices','simulation cannot convert to physical');
select throws_ok($$update devices set model_placement=null where model_placement is not null$$,'22023','Remove a placed simulation device instead of detaching its placement','placement cannot be detached');
select throws_ok($$update devices set model_device_id='living-light-fake' where model_placement is not null$$,'22023','Invalid simulation device placement','render identity cannot be overwritten');
select throws_ok($$update devices set kind='gate' where model_placement is not null$$,'22023','Invalid simulation device placement','template kind cannot be spoofed');
select throws_ok($$update devices set room_id='a3250000-0000-4000-8000-000000000002' where model_placement is not null$$,'22023','Invalid simulation device placement','direct writes cannot move placement to wrong room');
select throws_ok($$update rooms set model_room_id='bedroom-1' where id='a3250000-0000-4000-8000-000000000001'$$,'22023','Remove placed devices before changing this room connection','direct room rebind cannot strand placement');
select throws_ok($$select set_model_room_binding('a3250000-0000-4000-8000-000000000001','bedroom-1','[]')$$,'22023','Remove placed devices before changing this room connection','authored binding flow cannot strand placed devices');
select lives_ok($$select set_model_room_binding('a3250000-0000-4000-8000-000000000001','living','[]')$$,'same room binding keeps dynamic entries');
select ok((select model_device_id='placed-' || id::text from devices where model_placement is not null),'rebinding authored fixtures preserves dynamic identity');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000002','a5250000-0000-4000-8000-000000000002','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"kitchen","position":[13.52,0.7,-10.74],"rotationY":0,"mount":"surface"}'::jsonb)->>'status'),'created','verified Admin can add devices');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from devices where model_placement is not null),1::bigint,'Guest sees only placed devices in assigned room');
select is((select count(*) from rooms),1::bigint,'placement gives Guest no additional rooms');
select throws_ok($$select remove_simulation_device('a2250000-0000-4000-8000-000000000001',(select id from devices where model_placement is not null limit 1))$$,'42501','Household administration required','Guest cannot remove visible device');
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select remove_simulation_device('a2250000-0000-4000-8000-000000000001','a4250000-0000-4000-8000-000000000001')$$,'22023','Only user-placed simulation devices can be removed here','authored fixtures outside removal flow');
select throws_ok($$select remove_simulation_device('a2250000-0000-4000-8000-000000000001','a4250000-0000-4000-8000-000000000002')$$,'22023','Only user-placed simulation devices can be removed here','physical devices outside removal flow');
reset role;
select throws_ok($$insert into device_commands(device_id) select id from devices where model_placement is not null limit 1$$,'42501','Simulation devices do not accept physical commands','central queue blocks placed simulations');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select remove_simulation_device('a2250000-0000-4000-8000-000000000001',(register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)->>'deviceId')::uuid)$$,'Owner intentionally removes device');
select is((select count(*) from devices where model_placement is not null and room_id='a3250000-0000-4000-8000-000000000001'),0::bigint,'removed placement stays absent from registry');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000001','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','This device was already removed. Start a new draft to add another','old receipt never recreates deleted devices');
select lives_ok($$select remove_simulation_device('a2250000-0000-4000-8000-000000000001','a4250000-0000-4000-8000-000000000099')$$,'repeat removal is idempotent');
reset role;
select is((select count(*) from simulation_device_registrations where home_id='a2250000-0000-4000-8000-000000000001'),2::bigint,'private receipts survive device deletion');
select is((select count(*) from room_members),1::bigint,'device operations preserve room grants');
select is((select count(*) from devices where home_id='a2250000-0000-4000-8000-000000000002'),0::bigint,'other household unchanged');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin for i in 1..31 loop perform register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001',gen_random_uuid(),'Extra lamp '||i,'{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb); end loop; end $$;
select is((select count(*) from devices where model_placement is not null),32::bigint,'bounded custom-device capacity permits exactly 32');
select throws_ok($$select register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000001','a5250000-0000-4000-8000-000000000099','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb)$$,'22023','This home already has 32 placed simulation devices','server rejects capacity overflow');
select is((register_simulation_device('a2250000-0000-4000-8000-000000000001','a3250000-0000-4000-8000-000000000002','a5250000-0000-4000-8000-000000000002','Reading lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"kitchen","position":[13.52,0.7,-10.74],"rotationY":0,"mount":"surface"}'::jsonb)->>'status'),'existing','retry works even when capacity is full');
reset role;
insert into homes(id,owner_id,name) values('a2250000-0000-4000-8000-000000000003','a1250000-0000-4000-8000-000000000001','Cleanup home');
insert into home_members(home_id,user_id,role) values('a2250000-0000-4000-8000-000000000003','a1250000-0000-4000-8000-000000000001','owner');
insert into rooms(id,home_id,name,model_room_id) values('a3250000-0000-4000-8000-000000000004','a2250000-0000-4000-8000-000000000003','Cleanup room','living');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1250000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select register_simulation_device('a2250000-0000-4000-8000-000000000003','a3250000-0000-4000-8000-000000000004',gen_random_uuid(),'Cleanup lamp','{"version":1,"templateId":"master-bedside-left","modelRoomId":"living","position":[7.61,0.7,-9.282],"rotationY":0,"mount":"surface"}'::jsonb);
select lives_ok($$delete from homes where id='a2250000-0000-4000-8000-000000000003'$$,'canonical Owner can remove the parent home with placed devices');
reset role;
select is((select count(*) from devices where home_id='a2250000-0000-4000-8000-000000000003'),0::bigint,'parent-home cleanup removes all its placements');
select * from finish();
rollback;