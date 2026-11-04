begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(74);

-- Test-only IDs and signed-claim fixtures stay within this rolled-back connection.
create function pg_temp.x(n integer) returns uuid language sql immutable as $$
  select ('ac280000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.login(n integer, method text default 'password', age integer default 0, extra jsonb default '{}')
returns void language sql as $$
  select set_config('request.jwt.claims', (jsonb_build_object('sub',pg_temp.x(n),'session_id',pg_temp.x(100+n),
    'role','authenticated','iat',extract(epoch from clock_timestamp())::bigint,
    'amr',jsonb_build_array(jsonb_build_object('method',method,'timestamp',floor(extract(epoch from clock_timestamp()))-age))) || extra)::text,true);
$$;
create function pg_temp.offer(recipient integer, ticket integer) returns uuid language sql as $$
  select public.offer_home_ownership(pg_temp.x(201),pg_temp.x(recipient),pg_temp.x(ticket));
$$;
create function pg_temp.respond(ticket integer, action text) returns text language sql as $$
  select public.respond_home_ownership(pg_temp.x(201),pg_temp.x(ticket),action);
$$;
insert into auth.users(id,email,email_confirmed_at,banned_until)
  select pg_temp.x(n),'transfer-' || n || '@qa.invalid',case when n <> 6 then now() end,
    case when n = 8 then now() + interval '1 day' end from generate_series(1,8) n;
insert into auth.sessions(id,user_id,created_at) select pg_temp.x(100+n),pg_temp.x(n),now() from generate_series(1,8) n;
insert into public.homes(id,owner_id,name) values (pg_temp.x(201),pg_temp.x(1),'Shared property'),(pg_temp.x(202),pg_temp.x(7),'Other property');
insert into public.home_members(home_id,user_id,role) values
  (pg_temp.x(201),pg_temp.x(1),'owner'),(pg_temp.x(201),pg_temp.x(2),'member'),(pg_temp.x(201),pg_temp.x(3),'admin'),
  (pg_temp.x(201),pg_temp.x(4),'guest'),(pg_temp.x(201),pg_temp.x(5),'tenant'),(pg_temp.x(201),pg_temp.x(6),'member'),
  (pg_temp.x(201),pg_temp.x(8),'admin'),(pg_temp.x(202),pg_temp.x(7),'owner');
insert into public.rooms(id,home_id,name) values (pg_temp.x(301),pg_temp.x(201),'Living room');
insert into public.devices(id,home_id,room_id,name,kind) values (pg_temp.x(401),pg_temp.x(201),pg_temp.x(301),'Pendant','light');
insert into public.device_state(device_id,state) values(pg_temp.x(401),'{"power":true}');
insert into public.room_members(room_id,user_id,role) values(pg_temp.x(301),pg_temp.x(2),'member'),(pg_temp.x(301),pg_temp.x(4),'guest');
insert into public.member_permission_overrides(home_id,user_id,permission,allowed) values
  (pg_temp.x(201),pg_temp.x(2),'device.control',false),(pg_temp.x(201),pg_temp.x(4),'camera.live',false);
insert into public.home_invites(id,home_id,invited_user_id,email,role,room_ids)
  values(pg_temp.x(601),pg_temp.x(201),pg_temp.x(2),'transfer-2@qa.invalid','guest',array[pg_temp.x(301)]);

select ok(not has_table_privilege('authenticated','public.home_ownership_offers','select,insert,update,delete'),'receipts have no direct client access');
select ok(not has_function_privilege('authenticated','public.ownership_eligible_members(uuid,uuid)','execute'),'candidate helper is private');
select ok(not has_column_privilege('authenticated','public.homes','owner_id','update'),'canonical owner column cannot be directly changed');
select ok(has_column_privilege('authenticated','public.homes','name','update'),'existing name edits remain allowed');
set local role anon;
select throws_ok($$select pg_temp.offer(2,501)$$,'42501',null,'anonymous callers cannot offer ownership');
set local role authenticated;
select pg_temp.login(1,'password',301);
select throws_ok($$select pg_temp.offer(2,501)$$,'42501','Recent password sign-in required','a fresh iat cannot refresh a stale password proof');
select pg_temp.login(1,'token_refresh');
select throws_ok($$select pg_temp.offer(2,501)$$,'42501','Recent password sign-in required','token refresh alone cannot offer');
select pg_temp.login(1,'recovery');
select throws_ok($$select pg_temp.offer(2,501)$$,'42501','Recent password sign-in required','recovery cannot stand in for password proof');
select pg_temp.login(1,'password',-30);
select throws_ok($$select pg_temp.offer(2,501)$$,'42501','Recent password sign-in required','future AMR fails closed');
select pg_temp.login(1,'password',0,'{"amr":{"method":"password"}}');
select throws_ok($$select pg_temp.offer(2,501)$$,'42501','Recent password sign-in required','malformed AMR fails closed');
select pg_temp.login(1,'password',0,jsonb_build_object('session_id',pg_temp.x(102)));
select throws_ok($$select pg_temp.offer(2,501)$$,'42501',null,'another account session cannot authorize an offer');
select pg_temp.login(1,'password',0,'{"client_id":"third-party"}');
select throws_ok($$select pg_temp.offer(2,501)$$,'42501',null,'delegated OAuth clients cannot offer ownership');
select pg_temp.login(1);
reset role;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret) values
  (pg_temp.x(801),pg_temp.x(1),'totp','verified',now(),now(),'synthetic');
