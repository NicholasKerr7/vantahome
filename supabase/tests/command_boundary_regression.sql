begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('b1000000-0000-0000-0000-000000000001','owner@boundary.test'),
  ('b1000000-0000-0000-0000-000000000002','admin@boundary.test'),
  ('b1000000-0000-0000-0000-000000000003','member@boundary.test'),
  ('b1000000-0000-0000-0000-000000000004','guest@boundary.test'),
  ('b1000000-0000-0000-0000-000000000005','other-owner@boundary.test');
insert into homes(id,owner_id,name) values
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Boundary home'),
  ('b2000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000005','Separate home');
insert into home_members(home_id,user_id,role) values
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','owner'),
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','admin'),
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','member'),
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004','guest'),
  ('b2000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000005','owner');
insert into rooms(id,home_id,name) values
  ('b3000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','Assigned room'),
  ('b3000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','Separate room');
insert into room_members(room_id,user_id,role) values
  ('b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004','guest');
insert into devices(id,home_id,room_id,name,kind)
select ('b4000000-0000-0000-0000-' || lpad(ordinal::text,12,'0'))::uuid,
  'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', kind, kind
from unnest(array['ac','light','tv','coffee','fridge','gate','garage','fan','door','vacuum','camera','window',
  'stove','washer','dryer','dishwasher','microwave','energy','water','water-heater','air','sprinkler','speaker','smoke'])
with ordinality as kinds(kind,ordinal);
insert into home_invites(home_id,email,role) values
  ('b2000000-0000-0000-0000-000000000001','guest@boundary.test','guest'),
  ('b2000000-0000-0000-0000-000000000002','other-owner@boundary.test','member');
insert into device_audit_logs(home_id,action) values
  ('b2000000-0000-0000-0000-000000000001','fixture'),
  ('b2000000-0000-0000-0000-000000000002','fixture');

create function pg_temp.queue_checked_command(label text, ordinal integer default 2,
  operation text default 'toggle', body jsonb default '{}'::jsonb,
  initial_status text default 'created', omitted text[] default '{}')
returns void language plpgsql as $$
declare
  issued_at timestamptz := now();
  target_id uuid := ('b4000000-0000-0000-0000-' || lpad(ordinal::text,12,'0'))::uuid;
begin
  insert into public.device_commands(command_id,home_id,device_id,actor_user_id,action,payload,
    nonce,idempotency_key,created_at,expires_at,status)
  values(label,'b2000000-0000-0000-0000-000000000001',target_id,auth.uid(),operation,
    (jsonb_build_object('op',operation,'deviceId',target_id,'commandId',label,
      'nonce',label || '-nonce','idempotencyKey',label || '-key',
      'createdAt',floor(extract(epoch from issued_at)*1000),
      'expiresAt',floor(extract(epoch from issued_at + interval '15 seconds')*1000)) || body) - omitted,
    label || '-nonce',label || '-key',issued_at,issued_at + interval '15 seconds',initial_status);
end;
$$;

select ok(not has_function_privilege(caller,signature,'EXECUTE'), caller || ' cannot execute server-only ' || signature)
from unnest(array['anon','authenticated']) as callers(caller)
cross join unnest(array[
  'public.exchange_voice_authorization_code(text,text,text,text,text,timestamptz)',
  'public.enqueue_voice_device_command(uuid,uuid,text,jsonb)',
  'public.voice_member_can_perform_device_action(uuid,uuid,text)',
  'public.find_auth_user_id_by_email(text)', 'public.revoke_voice_link(uuid,text)'
]) as functions(signature);
select ok(has_function_privilege('service_role',signature,'EXECUTE'), 'service role retains ' || signature)
from unnest(array['public.exchange_voice_authorization_code(text,text,text,text,text,timestamptz)',
  'public.enqueue_voice_device_command(uuid,uuid,text,jsonb)',
  'public.voice_member_can_perform_device_action(uuid,uuid,text)',
  'public.find_auth_user_id_by_email(text)','public.revoke_voice_link(uuid,text)']) as functions(signature);
select ok(not has_table_privilege('authenticated','public.device_commands','TRUNCATE'), 'clients have no queue table-level deletion privilege');
select ok(not has_table_privilege('authenticated','public.voice_oauth_tokens','SELECT'), 'OAuth token table has no client grants');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner@boundary.test"}',true);
select is((select count(*) from home_invites),1::bigint,'owner reads only their household invitations');
select is((select count(*) from device_audit_logs),1::bigint,'owner reads only their household audit');
select lives_ok(format('select pg_temp.queue_checked_command(%L,%s,%L,%L::jsonb)',
  'kind-' || kind, ordinal, 'set-properties', '{"changes":{"isOn":true}}'), 'typed command is accepted for ' || kind)
from unnest(array['ac','light','tv','coffee','fridge','gate','garage','fan','door','vacuum','camera','window',
  'stove','washer','dryer','dishwasher','microwave','energy','water','water-heater','air','sprinkler','speaker','smoke'])
with ordinality as kinds(kind,ordinal);

