begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(47);
insert into auth.users(id,email,email_confirmed_at)
select ('ac100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'person' || n || '@sent.invalid', now()
from generate_series(1,30) n;
insert into homes(id,owner_id,name) values
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','Canonical first home'),
('ac200000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000005','Unrelated home');
insert into home_members(home_id,user_id,role) values
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','owner'),
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000002','admin'),
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000003','member'),
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000004','guest'),
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000016','guest'),
('ac200000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000005','owner');
insert into rooms(id,home_id,name) values
('ac300000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001','Living'),
('ac300000-0000-4000-8000-000000000002','ac200000-0000-4000-8000-000000000002','Foreign room');
insert into home_invites(id,home_id,email,invited_user_id,role,room_ids,status,expires_at,access_expires_at)
select ('ac500000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  case when n=10 then 'ac200000-0000-4000-8000-000000000002'::uuid else 'ac200000-0000-4000-8000-000000000001'::uuid end,
  'person' || (n+10) || '@sent.invalid', ('ac100000-0000-4000-8000-' || lpad((n+10)::text,12,'0'))::uuid,
  case when n=2 then 'member' when n=3 then 'admin' else 'guest' end,
  array['ac300000-0000-4000-8000-000000000001']::uuid[],
  case n when 6 then 'accepted' when 7 then 'declined' when 8 then 'cancelled' else 'pending' end,
  case when n=4 then now()-interval '1 hour' else now()+interval '7 days' end,
  case when n=5 then now()-interval '1 hour' else null end
from generate_series(1,13) n;
insert into member_permission_overrides(home_id,user_id,permission,allowed) values
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000002','camera.live',false),
('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000003','member.invite',true);
select ok(not has_function_privilege('anon','public.list_sent_home_invitations(uuid)','execute'),'anonymous callers cannot list sent invitations');
select ok(not has_function_privilege('service_role','public.cancel_sent_home_invitation(uuid,uuid,bigint)','execute'),'cancellation is an authenticated-account operation');
select ok(not has_any_column_privilege('authenticated','public.home_invites','INSERT,UPDATE'),'no authenticated column grant bypasses lifecycle RPCs');
select ok(not has_any_column_privilege('anon','public.home_invites','INSERT,UPDATE'),'anonymous callers retain no column mutation grants');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@sent.invalid"}',true);
select is((select count(*) from list_sent_home_invitations('ac200000-0000-4000-8000-000000000001')),9::bigint,'Owner sees pending and expired records only in selected home');
select is((select home_name from list_sent_home_invitations('ac200000-0000-4000-8000-000000000001') limit 1),'Canonical first home','home label is authoritative');
select is((select count(*) from list_sent_home_invitations('ac200000-0000-4000-8000-000000000001') where status='expired' and not can_cancel),2::bigint,'invitation deadline and Guest deadline both produce expired status');
select is((select revision from list_sent_home_invitations('ac200000-0000-4000-8000-000000000001') limit 1),'1','revision is an opaque precise string');
select throws_ok($$select list_sent_home_invitations('ac200000-0000-4000-8000-000000000002')$$,'42501',null,'Owner cannot list another household');
select throws_ok($$update home_invites set status='cancelled' where id='ac500000-0000-4000-8000-000000000001'$$,'42501',null,'direct client lifecycle writes are revoked');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002","role":"authenticated","email":"person2@sent.invalid"}',true);
select is((select count(*) from list_sent_home_invitations('ac200000-0000-4000-8000-000000000001')),7::bigint,'restricted Admin sees only roles they can currently delegate');
select is((select count(*) from home_invites where role in ('member','admin')),0::bigint,'direct SELECT cannot bypass sender delegation visibility');
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000002',1)$$,'42501',null,'Admin cannot revoke protected Member invitation');
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000003',1)$$,'42501',null,'Admin cannot manage an administrator invitation');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000001',1)->>'status','cancelled','authorized Admin can cancel an ordinary pending invitation');
select is((select management_revision from home_invites where id='ac500000-0000-4000-8000-000000000001'),2::bigint,'cancellation advances its authoritative generation');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000001',1)->>'status','cancelled','repeat cancellation returns existing terminal status');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@sent.invalid"}',true);
select set_member_permission_override('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000002','member.invite',false);
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002","role":"authenticated","email":"person2@sent.invalid"}',true);
select throws_ok($$select list_sent_home_invitations('ac200000-0000-4000-8000-000000000001')$$,'42501',null,'revoked invitation permission closes the sent inbox');
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000009',1)$$,'42501',null,'revoked invitation permission prevents cancellation');
select is((select count(*) from home_invites),0::bigint,'denied Admin cannot read outgoing records directly');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000003","role":"authenticated","email":"person3@sent.invalid"}',true);
select throws_ok($$select list_sent_home_invitations('ac200000-0000-4000-8000-000000000001')$$,'42501',null,'ordinary Member invite override does not confer household administration');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000005","role":"authenticated","email":"person5@sent.invalid"}',true);
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000009',1)$$,'42501',null,'foreign Owner cannot cancel a home invitation');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@sent.invalid"}',true);
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000010',1)$$,'42501',null,'wrong-home invitation ID is unavailable');
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000009',null)$$,'22023',null,'missing reviewed generation is rejected');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000004',1)->>'status','expired','an elapsed invitation is reported expired, not successfully revoked');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000005',1)->>'status','expired','elapsed Guest grant cannot be presented as active');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000006',1)->>'status','accepted','already accepted invitation retains accepted status');
select is((select count(*) from home_members where user_id='ac100000-0000-4000-8000-000000000016'),1::bigint,'cancelling a previously accepted invitation never removes membership');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000007',1)->>'status','declined','declined invitation remains declined');
select record_home_invitation('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000019','person19@sent.invalid','guest',array['ac300000-0000-4000-8000-000000000001']::uuid[],null);
select is((select management_revision from home_invites where id='ac500000-0000-4000-8000-000000000009'),2::bigint,'reissue changes generation while retaining invitation ID');
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000009',1)$$,'22023','Invitation changed. Refresh sent invitations','stale review cannot cancel the replacement invitation');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000009',2)->>'status','cancelled','fresh review may cancel the replacement generation');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000023","role":"authenticated","email":"person22@sent.invalid"}',true);
select is((select count(*) from home_invites),0::bigint,'matching email cannot bypass the bound recipient account');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000022","role":"authenticated","email":"person22@sent.invalid"}',true);
select is((select count(*) from home_invites),1::bigint,'bound recipient retains their own invitation visibility only');
select is(respond_home_invite('ac500000-0000-4000-8000-000000000012','accept'),'accepted','acceptance may win before cancellation obtains its lock');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@sent.invalid"}',true);
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000012',1)->>'status','accepted','late cancellation returns acceptance rather than removing the new member');
select is((select count(*) from home_members where user_id='ac100000-0000-4000-8000-000000000022'),1::bigint,'accepted membership survives cancellation race');
select is(cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000013',1)->>'status','cancelled','cancellation may win before acceptance obtains its lock');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000023","role":"authenticated","email":"person23@sent.invalid"}',true);
select throws_ok($$select respond_home_invite('ac500000-0000-4000-8000-000000000013','accept')$$,'P0001','Invite already processed','revoked email/invitation cannot admit its authenticated recipient');
select is((select count(*) from home_members where user_id=auth.uid()),0::bigint,'sign-in still grants no membership after cancellation');
select is((select count(*) from list_my_home_invitations()),0::bigint,'cancelled invitation leaves the recipient pending inbox');
reset role;
-- Start a transaction before expiry, then cross the deadline; acceptance's final
-- transition must use wall time even though its inherited now() checks are older.
update home_invites set expires_at=clock_timestamp()+interval '100 milliseconds'
  where id='ac500000-0000-4000-8000-000000000011';
select pg_sleep(0.15);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000021","role":"authenticated","email":"person21@sent.invalid"}',true);
select throws_ok($$select respond_home_invite('ac500000-0000-4000-8000-000000000011','accept')$$,'P0001','Invite expired','a transaction begun before expiry cannot admit after wall-clock expiry');
select is((select count(*) from home_members where user_id=auth.uid()),0::bigint,'expired acceptance rolls back any provisional membership');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated","email":"person1@sent.invalid"}',true);
select lives_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000003',1)$$,'Owner retains administrator-invitation management');
select throws_ok($$select advance_home_invitation_revision()$$,'42501',null,'internal revision trigger cannot be invoked by callers');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select list_sent_home_invitations('ac200000-0000-4000-8000-000000000001')$$,'42501',null,'missing authenticated user fails closed');
select throws_ok($$select cancel_sent_home_invitation('ac200000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000001',1)$$,'42501',null,'anonymous identity cannot cancel a known invitation');
reset role;
select * from finish();
rollback;
