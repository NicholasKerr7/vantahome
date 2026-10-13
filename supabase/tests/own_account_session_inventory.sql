begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

-- These users deliberately have no household; account security is account-scoped.
insert into auth.users(id,email,email_confirmed_at) values
  ('ac100000-0000-4000-8000-000000000001','sessions-a@audit.invalid',now()),
  ('ac100000-0000-4000-8000-000000000002','sessions-b@audit.invalid',now());
insert into auth.sessions(id,user_id,created_at,refreshed_at,not_after,user_agent,ip) values
  ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','2025-01-01 10:00:00+00','2025-01-02 10:00:00',null,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)','192.0.2.1'),
  ('ac200000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000002',now(),null,null,'Other account private client','192.0.2.2'),
  ('ac200000-0000-4000-8000-000000000003','ac100000-0000-4000-8000-000000000001',now(),null,now()-interval '1 second','Expired client',null),
  ('ac200000-0000-4000-8000-000000000004','ac100000-0000-4000-8000-000000000001',now(),null,now(),'Deadline client',null),
  ('ac200000-0000-4000-8000-000000000005','ac100000-0000-4000-8000-000000000001',null,null,null,null,null),
  ('ac200000-0000-4000-8000-000000000006','ac100000-0000-4000-8000-000000000001',now(),null,now()+interval '1 hour','<script>private client name</script>',null),
  ('ac200000-0000-4000-8000-000000000007','ac100000-0000-4000-8000-000000000001',now(),null,null,'Mozilla/5.0 (Linux; Android 15)',null),
  ('ac200000-0000-4000-8000-000000000008','ac100000-0000-4000-8000-000000000001',now(),null,null,'Mozilla/5.0 (Macintosh; Intel Mac OS X)',null),
  ('ac200000-0000-4000-8000-000000000009','ac100000-0000-4000-8000-000000000001',now(),null,null,'Mozilla/5.0 (Windows NT 10.0)',null),
  ('ac200000-0000-4000-8000-000000000010','ac100000-0000-4000-8000-000000000001',now(),null,null,'Mozilla/5.0 (X11; Linux x86_64)',null);

select ok(has_function_privilege('authenticated','public.list_my_account_sessions()','EXECUTE'),'authenticated callers can request their inventory');
select ok(not has_function_privilege('anon','public.list_my_account_sessions()','EXECUTE'),'anonymous execute is revoked');
select ok(not has_function_privilege('service_role','public.list_my_account_sessions()','EXECUTE'),'service-role execute is not exposed');
select ok(not has_table_privilege('authenticated','auth.sessions','SELECT'),'inventory does not grant direct Auth session reads');
select ok(not has_table_privilege('authenticated','auth.sessions','DELETE'),'inventory does not grant direct Auth session deletion');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501','A current account session is required','missing user identity fails closed');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'missing session claim cannot list account sessions');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"malformed-session"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'malformed session claims fail with an authorization error');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ac200000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'another user session cannot authenticate this inventory');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ac200000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'expired current session cannot authenticate this inventory');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ac200000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'current session expires at the exact deadline');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"service_role","session_id":"ac200000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'a non-user role claim is rejected even with matching identity');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ac200000-0000-4000-8000-000000000001"}',true);

select is((select count(*) from list_my_account_sessions()),7::bigint,'only own nonexpired stored sessions are listed without household membership');
select is((select id from list_my_account_sessions() limit 1),'ac200000-0000-4000-8000-000000000001'::uuid,'current session sorts first even when it is oldest');
select is((select count(*) from list_my_account_sessions() where is_current),1::bigint,'only the JWT session is marked current');
select is((select device_label from list_my_account_sessions() where is_current),'ios','iOS wins over its Mac-compatible user agent');
select is((select device_label from list_my_account_sessions() where id='ac200000-0000-4000-8000-000000000007'),'android','Android wins over its Linux-compatible user agent');
select is((select array_agg(device_label order by id) from list_my_account_sessions() where id in ('ac200000-0000-4000-8000-000000000008','ac200000-0000-4000-8000-000000000009','ac200000-0000-4000-8000-000000000010')),array['macos','windows','linux'],'recognized clients return only the closed label vocabulary');
select is((select device_label from list_my_account_sessions() where id='ac200000-0000-4000-8000-000000000006'),'unknown','untrusted user-agent content is not echoed');
select ok((select created_at is null and refreshed_at is null and device_label='unknown' from list_my_account_sessions() where id='ac200000-0000-4000-8000-000000000005'),'missing legacy metadata stays unknown rather than inventing activity');
select is((select expires_at from list_my_account_sessions() where id='ac200000-0000-4000-8000-000000000006'),now()+interval '1 hour','explicit Auth deadline is returned without alteration');
set local timezone = 'America/New_York';
select is((select refreshed_at from list_my_account_sessions() where is_current),'2025-01-02 10:00:00+00'::timestamptz,'refresh timestamps stay UTC under a different database timezone');
select is((select array_agg(key order by key) from jsonb_object_keys((select to_jsonb(session) from list_my_account_sessions() session limit 1)) key),array['created_at','device_label','expires_at','id','is_current','refreshed_at'],'only the six sanitized inventory fields are exposed');
select ok((select jsonb_agg(session)::text !~ '(192\.0\.2|private client|user_agent|refresh_token|user_id)' from list_my_account_sessions() session),'inventory contains no raw client identity, address or token fields');

-- Stress the bounded response while keeping the older current row visible.
reset role;
insert into auth.sessions(id,user_id,created_at,user_agent)
select ('ac300000-0000-4000-8000-' || lpad(number::text,12,'0'))::uuid,
  'ac100000-0000-4000-8000-000000000001'::uuid, now()+number*interval '1 second', 'Test client'
from generate_series(1,60) number;
set local role authenticated;
select is((select count(*) from list_my_account_sessions()),50::bigint,'response is bounded to fifty rows');
select is((select id from list_my_account_sessions() limit 1),'ac200000-0000-4000-8000-000000000001'::uuid,'response cap never drops the current session');
select is((select id from list_my_account_sessions() offset 1 limit 1),'ac300000-0000-4000-8000-000000000060'::uuid,'remaining slots prioritize the most recent sign-ins');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"ac200000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from list_my_account_sessions()),1::bigint,'changing users returns only that users own session');

reset role;
delete from auth.sessions where id='ac200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ac200000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'removed session cannot use a still-present JWT claim to list other sessions');
set local role anon;
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'anonymous execution is denied even with forged request settings');
set local role service_role;
select throws_ok($$select list_my_account_sessions()$$,'42501',null,'service execution remains unavailable');
reset role;
select * from finish();
rollback;