select lives_ok($$select pg_temp.queue_checked_command('brightness',2,'set-brightness','{"value":70}')$$,'brightness action works');
select lives_ok($$select pg_temp.queue_checked_command('temperature',1,'set-temp','{"value":22,"mode":"cold"}')$$,'temperature action works');
select lives_ok($$select pg_temp.queue_checked_command('volume',3,'set-volume','{"value":25}')$$,'volume action works');
select lives_ok($$select pg_temp.queue_checked_command('mode',1,'set-mode','{"mode":"dry"}')$$,'mode action works');
select lives_ok($$select pg_temp.queue_checked_command('channel',3,'set-channel','{"value":10}')$$,'channel action works');
select lives_ok($$select pg_temp.queue_checked_command('muted',3,'set-muted','{"value":true}')$$,'mute action works');
select lives_ok($$select pg_temp.queue_checked_command('app',3,'launch-app','{"app":"Netflix"}')$$,'application launch action works');
select lives_ok($$select pg_temp.queue_checked_command('media',23,'media','{"action":"play-pause"}')$$,'media action works');
select lives_ok($$select pg_temp.queue_checked_command('navigation',3,'nav','{"action":"home"}')$$,'navigation action works');
select lives_ok($$select pg_temp.queue_checked_command('schedule',22,'set-properties','{"changes":{"schedule":[{"id":"weekday","hour":6,"minute":30,"days":["Mon","Wed"],"enabled":true}]}}')$$,'bounded sprinkler schedules work');
select lives_ok($$select pg_temp.queue_checked_command('laundry-timer',14,'set-properties','{"changes":{"progress":50,"remainingMin":30,"isOn":true}}')$$,'laundry timer adjustments remain available');
select lives_ok($$select pg_temp.queue_checked_command('smoke-status',24,'set-properties','{"changes":{"smokeSensorStatus":"ok"}}')$$,'smoke diagnostic controls remain typed requests');

select throws_ok($$select pg_temp.queue_checked_command('invalid-state',initial_status => 'confirmed')$$,'23514',null,'new commands must begin in created state');
select throws_ok($$select pg_temp.queue_checked_command('invalid-action',operation => 'unrecognized')$$,'23514',null,'unsupported operations are rejected');
select throws_ok($$select pg_temp.queue_checked_command('missing-operation',omitted => array['op'])$$,'23514',null,'operation is mandatory');
select throws_ok($$select pg_temp.queue_checked_command('missing-device',omitted => array['deviceId'])$$,'23514',null,'device identity is mandatory');
select throws_ok($$select pg_temp.queue_checked_command('missing-time',omitted => array['createdAt'])$$,'23514',null,'creation time is mandatory');
select throws_ok($$select pg_temp.queue_checked_command('invalid-expiry',body => '{"expiresAt":1}')$$,'23514',null,'JSON expiry must match the authoritative timestamp');
select throws_ok($$select pg_temp.queue_checked_command('invalid-size',body => jsonb_build_object('extra',repeat('x',16384)))$$,'23514',null,'queue payload size is bounded');
select throws_ok($$select pg_temp.queue_checked_command('invalid-registry',operation => 'set-properties',body => '{"changes":{"kind":"door"}}')$$,'23514',null,'registry attributes are not command properties');
select throws_ok($$select pg_temp.queue_checked_command('invalid-type',9,'set-properties','{"changes":{"openPercent":"100"}}')$$,'23514',null,'opening percentages require numbers');
select throws_ok($$select pg_temp.queue_checked_command('invalid-range',2,'set-brightness','{"value":101}')$$,'23514',null,'brightness respects its upper bound');
select throws_ok($$select pg_temp.queue_checked_command('invalid-kind',9,'set-brightness','{"value":50}')$$,'23514',null,'properties are specific to the device kind');
select throws_ok($$select pg_temp.queue_checked_command('invalid-null',2,'set-properties','{"changes":{"isOn":null}}')$$,'23514',null,'null does not satisfy a typed property');
select throws_ok($$select pg_temp.queue_checked_command('invalid-schedule',22,'set-properties','{"changes":{"schedule":[{"id":"x","hour":24,"minute":0,"days":["Mon"],"enabled":true}]}}')$$,'23514',null,'schedule hours are bounded');
select throws_ok($$select pg_temp.queue_checked_command('invalid-action-fields',3,'nav','{"action":"home","changes":{"isOn":true}}')$$,'23514',null,'operations reject unrelated fields');

insert into member_permission_overrides(home_id,user_id,permission,allowed,updated_by) values
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','lock.unlock',false,auth.uid());
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000002","role":"authenticated","email":"admin@boundary.test"}',true);
select is((select count(*) from home_invites),1::bigint,'administrator reads only their household invitations');
select is((select count(*) from device_audit_logs),1::bigint,'administrator reads only their household audit');
select is_empty($$delete from member_permission_overrides where user_id = auth.uid() returning user_id$$,'administrator cannot remove own owner-imposed restriction');
select throws_ok($$insert into member_permission_overrides(home_id,user_id,permission,allowed,updated_by)
  values('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','lock.unlock',true,auth.uid())$$,
  '42501',null,'administrator cannot delegate a permission the owner denied them');
