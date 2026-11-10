begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- All fixtures, claims, state changes and receipts roll back with this suite.
create function pg_temp.x(n integer) returns uuid language sql immutable as $$
  select ('ac290000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.login(n integer, extra jsonb default '{}') returns void language sql as $$
  select set_config('request.jwt.claims',(jsonb_build_object('sub',pg_temp.x(n),'role','authenticated',
    'session_id',pg_temp.x(100+n)) || extra)::text,true);
$$;
create function pg_temp.model(n integer) returns text language sql immutable as $$
  select case n when 401 then 'living-light' when 402 then 'bedroom-light' when 403 then 'living-camera'
    when 404 then 'entry-gate' when 405 then 'physical-light' when 406 then 'unbound'
    when 407 then 'kitchen-stove' when 408 then 'gas-meter' else 'new-light' end;
$$;
create function pg_temp.state(level integer default 50) returns jsonb language sql immutable as $$
  select jsonb_build_object('on',level>0,'level',level);
$$;
create function pg_temp.gate(phase text default 'idle',level integer default 100,extra jsonb default '{}')
returns jsonb language sql immutable as $$
  select pg_temp.state(level) || jsonb_build_object('settings',jsonb_build_object(
    'gatePhase',phase,'gateCountdownSec',0,'gateCloseTargetPercent',0,'gateLastEvent','ready',
    'autoCloseEnabled',false,'autoCloseDelaySec',30,'gateHoldOpen',false,'gateVehiclePresent',false,
    'gateBeamBlocked',false,'gateSensorFault',false,'gateEmergencyActive',false,'gateEmergencyHold',false) || extra);
$$;
create function pg_temp.initial() returns jsonb language sql immutable as $$
  select jsonb_build_object('living-light',pg_temp.state(),'bedroom-light',pg_temp.state(),
    'living-camera',pg_temp.state(),'entry-gate',pg_temp.gate('closing'),
    'kitchen-stove',pg_temp.state(),'gas-meter',pg_temp.state());
$$;
create function pg_temp.change(device integer,revision integer,state jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('deviceId',pg_temp.x(device),'modelDeviceId',pg_temp.model(device),'expectedRevision',revision,'state',state);
$$;
create function pg_temp.patch(ticket integer,device integer,revision integer,state jsonb,intent text default 'command',client integer default 901)
returns jsonb language sql as $$
  select public.patch_household_simulation(pg_temp.x(201),pg_temp.x(ticket),pg_temp.x(client),intent,
    jsonb_build_array(pg_temp.change(device,revision,state)));
$$;
create function pg_temp.read() returns jsonb language sql as $$
  select public.get_household_simulation(pg_temp.x(201));
$$;
insert into auth.users(id,email,email_confirmed_at) select pg_temp.x(n),'sync-'||n||'@qa.invalid',
  case when n<>6 then now() end from generate_series(1,8) n;
insert into auth.sessions(id,user_id,created_at) select pg_temp.x(100+n),pg_temp.x(n),now() from generate_series(1,8) n;
insert into public.homes(id,owner_id,name) values(pg_temp.x(201),pg_temp.x(1),'Canonical shared home'),(pg_temp.x(202),pg_temp.x(7),'Other home');
insert into public.home_members(home_id,user_id,role) values
  (pg_temp.x(201),pg_temp.x(1),'owner'),(pg_temp.x(201),pg_temp.x(2),'admin'),
  (pg_temp.x(201),pg_temp.x(3),'member'),(pg_temp.x(201),pg_temp.x(4),'guest'),
  (pg_temp.x(201),pg_temp.x(5),'tenant'),(pg_temp.x(201),pg_temp.x(6),'member'),
  (pg_temp.x(202),pg_temp.x(7),'owner');
insert into public.rooms(id,home_id,name) values(pg_temp.x(301),pg_temp.x(201),'Living'),
  (pg_temp.x(302),pg_temp.x(201),'Bedroom'),(pg_temp.x(303),pg_temp.x(201),'Grounds');
insert into public.room_members(room_id,user_id,role) values(pg_temp.x(301),pg_temp.x(4),'guest'),(pg_temp.x(301),pg_temp.x(5),'tenant');
insert into public.devices(id,home_id,room_id,name,kind,simulation_only,model_device_id)
  select pg_temp.x(n),pg_temp.x(201),pg_temp.x(case n when 402 then 302 when 404 then 303 else 301 end),
    pg_temp.model(n),case n when 403 then 'camera' when 404 then 'gate' when 407 then 'stove' when 408 then 'gas-meter' else 'light' end,
    n<>405,case when n<>406 then pg_temp.model(n) end from generate_series(401,408) n;
insert into public.device_state(device_id,state) values(pg_temp.x(405),'{"power":true,"sentinel":"physical"}');

select ok(not has_table_privilege('authenticated','household_simulation_receipts','select,insert,update,delete'),'receipts are private');
select ok(not has_table_privilege('authenticated','household_simulation_clocks','select,insert,update,delete'),'clock authority is private');
select ok(not has_table_privilege('authenticated','household_simulation_devices','insert,update,delete'),'direct preview writes are denied');
select ok(not has_function_privilege('authenticated','public.read_household_simulation_snapshot(uuid)','execute'),'raw snapshot helper is private');
select ok(not has_function_privilege('authenticated','public.expire_household_simulation_clock(uuid)','execute'),'clock recovery helper is private');
select ok(not has_function_privilege('anon','public.get_household_simulation(uuid)','execute'),'anonymous RPC is denied');
select is((select relreplident::text from pg_class where oid='household_simulation_devices'::regclass),'d','realtime has default replica identity');
select is((select a.attname::text from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
  where i.indrelid='household_simulation_devices'::regclass and i.indisprimary),'id','delete identity is an opaque UUID, not a device identifier');
select ok(valid_household_simulation_state('light',pg_temp.state()),'bounded primitive state accepted');
select ok(not valid_household_simulation_state('unknown',pg_temp.state()),'unknown kind rejected');
select ok(not valid_household_simulation_state('light','{"on":true,"level":101}'),'out-of-range level rejected');
select ok(not valid_household_simulation_state('light','{"on":"true","level":50}'),'coercion rejected');
select ok(not valid_household_simulation_state('light','{"on":true,"level":50,"settings":{"foreign":true}}'),'unknown setting rejected');
select ok(not valid_household_simulation_state('light','{"on":true,"level":50,"settings":{"brightness":0.5}}'),'capability step is enforced');
select ok(not valid_household_simulation_state('gate','{"on":false,"level":50}'),'opening position and on flag must agree');
select ok(not valid_household_simulation_state('gas-meter','{"on":false,"level":50}'),'gas monitors cannot be powered off');
select ok(not valid_household_simulation_state('light','{"on":true,"level":50,"settings":{"brightness":null}}'),'null settings rejected');
select ok(not valid_household_simulation_state('light','{"on":true,"level":50,"settings":{"brightness":{}}}'),'nested settings rejected');
select ok(valid_household_simulation_state('gas-meter','{"on":true,"level":50,"settings":{"gasFlowKgH":0.01}}'),'decimal capability steps accepted');

set local role authenticated;
select pg_temp.login(1,'{"session_id":"missing"}');
select throws_ok($$select pg_temp.read()$$,'42501',null,'missing stored session rejected');
select pg_temp.login(1,jsonb_build_object('session_id',pg_temp.x(102)));
select throws_ok($$select pg_temp.read()$$,'42501',null,'another account session rejected');
select pg_temp.login(1,'{"client_id":"delegated"}');
select throws_ok($$select pg_temp.read()$$,'42501',null,'delegated client rejected');
select pg_temp.login(6);
select throws_ok($$select pg_temp.read()$$,'42501',null,'unconfirmed identity rejected');
select pg_temp.login(7);
select throws_ok($$select pg_temp.read()$$,'42501',null,'other-home membership rejected');
select pg_temp.login(8);
select throws_ok($$select pg_temp.read()$$,'42501',null,'nonmember rejected');
select pg_temp.login(1);
select is(pg_temp.read()->>'enabled','false','current member sees unambiguous disabled mode');
select is(pg_temp.read()->>'homeName','Canonical shared home','review receives canonical household name');
select ok((pg_temp.read()->>'serverTimeMs') ~ '^[0-9]+$','server time is integer milliseconds');
select is(pg_temp.read()->'devices','[]'::jsonb,'disabled mode has no state');
select throws_ok($$select enable_household_simulation(pg_temp.x(201),pg_temp.x(501),pg_temp.initial()-'living-light')$$,'22023',null,'enable needs exact registry coverage');
select throws_ok($$select enable_household_simulation(pg_temp.x(201),pg_temp.x(501),pg_temp.initial()||'{"extra":{"on":true,"level":50}}')$$,'22023',null,'enable rejects extra devices');
select throws_ok($$select enable_household_simulation(pg_temp.x(201),pg_temp.x(501),jsonb_set(pg_temp.initial(),'{living-light,level}','101'))$$,'22023',null,'enable validates every state atomically');
select is(pg_temp.read()->>'enabled','false','rejected enable leaves no configuration');
select pg_temp.login(2);
select throws_ok($$select enable_household_simulation(pg_temp.x(201),pg_temp.x(501),pg_temp.initial())$$,'42501',null,'Admin cannot consent for Owner');
select pg_temp.login(1);
select is(enable_household_simulation(pg_temp.x(201),pg_temp.x(501),pg_temp.initial())->>'status','applied','Owner explicitly enables shared simulation');
select is(jsonb_array_length(pg_temp.read()->'devices'),6,'only bound simulations are seeded');
select is((select state->'settings'->>'gatePhase' from household_simulation_devices where device_id=pg_temp.x(404)),'paused','saved gate motion is paused');
select is(pg_temp.read()->'clock','null'::jsonb,'enable does not start a clock');
select is(enable_household_simulation(pg_temp.x(201),pg_temp.x(501),pg_temp.initial())->>'status','existing','identical enable retry is idempotent');
select throws_ok($$select enable_household_simulation(pg_temp.x(201),pg_temp.x(502),pg_temp.initial())$$,'VH409',null,'a second enable cannot overwrite the shared state');
select throws_ok($$select enable_household_simulation(pg_temp.x(201),pg_temp.x(501),jsonb_set(pg_temp.initial(),'{living-light,level}','40'))$$,'22023',null,'same consent request cannot change payload');
select is(pg_temp.patch(510,401,1,pg_temp.state(70))->>'status','applied','authorized command commits');
select is(pg_temp.patch(510,401,1,pg_temp.state(70))->>'status','existing','exact command retry does not increment again');
select is((select revision from household_simulation_devices where device_id=pg_temp.x(401)),2::bigint,'replay preserves revision');
select throws_ok($$select pg_temp.patch(510,401,1,pg_temp.state(80))$$,'22023',null,'same request cannot change command');
select throws_ok($$select pg_temp.patch(511,401,1,pg_temp.state(80))$$,'VH409',null,'stale revision rejected');
select throws_ok($$select patch_household_simulation(pg_temp.x(201),pg_temp.x(512),pg_temp.x(901),'command',jsonb_build_array(pg_temp.change(402,1,pg_temp.state(80)),pg_temp.change(401,1,pg_temp.state(80))))$$,'VH409',null,'mixed stale batch fails atomically');
select is((select revision from household_simulation_devices where device_id=pg_temp.x(402)),1::bigint,'earlier batch write rolls back on later conflict');
select throws_ok($$select patch_household_simulation(pg_temp.x(201),pg_temp.x(513),pg_temp.x(901),'command',jsonb_build_array(pg_temp.change(401,2,pg_temp.state()),pg_temp.change(401,2,pg_temp.state())))$$,'22023',null,'duplicate device mutation rejected');
select throws_ok($$select pg_temp.patch(514,405,0,pg_temp.state())$$,'42501',null,'physical device cannot enter shared simulation');
select throws_ok($$select pg_temp.patch(515,406,0,pg_temp.state())$$,'42501',null,'unbound simulation cannot enter shared state');
select pg_temp.login(3);
select lives_ok($$select pg_temp.patch(516,401,2,pg_temp.state(60))$$,'Member can control lights');
select throws_ok($$select pg_temp.patch(517,407,1,pg_temp.state())$$,'42501',null,'generic Member control cannot bypass stove permission');
select throws_ok($$select pg_temp.patch(518,408,1,pg_temp.state())$$,'42501',null,'generic Member control cannot bypass gas safety permission');
select throws_ok($$select pg_temp.patch(519,403,1,pg_temp.state())$$,'42501',null,'camera live access does not grant management');
select throws_ok($$select pg_temp.patch(520,404,1,pg_temp.gate())$$,'42501',null,'generic Member control does not grant gate opening');
select pg_temp.login(4);
select is(jsonb_array_length(pg_temp.read()->'devices'),3,'Guest sees only permitted noncamera room devices');
select is((select count(*) from household_simulation_devices),3::bigint,'direct realtime RLS matches scoped RPC reads');
select lives_ok($$select pg_temp.patch(521,401,3,pg_temp.state(55))$$,'Guest light permission does not require generic device control');
select throws_ok($$select pg_temp.patch(522,402,1,pg_temp.state())$$,'42501',null,'room exclusion rejects hidden device control');
select throws_ok($$select pg_temp.patch(523,407,1,pg_temp.state())$$,'42501',null,'assigned room does not grant stove control');
select is(pg_temp.read()->'clock','null'::jsonb,'hidden gate does not reveal lease data');
select pg_temp.login(1);
select set_member_permission_override(pg_temp.x(201),pg_temp.x(3),'light.control',false);
select pg_temp.login(3);
select throws_ok($$select pg_temp.patch(516,401,2,pg_temp.state(60))$$,'42501',null,'receipt replay rechecks current authority');
select pg_temp.login(1);
select set_member_permission_override(pg_temp.x(201),pg_temp.x(3),'device.view',false);
select pg_temp.login(3);
select is(jsonb_array_length(pg_temp.read()->'devices'),0,'view denial removes values and per-device revisions');
select ok(not (pg_temp.read() ? 'revision'),'snapshot never exposes a global activity revision');
select pg_temp.login(1);
select set_member_permission_override(pg_temp.x(201),pg_temp.x(3),'device.view',null);
select set_member_permission_override(pg_temp.x(201),pg_temp.x(3),'light.control',null);

-- The only timed path is a leased foreground gate tick, always one exact second.
select is(pg_temp.patch(530,404,1,pg_temp.gate('closing'))->'clock'->>'clientId',pg_temp.x(901)::text,'explicit close owns the clock');
select throws_ok($$select pg_temp.patch(531,404,2,pg_temp.gate('closing',75),'tick')$$,'VH429',null,'clock cannot tick faster than one second');
select throws_ok($$select pg_temp.patch(532,404,2,pg_temp.gate('closing',75),'tick',902)$$,'VH409',null,'another client cannot tick');
select throws_ok($$select pg_temp.patch(533,404,2,pg_temp.gate('paused',100,'{"gateCloseTargetPercent":100,"gateLastEvent":"restored-paused"}'),'pause',902)$$,'VH409',null,'another client cannot pause');
select pg_temp.login(2);
select throws_ok($$select pg_temp.patch(534,404,2,pg_temp.gate('closing',75),'tick')$$,'VH409',null,'another user cannot tick using same client ID');
select pg_temp.login(1);
reset role;
insert into auth.sessions(id,user_id,created_at) values(pg_temp.x(111),pg_temp.x(1),now());
set local role authenticated;
select pg_temp.login(1,jsonb_build_object('session_id',pg_temp.x(111)));
select throws_ok($$select pg_temp.patch(535,404,2,pg_temp.gate('closing',75),'tick')$$,'VH409',null,'another session cannot tick using same account and client');
select pg_temp.login(1);
select is(pg_temp.patch(536,404,2,pg_temp.gate('closing',100,'{"scheduleEnabled":true}'),'command',902)->'clock'->>'clientId',pg_temp.x(901)::text,'unrelated gate preference does not steal a clock');
reset role;
update household_simulation_clocks set last_tick_at=clock_timestamp()-interval '2 seconds' where home_id=pg_temp.x(201);
set local role authenticated;
select throws_ok($$select pg_temp.patch(537,404,3,pg_temp.gate('closing',50,'{"scheduleEnabled":true}'),'tick')$$,'22023',null,'tick cannot catch up more than one second');
select is(pg_temp.patch(538,404,3,pg_temp.gate('closing',75,'{"scheduleEnabled":true}'),'tick')->>'status','applied','owner advances one bounded foreground second');
select is(pg_temp.patch(539,404,4,pg_temp.gate('paused',75,'{"scheduleEnabled":true,"gateCloseTargetPercent":75,"gateLastEvent":"restored-paused"}'),'pause')->'clock','null'::jsonb,'holder pause saves state and releases lease');
select throws_ok($$select pg_temp.patch(540,404,5,pg_temp.gate('closing',50),'command')$$,'VH409',null,'a command cannot impersonate closing travel');
select lives_ok($$select pg_temp.patch(541,404,5,pg_temp.gate('countdown',100,'{"autoCloseEnabled":true,"gateCountdownSec":5}'))$$,'fresh movement may start a new clock');
select throws_ok($$select pg_temp.patch(542,404,6,pg_temp.gate('countdown',100,'{"autoCloseEnabled":true,"gateCountdownSec":4}'))$$,'VH409',null,'a command cannot impersonate countdown advancement');
reset role;
update household_simulation_clocks set expires_at=clock_timestamp()-interval '1 second' where home_id=pg_temp.x(201);
set local role authenticated;
select is((pg_temp.read()->'devices'->1->>'modelDeviceId'),'entry-gate','snapshot ordering is stable');
select is((select state->'settings'->>'gatePhase' from household_simulation_devices where device_id=pg_temp.x(404)),'paused','reading expired lease commits a paused gate');
select is(pg_temp.read()->'clock','null'::jsonb,'expired clock is removed');
select is((select revision from household_simulation_devices where device_id=pg_temp.x(404)),7::bigint,'recovery advances only the gate revision');
select lives_ok($$select pg_temp.patch(543,404,7,pg_temp.gate('idle',100,'{"gateHoldOpen":true}'))$$,'stationary hold accepted');
select throws_ok($$select pg_temp.patch(544,404,8,pg_temp.gate('closing'))$$,'VH409',null,'command cannot erase hold by omission');
select lives_ok($$select pg_temp.patch(545,404,8,pg_temp.gate('countdown',100,'{"autoCloseEnabled":true,"gateCountdownSec":30,"gateLastEvent":"released"}'))$$,'explicit release can arm full countdown');
select pg_temp.login(2);
select lives_ok($$select pg_temp.patch(546,404,9,pg_temp.gate('closing'))$$,'another authorized explicit movement replaces lease');
select pg_temp.login(1);
select set_member_permission_override(pg_temp.x(201),pg_temp.x(2),'garage.open',false);
select is(pg_temp.read()->'clock','null'::jsonb,'holder sensitive-permission revocation stops clock on read');
select is((select state->'settings'->>'gatePhase' from household_simulation_devices where device_id=pg_temp.x(404)),'paused','revoked holder cannot keep moving');

reset role;
update home_members set access_expires_at=clock_timestamp()-interval '1 second' where home_id=pg_temp.x(201) and user_id=pg_temp.x(4);
set local role authenticated;
select pg_temp.login(4);
select throws_ok($$select pg_temp.read()$$,'42501',null,'expired Guest cannot retrieve configuration');
select is((select count(*) from household_simulation_devices),0::bigint,'expired Guest receives no realtime state');
select pg_temp.login(1);
reset role;
update devices set model_device_id='replacement-light' where id=pg_temp.x(401);
set local role authenticated;
select is((select count(*) from household_simulation_devices where device_id=pg_temp.x(401)),0::bigint,'rebinding removes old preview state');
select throws_ok($$select pg_temp.patch(510,401,1,pg_temp.state(70))$$,'42501',null,'old request cannot revive a changed binding');
reset role;
update devices set model_device_id='living-light' where id=pg_temp.x(401);
set local role authenticated;
select is(pg_temp.patch(510,401,1,pg_temp.state(70))->>'status','existing','rebound identity receipt stays consumed');
select is((select count(*) from household_simulation_devices where device_id=pg_temp.x(401)),0::bigint,'replay never recreates old state');
select lives_ok($$select pg_temp.patch(550,401,0,pg_temp.state(30))$$,'new explicit command initializes a rebound simulation');
reset role;
insert into devices(id,home_id,room_id,name,kind,simulation_only,model_device_id)
  values(pg_temp.x(409),pg_temp.x(201),pg_temp.x(301),'New light','light',true,'new-light');
set local role authenticated;
select lives_ok($$select pg_temp.patch(551,409,0,pg_temp.state(20))$$,'new current bound simulation initializes at revision zero');
reset role;
delete from devices where id=pg_temp.x(409);
set local role authenticated;
select throws_ok($$select pg_temp.patch(551,409,0,pg_temp.state(20))$$,'42501',null,'deleted fixture receipt cannot recreate it');
select is((select state from device_state where device_id=pg_temp.x(405)),'{"power":true,"sentinel":"physical"}'::jsonb,'physical observation is never changed');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=pg_temp.x(101);
set local role authenticated;
select throws_ok($$select pg_temp.read()$$,'42501',null,'expired stored session rejected');
select is((select count(*) from household_simulation_devices),0::bigint,'expired session receives no realtime state');
reset role;
update auth.sessions set not_after=null where id=pg_temp.x(101);
update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=pg_temp.x(1);
set local role authenticated;
select throws_ok($$select pg_temp.read()$$,'42501',null,'banned current account rejected');
select * from finish();
rollback;
