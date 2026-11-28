begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

/** Isolated identities and private helpers leave no account or device changes after rollback. */
create function pg_temp.x(n integer) returns uuid language sql immutable as $$select ('ac300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.x(n),'role','authenticated','session_id',pg_temp.x(100+n))::text,true);
$$;
create function pg_temp.d(model text) returns uuid language sql as $$select id from public.devices where home_id=pg_temp.x(201) and model_device_id=model$$;
create function pg_temp.change(model text, revision integer, level integer) returns jsonb language sql as $$
 select jsonb_build_object('deviceId',pg_temp.d(model),'modelDeviceId',model,'expectedRevision',revision,'state',jsonb_build_object('on',level>0,'level',level));
$$;
insert into auth.users(id,email,email_confirmed_at) select pg_temp.x(n),'doors-'||n||'@qa.invalid',now() from generate_series(1,5)n;
insert into auth.sessions(id,user_id,created_at) select pg_temp.x(100+n),pg_temp.x(n),now() from generate_series(1,5)n;
insert into homes(id,owner_id,name) select pg_temp.x(200+n),pg_temp.x(1),'Door test '||n from generate_series(1,4)n;
insert into home_members(home_id,user_id,role) select pg_temp.x(200+n),pg_temp.x(1),'owner' from generate_series(1,4)n;
insert into home_members(home_id,user_id,role) values(pg_temp.x(201),pg_temp.x(2),'member'),(pg_temp.x(201),pg_temp.x(3),'tenant'),(pg_temp.x(201),pg_temp.x(4),'guest');
select pg_temp.login(1);
select create_model_simulation_v1(pg_temp.x(201));
delete from devices where home_id=pg_temp.x(201) and model_device_id='living-light';
update devices set name='Preserved fan' where home_id=pg_temp.x(201) and model_device_id='living-fan';
insert into household_simulation_homes(home_id) values(pg_temp.x(201));
insert into household_simulation_devices(device_id,home_id,model_device_id,state,revision)
 values(pg_temp.d('entry-door'),pg_temp.x(201),'entry-door','{"on":true,"level":37}',9);
select lives_ok($$select append_model_room_doors(pg_temp.x(201))$$,'v1 prepared home receives the additive room doors');
select is((select catalog_version from model_simulation_setups where home_id=pg_temp.x(201)),2,'one-time receipt is advanced');
select is((select device_count from model_simulation_setups where home_id=pg_temp.x(201)),119,'receipt describes the new authored catalog');
select is((select count(*) from devices where home_id=pg_temp.x(201)),118::bigint,'deleted original device remains deleted');
select is((select name from devices where id=pg_temp.d('living-fan')),'Preserved fan','customized names remain unchanged');
select is((select count(*) from household_simulation_devices where home_id=pg_temp.x(201)),28::bigint,'only new doors receive shared initial state');
select is((select revision from household_simulation_devices where device_id=pg_temp.d('entry-door')),9::bigint,'existing shared revision is preserved');
select is((select state->>'level' from household_simulation_devices where device_id=pg_temp.d('entry-door')),'37','existing entry position is preserved');
select ok((select bool_and(d.simulation_only and d.kind='door' and r.model_room_id=c->>'roomId')
 from jsonb_array_elements(model_room_door_catalog()) c join devices d on d.model_device_id=c->>'id' and d.home_id=pg_temp.x(201) join rooms r on r.id=d.room_id),'all new bindings match their canonical room and simulation kind');
select is((select count(*) from device_state where device_id in(select id from devices where home_id=pg_temp.x(201))),0::bigint,'no physical observations are fabricated');
select ok(not has_function_privilege('authenticated','public.append_model_room_doors(uuid)','execute'),'append helper is private');
select ok(not has_function_privilege('authenticated','public.create_model_simulation_v1(uuid)','execute'),'old setup implementation is private');
select ok(not has_function_privilege('anon','public.create_model_simulation(uuid)','execute'),'anonymous setup remains denied');

-- Current room membership, ordinary control and sensitive exterior entry stay distinct.
insert into room_members(room_id,user_id,role) select id,pg_temp.x(3),'tenant' from rooms where home_id=pg_temp.x(201) and model_room_id='bedroom-1';
insert into room_members(room_id,user_id,role) select id,pg_temp.x(4),'guest' from rooms where home_id=pg_temp.x(201) and model_room_id='bedroom-1';
select pg_temp.login(2);
select ok(can_control_household_simulation_device(pg_temp.d('bedroom-1-door')),'Member has interior opening permission');
select ok(not can_control_household_simulation_device(pg_temp.d('entry-door')),'Member does not acquire front entry permission');
select ok(not can_control_household_simulation_device(pg_temp.d('laundry-exterior-door')),'Member does not acquire new exterior entry permission');
select ok(not can_control_household_simulation_device(pg_temp.d('entry-gate')),'Member does not acquire gate permission');
set local role authenticated;
select lives_ok($$select patch_household_simulation(pg_temp.x(201),pg_temp.x(501),pg_temp.x(901),'command',jsonb_build_array(pg_temp.change('bedroom-1-door',1,100)))$$,'Member opens a shared room door');
select throws_ok($$select patch_household_simulation(pg_temp.x(201),pg_temp.x(502),pg_temp.x(901),'command',jsonb_build_array(pg_temp.change('bedroom-1-door',2,0),pg_temp.change('laundry-exterior-door',1,100)))$$,'42501',null,'mixed interior/exterior request is rejected atomically');
reset role;
select is((select state->>'level' from household_simulation_devices where device_id=pg_temp.d('bedroom-1-door')),'100','rejected mixed request leaves the interior pose unchanged');
select pg_temp.login(3);
select ok(can_control_household_simulation_device(pg_temp.d('bedroom-1-door')),'Tenant may operate assigned room door');
select ok(not can_control_household_simulation_device(pg_temp.d('bedroom-2-door')),'Tenant cannot operate another room door');
select pg_temp.login(4);
select ok(not can_control_household_simulation_device(pg_temp.d('bedroom-1-door')),'Guest does not inherit ordinary device control');
select pg_temp.login(2);
update devices set room_id=(select id from rooms where home_id=pg_temp.x(201) and model_room_id='family') where id=pg_temp.d('bedroom-1-door');
select ok(not can_control_household_simulation_device(pg_temp.d('bedroom-1-door')),'a mismatched room binding cannot downgrade door permissions');

-- Idempotence, deliberate deletions, missing rooms and unrelated homes.
select pg_temp.login(1);
delete from devices where id=pg_temp.d('bath-2-door');
select append_model_room_doors(pg_temp.x(201));
select is((select count(*) from devices where id=pg_temp.d('bath-2-door')),0::bigint,'deleted new door never reappears on retry');
select is((create_model_simulation(pg_temp.x(201))->>'catalogVersion'),'2','public retry returns current receipt');
select create_model_simulation_v1(pg_temp.x(202));
delete from rooms where home_id=pg_temp.x(202) and model_room_id='bath-7';
select append_model_room_doors(pg_temp.x(202));
select is((select count(*) from devices where home_id=pg_temp.x(202) and model_device_id='bath-7-door'),0::bigint,'missing rooms are not recreated or reassigned');
select append_model_room_doors(pg_temp.x(203));
select is((select count(*) from rooms where home_id=pg_temp.x(203)),0::bigint,'unprepared home remains untouched');

-- The enlarged catalog retains the full 32-fixture allowance with bounded server batches.
select is((create_model_simulation(pg_temp.x(204))->>'deviceCount'),'119','new homes include all doors through the original owner setup');
insert into devices(home_id,room_id,name,kind,model_device_id,simulation_only)
 select pg_temp.x(204),r.id,'Added light '||n,'light','placed-light-'||n,true
 from rooms r cross join generate_series(1,32)n where r.home_id=pg_temp.x(204) and r.model_room_id='living';
set local role authenticated;
select lives_ok($$select enable_household_simulation(pg_temp.x(204),pg_temp.x(504),(select jsonb_object_agg(model_device_id,jsonb_build_object('on',kind in('gas-meter','gas-leak'),'level',0)) from devices where home_id=pg_temp.x(204)))$$,'shared setup supports 119 authored and 32 additional devices');
reset role;
select is((select count(*) from household_simulation_devices where home_id=pg_temp.x(204)),151::bigint,'every bounded fixture receives one shared revision');
select * from finish();
rollback;
