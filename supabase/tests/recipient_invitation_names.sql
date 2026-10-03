begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

insert into auth.users(id, email, email_confirmed_at) values
  ('c1000000-0000-4000-8000-000000000001', 'owner@invitation.test', now()),
  ('c1000000-0000-4000-8000-000000000002', 'Guest@Invitation.Test', now()),
  ('c1000000-0000-4000-8000-000000000003', 'outsider@invitation.test', now()),
  ('c1000000-0000-4000-8000-000000000004', 'unconfirmed@invitation.test', null);
insert into public.homes(id, owner_id, name) values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Hopewell'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'Seaside'),
  ('c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Private home');
insert into public.home_invites(id, home_id, email, invited_user_id, role, status, expires_at) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'guest@invitation.test', 'c1000000-0000-4000-8000-000000000002', 'member', 'pending', now() + interval '1 day'),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'guest@invitation.test', null, 'guest', 'pending', now() - interval '1 day'),
  ('c3000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000003', 'guest@invitation.test', 'c1000000-0000-4000-8000-000000000003', 'guest', 'pending', now() + interval '1 day'),
  ('c3000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000001', 'unconfirmed@invitation.test', 'c1000000-0000-4000-8000-000000000004', 'guest', 'pending', now() + interval '1 day'),
  ('c3000000-0000-4000-8000-000000000005', 'c2000000-0000-4000-8000-000000000002', 'outsider@invitation.test', 'c1000000-0000-4000-8000-000000000003', 'member', 'accepted', now() + interval '1 day');

select ok(not has_function_privilege('anon', 'public.list_my_home_invitations()', 'EXECUTE'), 'anonymous callers cannot list invitation names');
select ok(has_function_privilege('authenticated', 'public.list_my_home_invitations()', 'EXECUTE'), 'authenticated callers may read their invitation projection');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated","email":"wrong-claim@invitation.test"}', true);
select is((select count(*) from public.list_my_home_invitations()), 2::bigint, 'recipient sees matching bound and unbound invitations using the confirmed database email');
select results_eq($$select home_name from public.list_my_home_invitations() order by home_name$$, $$values ('Hopewell'::text), ('Seaside'::text)$$, 'recipient sees the actual invited property names');
select is((select count(*) from public.list_my_home_invitations() where expires_at < now()), 1::bigint, 'expired pending invitations remain visible for decline');
select is((select count(*) from public.list_my_home_invitations() where home_name = 'Private home'), 0::bigint, 'a conflicting invited user ID hides the home name');
select is((select count(*) from public.homes), 0::bigint, 'invitation metadata does not grant direct registry access');
select is((select count(*) from public.home_members), 0::bigint, 'listing invitations does not grant membership');

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated","email":"guest@invitation.test"}', true);
select throws_ok($$select public.respond_home_invite('c3000000-0000-4000-8000-000000000003', 'decline')$$, 'P0001', 'Forbidden', 'decline preserves the invited-account identity check');
select throws_ok($$select public.respond_home_invite('c3000000-0000-4000-8000-000000000002', 'accept')$$, 'P0001', 'Invite expired', 'expired invitations cannot grant household access');
select is(public.respond_home_invite('c3000000-0000-4000-8000-000000000002', 'decline'), 'declined', 'the recipient can decline an expired invitation');
select is((select count(*) from public.list_my_home_invitations()), 1::bigint, 'declining removes the expired invitation from the pending inbox');

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated","email":"guest@invitation.test"}', true);
select is((select count(*) from public.list_my_home_invitations()), 0::bigint, 'a spoofed email claim cannot reveal another recipient or an accepted invitation');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated","email":"unconfirmed@invitation.test"}', true);
select is((select count(*) from public.list_my_home_invitations()), 0::bigint, 'an unconfirmed email cannot reveal invited property names');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select count(*) from public.list_my_home_invitations()), 0::bigint, 'a missing user identity fails closed');

reset role;
update auth.users set email = 'changed@invitation.test' where id = 'c1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated","email":"guest@invitation.test"}', true);
select is((select count(*) from public.list_my_home_invitations()), 0::bigint, 'a stale JWT email cannot restore access after the verified account email changes');

reset role;
select * from finish();
rollback;