set local role authenticated;
select pg_temp.login(1);
select throws_ok($$select pg_temp.offer(2,501)$$,'42501','Verified second factor required','enrolled accounts must also complete their second factor');
select pg_temp.login(1,'password',0,'{"aal":"aal2"}');
select is((select distinct home_name from list_home_ownership_candidates(pg_temp.x(201))),'Shared property','review names the authorized household');
select is(pg_temp.offer(2,500),pg_temp.x(500),'verified second factor and recent password authorize the owner');
select is(pg_temp.respond(500,'cancel'),'cancelled','owner cancels the MFA test offer');
reset role;
delete from auth.mfa_factors where id=pg_temp.x(801);
set local role authenticated;
select pg_temp.login(1);
select is((select array_agg(email order by email) from list_home_ownership_candidates(pg_temp.x(201))),
  array['transfer-2@qa.invalid','transfer-3@qa.invalid'],'Owner sees only verified eligible same-home recipient identities');
select throws_ok($$select pg_temp.offer(1,501)$$,'42501',null,'self is ineligible');
select throws_ok($$select pg_temp.offer(4,501)$$,'42501',null,'Guest is ineligible');
select throws_ok($$select pg_temp.offer(5,501)$$,'42501',null,'Tenant is ineligible');
select throws_ok($$select pg_temp.offer(6,501)$$,'42501',null,'unconfirmed account is ineligible');
select throws_ok($$select pg_temp.offer(7,501)$$,'42501',null,'other-home owner is ineligible');
select throws_ok($$select pg_temp.offer(8,501)$$,'42501',null,'banned recipient is ineligible');
select throws_ok($$update homes set owner_id=pg_temp.x(2) where id=pg_temp.x(201)$$,'42501',null,'even a verified Owner cannot hand off via table update');
select is(pg_temp.offer(2,501),pg_temp.x(501),'verified Owner can offer to an accepted Member');
select is(pg_temp.offer(2,501),pg_temp.x(501),'same request retries the exact pending offer');
select throws_ok($$select pg_temp.offer(3,501)$$,'P0001',null,'same request cannot switch recipient');
select throws_ok($$select pg_temp.offer(3,502)$$,'P0001','A transfer is already pending','a concurrent second offer cannot silently replace the pending one');
select is((select owner_id from homes where id=pg_temp.x(201)),pg_temp.x(1),'creating the offer grants no ownership');
select is((select to_email || ':' || home_name from get_home_ownership_offer(pg_temp.x(201))),
  'transfer-2@qa.invalid:Shared property','Owner reviews the precise recipient and property');
