-- Every fixture and assertion is rolled back. No deployed household is modified.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(48);

insert into auth.users(id,email,email_confirmed_at) values
  ('a1210000-0000-4000-8000-000000000001','owner@weather.test',now()),
  ('a1210000-0000-4000-8000-000000000002','admin@weather.test',now()),
  ('a1210000-0000-4000-8000-000000000003','guest@weather.test',now()),
  ('a1210000-0000-4000-8000-000000000004','tenant@weather.test',now()),
  ('a1210000-0000-4000-8000-000000000005','member@weather.test',now()),
  ('a1210000-0000-4000-8000-000000000006','outsider@weather.test',now()),
  ('a1210000-0000-4000-8000-000000000007','expired@weather.test',now()),
  ('a1210000-0000-4000-8000-000000000008','fake-owner@weather.test',now());
insert into homes(id,owner_id,name) values
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000001','Weather home'),
  ('a2210000-0000-4000-8000-000000000002','a1210000-0000-4000-8000-000000000006','Foreign home');
insert into home_members(home_id,user_id,role) values
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000001','owner'),
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000002','admin'),
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000003','guest'),
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000004','tenant'),
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000005','member'),
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000008','owner'),
  ('a2210000-0000-4000-8000-000000000002','a1210000-0000-4000-8000-000000000006','owner');
insert into home_members(home_id,user_id,role,access_expires_at) values
  ('a2210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000007','guest',now());
insert into rooms(id,home_id,name) values
  ('a3210000-0000-4000-8000-000000000001','a2210000-0000-4000-8000-000000000001','Assigned room'),
  ('a3210000-0000-4000-8000-000000000002','a2210000-0000-4000-8000-000000000001','Private room');
insert into room_members(room_id,user_id,role) values
  ('a3210000-0000-4000-8000-000000000001','a1210000-0000-4000-8000-000000000003','guest');
insert into devices(id,home_id,room_id,name,kind) values
  ('a4210000-0000-4000-8000-000000000001','a2210000-0000-4000-8000-000000000001','a3210000-0000-4000-8000-000000000001','Assigned lamp','light'),
  ('a4210000-0000-4000-8000-000000000002','a2210000-0000-4000-8000-000000000001','a3210000-0000-4000-8000-000000000002','Private lamp','light');
insert into device_state(device_id,state) values
  ('a4210000-0000-4000-8000-000000000001','{"isOn":false}'),
  ('a4210000-0000-4000-8000-000000000002','{"isOn":true}');

select ok(not has_function_privilege('anon','public.set_home_weather_settings(uuid,text,double precision,double precision,text,boolean)','execute'),'anonymous save denied');
select ok(not has_function_privilege('service_role','public.set_home_weather_settings(uuid,text,double precision,double precision,text,boolean)','execute'),'service role cannot impersonate provider consent');
select ok(not has_function_privilege('anon','public.reset_home_weather_settings(uuid)','execute'),'anonymous reset denied');
select ok(not has_function_privilege('service_role','public.reset_home_weather_settings(uuid)','execute'),'service-role reset denied');
select ok(not has_table_privilege('authenticated','public.home_weather_settings','insert'),'direct insert denied');
select ok(not has_table_privilege('authenticated','public.home_weather_settings','update'),'direct update denied');
select ok(not has_table_privilege('authenticated','public.home_weather_settings','delete'),'direct delete denied');
select ok(not has_table_privilege('anon','public.home_weather_settings','select'),'anonymous coordinate reads denied');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from home_weather_settings),0::bigint,'new homes have no guessed property location');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',18.45,-78.01,'America/Jamaica',false)$$,'22023','Confirm sharing these coordinates with the weather provider','explicit provider consent required');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',18.45,-78.01,'America/Jamaica',null)$$,'22023','Confirm sharing these coordinates with the weather provider','null consent rejected');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',91,-78.01,'America/Jamaica',true)$$,'22023','Choose valid property coordinates, name, and time zone','latitude bound checked');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',18.45,-181,'America/Jamaica',true)$$,'22023','Choose valid property coordinates, name, and time zone','longitude bound checked');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property','NaN'::double precision,-78.01,'America/Jamaica',true)$$,'22023','Choose valid property coordinates, name, and time zone','NaN rejected');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',18.45,'Infinity'::double precision,'America/Jamaica',true)$$,'22023','Choose valid property coordinates, name, and time zone','infinite coordinates rejected');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',null,-78.01,'America/Jamaica',true)$$,'22023','Choose valid property coordinates, name, and time zone','missing coordinates rejected');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','  ',18.45,-78.01,'America/Jamaica',true)$$,'22023','Choose valid property coordinates, name, and time zone','empty label rejected');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001',E'Private\nname',18.45,-78.01,'America/Jamaica',true)$$,'22023','Choose valid property coordinates, name, and time zone','control characters rejected');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',18.45,-78.01,'Wrong/Zone',true)$$,'22023','Choose valid property coordinates, name, and time zone','unknown timezone rejected');
select lives_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001',' Property ',18.45,-78.01,'America/Jamaica',true)$$,'canonical Owner saves a confirmed location');
select is((select name from home_weather_settings),'Property','location label normalized');
select ok((select provider_consent_at=now() and updated_at=now() from home_weather_settings),'server records consent and update time');
select throws_ok($$update home_weather_settings set latitude=0$$,'42501',null,'Owner cannot bypass validated RPC');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000002','Foreign',18.45,-78.01,'America/Jamaica',true)$$,'42501','Home owner required to change the weather location','Owner cannot change another home');
select throws_ok($$select reset_home_weather_settings('a2210000-0000-4000-8000-000000000002')$$,'42501','Home owner required to change the weather location','Owner cannot reset another home');