select is_empty($$update home_members set role='member' where user_id = auth.uid() returning user_id$$,'administrator cannot demote self to bypass restrictions');
select is_empty($$delete from home_members where user_id = auth.uid() returning user_id$$,'administrator cannot delete and re-create own authority');
select throws_ok($$update home_members set role='admin' where user_id='b1000000-0000-0000-0000-000000000003'$$,'42501',null,'only owner may promote administrators');
select lives_ok($$update home_members set role='tenant' where user_id='b1000000-0000-0000-0000-000000000003'$$,'administrator still manages ordinary member roles');
select ok(not can_perform_device_action('b4000000-0000-0000-0000-000000000009','lock.unlock'),'owner-imposed administrator denial remains effective');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update home_members set role='member' where user_id='b1000000-0000-0000-0000-000000000003';
delete from home_members where user_id='b1000000-0000-0000-0000-000000000004';
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select is((select count(*) from rooms),0::bigint,'removed guest has no room metadata access');
select is((select count(*) from room_members),0::bigint,'removed guest has no surviving room assignment');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into home_members(home_id,user_id,role) values('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004','guest');
select is((select count(*) from room_members where user_id='b1000000-0000-0000-0000-000000000004'),0::bigint,'re-invitation does not restore old room grants');
select throws_ok($$insert into room_members(room_id,user_id,role) values('b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000005','guest')$$,'23514',null,'room assignment requires membership in the same household');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok($$select pg_temp.queue_checked_command('door-power',9,'set-properties','{"changes":{"isOn":true}}')$$,'42501',null,'opening by power requires unlocking permission');
select throws_ok($$select pg_temp.queue_checked_command('door-automatic',9,'set-properties','{"changes":{"autoOpenEnabled":true}}')$$,'42501',null,'automatic opening requires unlocking permission');
select lives_ok($$select pg_temp.queue_checked_command('door-close',9,'set-properties','{"changes":{"openPercent":0,"isOn":false}}')$$,'ordinary member can request closing');

reset role;
insert into voice_oauth_clients(id,name,provider,client_secret_hash,redirect_uris) values
  ('boundary-google','Google fixture','google','not-a-credential',array['https://example.invalid/callback']),
  ('boundary-alexa','Alexa fixture','alexa','not-a-credential',array['https://example.invalid/callback']);
insert into voice_oauth_codes(code,client_id,user_id,redirect_uri,expires_at) values
  ('boundary-code','boundary-google','b1000000-0000-0000-0000-000000000001','https://example.invalid/callback',now()+interval '5 minutes'),
  ('boundary-other-code','boundary-alexa','b1000000-0000-0000-0000-000000000001','https://example.invalid/callback',now()+interval '5 minutes');
insert into voice_oauth_tokens(access_token,refresh_token,client_id,user_id,expires_at) values
  ('boundary-access','boundary-refresh','boundary-google','b1000000-0000-0000-0000-000000000001',now()+interval '1 hour'),
  ('boundary-alexa-access','boundary-alexa-refresh','boundary-alexa','b1000000-0000-0000-0000-000000000001',now()+interval '1 hour'),
  ('boundary-other-access','boundary-other-refresh','boundary-google','b1000000-0000-0000-0000-000000000005',now()+interval '1 hour');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(find_auth_user_id_by_email(' OWNER@BOUNDARY.TEST '),'b1000000-0000-0000-0000-000000000001'::uuid,'existing account lookup is exact and case-insensitive');
select is(find_auth_user_id_by_email('missing@boundary.test'),null::uuid,'unknown email never falls back to another account');
select lives_ok($$select * from enqueue_voice_device_command('b1000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000002','google','{"isOn":true,"brightness":42}')$$,'service voice enqueue passes the same schema and timestamp validation');
select lives_ok($$select revoke_voice_link('b1000000-0000-0000-0000-000000000001','boundary-google')$$,'voice unlink is accepted');
select is((select count(*) from voice_oauth_codes where code='boundary-code'),0::bigint,'unlink removes pending matching authorization codes');
select is((select count(*) from voice_oauth_tokens where refresh_token='boundary-refresh'),0::bigint,'unlink removes matching refresh tokens');
select is((select count(*) from voice_oauth_codes where code='boundary-other-code'),1::bigint,'unlink preserves another provider code');
select is((select count(*) from voice_oauth_tokens where access_token in ('boundary-alexa-access','boundary-other-access')),2::bigint,'unlink preserves other provider and user token families');
select ok(not exchange_voice_authorization_code('boundary-code','boundary-google','https://example.invalid/callback','unused-access','unused-refresh',now()+interval '1 hour'),'removed code cannot be redeemed after unlink');
select is_empty($$update voice_oauth_tokens set access_token='unused-rotation' where refresh_token='boundary-refresh' returning access_token$$,'removed refresh cannot be rotated after unlink');

reset role;
select * from finish();
rollback;
