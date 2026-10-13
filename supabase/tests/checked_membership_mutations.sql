begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(46);
insert into auth.users(id,email,email_confirmed_at) values
('ab100000-0000-4000-8000-000000000001','owner@audit.invalid',now()),
('ab100000-0000-4000-8000-000000000002','admin@audit.invalid',now()),
('ab100000-0000-4000-8000-000000000003','guest@audit.invalid',now()),
('ab100000-0000-4000-8000-000000000004','other@audit.invalid',now()),
('ab100000-0000-4000-8000-000000000005','expired@audit.invalid',now());
insert into homes(id,owner_id,name) values ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','Audit home');
insert into home_members(home_id,user_id,role) values
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','owner'),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','admin'),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','guest');
insert into home_members(home_id,user_id,role,access_expires_at) values
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','guest',now()-interval '1 hour');
insert into rooms(id,home_id,name) values ('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','Living');
insert into member_permission_overrides(home_id,user_id,permission,allowed) values
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','member.invite',false),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','camera.live',false),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','garage.open',false),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','light.control',false),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','light.control',false),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','light.control',false),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','garage.open',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$insert into home_members(home_id,user_id,role) values('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','member')$$,'42501',null,'restricted Admin cannot directly admit members');
select throws_ok($$update home_members set role='member' where user_id='ab100000-0000-4000-8000-000000000003'$$,'42501',null,'column-level role update privilege is also revoked');
select throws_ok($$delete from home_members where user_id='ab100000-0000-4000-8000-000000000003'$$,'42501',null,'direct removal cannot cascade away denials');
select throws_ok($$select remove_home_member('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003')$$,'42501',null,'checked removal requires invitation authority');
select throws_ok($$select set_home_member_role('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','member')$$,'42501',null,'checked role changes require invitation authority');
select throws_ok($$select set_member_permission_override('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','light.control',null)$$,'42501','Permission change forbidden','denied reset raises instead of silently deleting zero rows');
select throws_ok($$select set_member_permission_override('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','camera.live',null)$$,'42501','Permission change forbidden','denied reset is rejected even if override is absent');
select throws_ok($$select set_member_permission_override('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','light.control',null)$$,'42501',null,'Admin cannot reset their own Owner restriction');
select is((select allowed from member_permission_overrides where user_id='ab100000-0000-4000-8000-000000000003' and permission='light.control'),false,'failed reset preserves authoritative denial');
select is(set_member_permission_override('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','climate.control',null),null::boolean,'authorized already-absent reset returns confirmed NULL');
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(set_member_permission_override('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','member.invite',null),null::boolean,'Owner restores Admin invitation authority');
select throws_ok($$insert into home_members(home_id,user_id,role) values('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','member')$$,'42501',null,'Owner admission also uses invitation flow');
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select set_home_member_role('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','member')$$,'42501','Cannot delegate protected permissions','role change cannot delegate camera authority withheld from Admin');
select throws_ok($$select remove_home_member('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003')$$,'42501',null,'removal cannot erase a denial Admin cannot reset');
select throws_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','other@audit.invalid','member','{}',null)$$,'42501',null,'invitation cannot delegate camera and light authority withheld from Admin');
select throws_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','other@audit.invalid','admin','{}',null)$$,'42501',null,'Admin cannot create another administrator');
select throws_ok($$insert into room_members(room_id,user_id,role) values ('ab300000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','guest')$$,'42501',null,'restricted Admin cannot directly expand room grants');
select throws_ok($$update room_members set role='guest' where user_id='ab100000-0000-4000-8000-000000000003'$$,'42501',null,'direct room updates are revoked');
select throws_ok($$delete from room_members where user_id='ab100000-0000-4000-8000-000000000003'$$,'42501',null,'direct room deletes are revoked');
select throws_ok($$select set_home_room_memberships('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004',array['ab300000-0000-4000-8000-000000000001']::uuid[])$$,'42501',null,'room RPC still requires target household membership');
select lives_ok($$select set_home_room_memberships('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003',array['ab300000-0000-4000-8000-000000000001']::uuid[])$$,'Admin may add rooms when target denial retains the protected action boundary');
select lives_ok($$select set_home_room_memberships('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','{}')$$,'Admin may remove scoped room grants');
select throws_ok($$select set_home_room_memberships('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005',array['ab300000-0000-4000-8000-000000000001']::uuid[])$$,'42501',null,'room expansion cannot delegate target explicit garage grant if actor lacks it');
select ok(not can_delegate_home_role('ab200000-0000-4000-8000-000000000001','member'),'role preflight blocks email delivery before any invitation write');
select is((select count(*) from home_invites),0::bigint,'rejected operations persist no invitations');
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(set_home_member_role('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','member'),'member','Owner retains member role management');
select is((select allowed from member_permission_overrides where user_id='ab100000-0000-4000-8000-000000000003' and permission='light.control'),false,'role change retains explicit action denial');
select throws_ok($$select remove_home_member('ab200000-0000-4000-8000-000000000001',auth.uid())$$,'42501',null,'canonical Owner cannot be removed');
select throws_ok($$select set_home_member_role('ab200000-0000-4000-8000-000000000001',auth.uid(),'member')$$,'42501',null,'canonical Owner cannot be demoted');
select throws_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','expired@audit.invalid','guest',array['ab300000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000001']::uuid[],null)$$,'22023',null,'duplicate invitation rooms are rejected before persistence');
select throws_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','expired@audit.invalid','guest',array[null]::uuid[],null)$$,'22023',null,'null invitation rooms are rejected before persistence');
select throws_ok($$select respond_home_invite(null,null)$$,'P0001','Invalid invite action','null invitation response cannot decline silently');
select throws_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','expired@audit.invalid','guest',array['ab300000-0000-4000-8000-000000000001']::uuid[],now()+interval '31 days')$$,'22023',null,'new Guest invitation cannot exceed the edge thirty-day limit');
select lives_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','expired@audit.invalid','guest',array['ab300000-0000-4000-8000-000000000001']::uuid[],now()+interval '30 days')$$,'new Guest invitation accepts exactly thirty days');
select lives_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005','expired@audit.invalid','guest',array['ab300000-0000-4000-8000-000000000001']::uuid[],now()+interval '1 day')$$,'Owner can reinvite expired Guest');
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is(respond_home_invite((select id from list_my_home_invitations()),'accept'),'accepted','recipient admission works with generic INSERT revoked');
select is((select allowed from member_permission_overrides where user_id=auth.uid() and permission='light.control'),false,'expired-Guest replacement retains Owner denial');
select is((select count(*) from member_permission_overrides where user_id=auth.uid() and permission='garage.open'),0::bigint,'replacement does not resurrect previous Allow grant');
select ok(not effective_member_has_action_permission('ab200000-0000-4000-8000-000000000001',auth.uid(),'light.control'),'retained denial remains effective');
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(remove_home_member('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003'),'ab100000-0000-4000-8000-000000000003'::uuid,'Owner retains protected-member removal');
select is(set_member_permission_override('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','light.control',null),null::boolean,'Owner restores light delegation');
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select record_home_invitation('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','other@audit.invalid','guest',array['ab300000-0000-4000-8000-000000000001']::uuid[],null)$$,'restricted Admin can still invite within their authority');
select is(remove_home_member('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000005'),'ab100000-0000-4000-8000-000000000005'::uuid,'authorized Admin can remove an ordinary member');
select throws_ok($$select set_member_permission_override('ab200000-0000-4000-8000-000000000099','ab100000-0000-4000-8000-000000000005','light.control',false)$$,'42501',null,'cross-home mutation fails closed');
select throws_ok($$select set_home_member_role('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','member')$$,'42501',null,'Admin cannot replace their own role');
select throws_ok($$select lock_home_membership_management('ab200000-0000-4000-8000-000000000001')$$,'42501',null,'internal lock helper is not exposed to authenticated callers');
reset role;
select * from finish();
rollback;