select throws_ok($$select pg_temp.respond(501,'accept')$$,'42501',null,'sender cannot accept on behalf of the recipient');
select pg_temp.login(3);
select is((select count(*) from get_home_ownership_offer(pg_temp.x(201))),0::bigint,'other Admin cannot read the offer');
select throws_ok($$select list_home_ownership_candidates(pg_temp.x(201))$$,'42501',null,'other Admin cannot retrieve candidate emails');
select throws_ok($$select pg_temp.offer(2,502)$$,'42501',null,'other Admin cannot initiate');
select throws_ok($$select pg_temp.respond(501,'accept')$$,'42501',null,'other Admin cannot accept');
select pg_temp.login(2);
select is((select id from get_home_ownership_offer(pg_temp.x(201))),pg_temp.x(501),'named recipient sees the offer with their current session');
select throws_ok($$select respond_home_ownership(pg_temp.x(202),pg_temp.x(501),'accept')$$,'42501',null,'offer ID is bound to its home');
select throws_ok($$select pg_temp.respond(501,'cancel')$$,'42501',null,'recipient cannot impersonate sender cancellation');
select is(pg_temp.respond(501,'decline'),'declined','recipient can decline');
select is(pg_temp.respond(501,'decline'),'declined','decline retry returns the same decision');
select throws_ok($$select pg_temp.respond(501,'accept')$$,'P0001',null,'declined offers cannot be accepted');
select pg_temp.login(1);
select throws_ok($$select pg_temp.offer(2,501)$$,'P0001',null,'closed offer IDs cannot be recreated');
select is(pg_temp.offer(2,509),pg_temp.x(509),'new offer created for current confirmed recipient');
reset role;
update auth.users set banned_until=now()+interval '1 hour' where id=pg_temp.x(2);
set local role authenticated;
select pg_temp.login(1);
select is((select id from get_home_ownership_offer(pg_temp.x(201))),pg_temp.x(509),'Owner can still see the pending offer to a now-banned recipient');
select is(pg_temp.respond(509,'cancel'),'cancelled','Owner can cancel even after recipient loses eligibility');
reset role;
update auth.users set banned_until=null where id=pg_temp.x(2);
set local role authenticated;
select pg_temp.login(1);
select is(pg_temp.offer(2,502),pg_temp.x(502),'fresh explicit offer allowed');
select is(pg_temp.respond(502,'cancel'),'cancelled','sender may cancel');
select is(pg_temp.offer(2,503),pg_temp.x(503),'sender can offer again after cancellation');
select lives_ok($$select set_home_member_role(pg_temp.x(201),pg_temp.x(2),'admin')$$,'recipient role can be changed independently of offer');
select lives_ok($$select set_home_member_role(pg_temp.x(201),pg_temp.x(2),'member')$$,'recipient original role restored');
select pg_temp.login(2);
select throws_ok($$select pg_temp.respond(503,'accept')$$,'P0001',null,'returning to the prior role cannot revive old consent');
select pg_temp.login(1);
select is(pg_temp.offer(3,504),pg_temp.x(504),'Admin is eligible too');
select lives_ok($$select remove_home_member(pg_temp.x(201),pg_temp.x(3))$$,'removing a recipient invalidates its pending offer');
reset role;
insert into home_members(home_id,user_id,role) values(pg_temp.x(201),pg_temp.x(3),'admin');
set local role authenticated;
select pg_temp.login(3);
select throws_ok($$select pg_temp.respond(504,'accept')$$,'P0001',null,'re-admission cannot revive the removed membership offer');
select pg_temp.login(1);
select is(pg_temp.offer(2,505),pg_temp.x(505),'new independent offer prepared for expiry');
reset role;
update home_ownership_offers set created_at=now()-interval '25 hours',expires_at=now() where id=pg_temp.x(505);
set local role authenticated;
select pg_temp.login(2);
select is((select count(*) from get_home_ownership_offer(pg_temp.x(201))),0::bigint,'expired offer is hidden');
select throws_ok($$select pg_temp.respond(505,'accept')$$,'P0001',null,'expired offer cannot commit');
select pg_temp.login(1);
select is(pg_temp.offer(2,506),pg_temp.x(506),'expired work no longer blocks new offers');
select pg_temp.login(2,'password',310);
select throws_ok($$select pg_temp.respond(506,'accept')$$,'42501','Recent password sign-in required','recipient must supply its own fresh authentication');
select pg_temp.login(2);
select is(pg_temp.respond(506,'accept'),'accepted','eligible recipient accepts with recent password sign-in');
select is(pg_temp.respond(506,'accept'),'accepted','response loss can retry acceptance without changing roles again');
select throws_ok($$select respond_home_invite(pg_temp.x(601),'accept')$$,'P0001','Already a member','an older pending ordinary invite cannot downgrade the new Owner');
select is((select owner_id from homes where id=pg_temp.x(201)),pg_temp.x(2),'canonical ownership moved to recipient');
select is((select count(*) from home_members where home_id=pg_temp.x(201) and role='owner'),1::bigint,'exactly one owner membership remains');
select is((select role from home_members where home_id=pg_temp.x(201) and user_id=pg_temp.x(1)),'admin','former Owner now has Admin role');
select is((select role from home_members where home_id=pg_temp.x(201) and user_id=pg_temp.x(2)),'owner','recipient has Owner role');
select pg_temp.login(1);
select throws_ok($$select pg_temp.offer(3,507)$$,'42501',null,'former Owner immediately loses authority to offer');
reset role;
select is((select count(*) from member_permission_overrides where user_id=pg_temp.x(2)),0::bigint,'new Owner does not inherit stale role overrides');
select is((select allowed from member_permission_overrides where user_id=pg_temp.x(4)),false,'unrelated Guest restrictions survive');
select is((select count(*) from room_members where room_id=pg_temp.x(301)),2::bigint,'existing room grants preserved');
select ok((select resolved_by=pg_temp.x(2) and resolved_at is not null and status='accepted'
  and from_user_id=pg_temp.x(1) and to_user_id=pg_temp.x(2) from home_ownership_offers where id=pg_temp.x(506)),
  'audit receipt retains both parties and who made the successful decision');
delete from auth.sessions where id=pg_temp.x(102);
set local role authenticated;
select pg_temp.login(2);
select throws_ok($$select pg_temp.offer(3,508)$$,'42501',null,'deleted auth session blocks a still-valid-looking signed claim');
reset role;
delete from auth.users where id=pg_temp.x(1);
select is((select owner_id from homes where id=pg_temp.x(201)),pg_temp.x(2),'deleting the former owner account cannot cascade to the transferred home');
select is((select state from device_state where device_id=pg_temp.x(401)),'{"power":true}'::jsonb,'home device and state survive transfer and former-owner deletion');
select * from finish();
rollback;