select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from home_weather_settings),1::bigint,'Admin can use property weather');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',0,0,'UTC',true)$$,'42501','Home owner required to change the weather location','Admin cannot change provider consent');
select throws_ok($$select reset_home_weather_settings('a2210000-0000-4000-8000-000000000001')$$,'42501','Home owner required to change the weather location','Admin cannot reset location');

select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from home_weather_settings),1::bigint,'Guest can use property weather');
select results_eq($$select name from rooms$$,$$values ('Assigned room'::text)$$,'property weather grants no additional rooms');
select results_eq($$select name from devices$$,$$values ('Assigned lamp'::text)$$,'property weather grants no additional devices');
select is((select count(*) from device_state),1::bigint,'property weather grants no additional telemetry');
select ok(not can_perform_device_action('a4210000-0000-4000-8000-000000000002','light.control'),'property weather cannot control an unassigned device');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',0,0,'UTC',true)$$,'42501','Home owner required to change the weather location','Guest cannot change location');

select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from home_weather_settings),1::bigint,'Tenant can use property weather');
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',0,0,'UTC',true)$$,'42501','Home owner required to change the weather location','Tenant cannot change location');
select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*) from home_weather_settings),1::bigint,'Member can use property weather');
select throws_ok($$select reset_home_weather_settings('a2210000-0000-4000-8000-000000000001')$$,'42501','Home owner required to change the weather location','Member cannot reset location');

select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select is((select count(*) from home_weather_settings),0::bigint,'expired Guest cannot read property coordinates');
select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select throws_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Property',0,0,'UTC',true)$$,'42501','Home owner required to change the weather location','an Owner role label does not replace canonical ownership');
select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is((select count(*) from home_weather_settings),0::bigint,'outsider cannot read property coordinates');
select throws_ok($$select reset_home_weather_settings('a2210000-0000-4000-8000-000000000001')$$,'42501','Home owner required to change the weather location','outsider cannot reset location');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select reset_home_weather_settings('a2210000-0000-4000-8000-000000000001')$$,'42501','Home owner required to change the weather location','missing authenticated identity rejected');

select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select set_home_weather_settings('a2210000-0000-4000-8000-000000000001','Updated property',18.46,-78.02,'America/Jamaica',true)$$,'Owner updates an existing location');
select is((select latitude from home_weather_settings),18.46::double precision,'updated coordinates replace the previous location');
select lives_ok($$select reset_home_weather_settings('a2210000-0000-4000-8000-000000000001')$$,'Owner returns to the public town fallback');
select is((select count(*) from home_weather_settings),0::bigint,'reset removes precise coordinates and consent');
select is((select count(*) from room_members),1::bigint,'all weather changes preserve room assignments');

reset role;
select * from finish();
rollback;
