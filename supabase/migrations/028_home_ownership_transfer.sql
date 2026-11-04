-- A transfer receipt retains both account IDs and the decision without copying
-- contact details or credentials. Clients can only read a current offer via RPC.
create table public.home_ownership_offers (
  id uuid primary key,
  home_id uuid not null references public.homes(id) on delete cascade,
  from_user_id uuid not null,
  to_user_id uuid not null check (to_user_id <> from_user_id),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','invalidated','expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid,
  check (expires_at > created_at),
  check ((status = 'pending') = (resolved_at is null))
);
create unique index home_ownership_one_pending on public.home_ownership_offers(home_id) where status = 'pending';
alter table public.home_ownership_offers enable row level security;
revoke all on public.home_ownership_offers from public, anon, authenticated, service_role;

-- Home names remain editable under their original RLS policy. No client may
-- modify the canonical owner column, even if a future policy is broadened.
revoke update on public.homes from public, anon, authenticated;
revoke update(owner_id) on public.homes from public, anon, authenticated;
grant update(name) on public.homes to authenticated;

/** Bind the signed JWT to a still-current first-party account session. Only a
 * recent password authentication satisfies the two privilege-changing actions.
 * Refresh/iat, recovery links and local biometrics cannot satisfy this check. */
create function public.require_ownership_session(recent_password boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  claims jsonb := auth.jwt();
  session_deadline timestamptz;
  banned_until timestamptz;
  checked_at timestamptz;
  checked_epoch numeric;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or claims ->> 'client_id' is not null
    or coalesce(claims ->> 'is_anonymous','false') <> 'false' then
    raise exception 'A current account session is required' using errcode = '42501';
  end if;
  select s.not_after, u.banned_until into session_deadline, banned_until
    from auth.sessions s join auth.users u on u.id = s.user_id
    where s.user_id = auth.uid() and s.id::text = claims ->> 'session_id'
      and u.email_confirmed_at is not null and u.is_anonymous is not true and u.deleted_at is null
    for share of s, u;
  -- Sample time after any lock wait, including a concurrent sign-out.
  checked_at := clock_timestamp();
  checked_epoch := extract(epoch from checked_at);
  if not found or session_deadline <= checked_at or banned_until > checked_at then
    raise exception 'A current account session is required' using errcode = '42501';
  end if;
  -- Enrolled accounts must also complete the identity provider's second factor.
  if recent_password and claims ->> 'aal' is distinct from 'aal2' and exists (
    select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
  ) then
    raise exception 'Verified second factor required' using errcode = '42501';
  end if;
  if recent_password and not exists (
    select 1 from jsonb_array_elements(case jsonb_typeof(claims -> 'amr')
      when 'array' then claims -> 'amr' else '[]'::jsonb end) method
    where method ->> 'method' = 'password'
      and case when jsonb_typeof(method -> 'timestamp') = 'number'
        and (method ->> 'timestamp') ~ '^[0-9]{1,12}$'
        then (method ->> 'timestamp')::numeric between checked_epoch - 300 and checked_epoch
        else false end
  ) then
    raise exception 'Recent password sign-in required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_ownership_session(boolean) from public, anon, authenticated, service_role;

/** Resolve transfer participants from the current home and accepted, confirmed
 * accounts. Unexpected legacy owner rows require reconciliation before transfer. */
create function public.ownership_eligible_members(hid uuid, sender uuid)
returns table(user_id uuid, role text, email text)
language sql stable security definer set search_path = '' as $$
  select b.user_id, b.role, u.email::text
  from public.homes h
  join public.home_members a on a.home_id = h.id and a.user_id = h.owner_id and a.role = 'owner'
  join public.home_members b on b.home_id = h.id and b.role in ('admin','member') and b.user_id <> sender
  join auth.users u on u.id = b.user_id
  where h.id = hid and h.owner_id = sender and b.access_expires_at is null
    and u.email_confirmed_at is not null and nullif(trim(u.email),'') is not null
    and u.is_anonymous is not true and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= statement_timestamp())
    and not exists (select 1 from public.home_members m where m.home_id = h.id
      and m.role = 'owner' and m.user_id <> h.owner_id);
$$;
revoke all on function public.ownership_eligible_members(uuid,uuid) from public, anon, authenticated, service_role;

/** A verified email lets the Owner deliberately select a person even when the
 * household roster contains only generic or duplicate profile names. */
create function public.list_home_ownership_candidates(target_home_id uuid)
returns table(user_id uuid, role text, email text, home_name text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_ownership_session(false);
  perform 1 from public.homes where id = target_home_id and owner_id = auth.uid() for share;
  if not found then raise exception 'Home owner required' using errcode = '42501'; end if;
  return query select m.user_id, m.role, m.email, h.name
    from public.homes h cross join lateral public.ownership_eligible_members(h.id,auth.uid()) m
    where h.id = target_home_id order by lower(m.email), m.user_id;
end;
$$;

/** Invalidate a reviewed invitation on removal or role change immediately. A later
 * re-admission of the same account must require a new, explicit offer. */
create function public.invalidate_ownership_membership_offer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (old.home_id,old.user_id,old.role,old.access_expires_at)
    is distinct from (new.home_id,new.user_id,new.role,new.access_expires_at) then
    update public.home_ownership_offers
      set status = 'invalidated', resolved_at = clock_timestamp(), resolved_by = auth.uid()
      where home_id = old.home_id and status = 'pending' and old.user_id in (from_user_id,to_user_id);
  end if;
  return null;
end;
$$;
revoke all on function public.invalidate_ownership_membership_offer() from public, anon, authenticated, service_role;
create trigger home_members_invalidate_ownership_offer
after delete or update of home_id,user_id,role,access_expires_at on public.home_members
for each row execute function public.invalidate_ownership_membership_offer();

/** Return only a still-actionable pending offer to its original participants. */
create function public.get_home_ownership_offer(target_home_id uuid)
returns table(id uuid, home_id uuid, from_user_id uuid, to_user_id uuid, expires_at timestamptz, to_email text, home_name text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_ownership_session(false);
  return query
    select o.id, o.home_id, o.from_user_id, o.to_user_id, o.expires_at, u.email::text, h.name
    from public.home_ownership_offers o join public.homes h on h.id = o.home_id
    join auth.users u on u.id = o.to_user_id and u.email_confirmed_at is not null
    where o.home_id = target_home_id and o.status = 'pending' and o.expires_at > clock_timestamp()
      and h.owner_id = o.from_user_id and (auth.uid() = o.from_user_id or
        (auth.uid() = o.to_user_id and exists (select 1 from public.ownership_eligible_members(h.id,o.from_user_id) m where m.user_id = o.to_user_id)));
end;
$$;

/** Create one 24-hour offer. Reusing a request ID cannot revive a closed offer,
 * open a second offer, change recipients, or silently replace pending consent. */
create function public.offer_home_ownership(target_home_id uuid, target_user_id uuid, request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  previous public.home_ownership_offers%rowtype;
  checked_at timestamptz;
begin
  if request_id is null or target_user_id is null then
    raise exception 'Choose a current household member' using errcode = '22023';
  end if;
  -- Serialize against admission, removal, delegation and competing responses.
  perform 1 from public.homes where id = target_home_id and owner_id = actor for update;
  if not found then raise exception 'Home owner required' using errcode = '42501'; end if;
  perform public.require_ownership_session(true);
  if not exists (select 1 from public.ownership_eligible_members(target_home_id,actor) m where m.user_id = target_user_id) then
    raise exception 'Choose a current household Admin or Member' using errcode = '42501';
  end if;
  checked_at := clock_timestamp();
  select * into previous from public.home_ownership_offers o where o.id = request_id;
  if found then
    if previous.home_id = target_home_id and previous.from_user_id = actor and previous.to_user_id = target_user_id
      and previous.status = 'pending' and previous.expires_at > checked_at then return previous.id; end if;
    raise exception 'Transfer request is no longer available' using errcode = 'P0001';
  end if;
  update public.home_ownership_offers set status = 'expired', resolved_at = checked_at
    where home_id = target_home_id and status = 'pending' and expires_at <= checked_at;
  -- An unavailable account (for example a banned recipient) cannot strand the Owner for 24 hours.
  update public.home_ownership_offers o set status = 'invalidated', resolved_at = checked_at
    where o.home_id = target_home_id and o.status = 'pending' and not exists (
      select 1 from public.ownership_eligible_members(target_home_id,actor) m where m.user_id = o.to_user_id);
  if exists (select 1 from public.home_ownership_offers where home_id = target_home_id and status = 'pending') then
    raise exception 'A transfer is already pending' using errcode = 'P0001';
  end if;
  insert into public.home_ownership_offers(id,home_id,from_user_id,to_user_id,created_at,expires_at)
    values (request_id,target_home_id,actor,target_user_id,checked_at,checked_at + interval '24 hours');
  return request_id;
end;
$$;

/** Decide the exact offer after locking the home. A receipt may be retried by
 * the same authorized participant, but its role changes run exactly once. */
create function public.respond_home_ownership(target_home_id uuid, target_offer_id uuid, requested_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  offer public.home_ownership_offers%rowtype;
  decision text;
  checked_at timestamptz;
begin
  if requested_action is null or requested_action not in ('cancel','decline','accept') then
    raise exception 'Invalid ownership decision' using errcode = '22023';
  end if;
  decision := case requested_action when 'cancel' then 'cancelled' when 'decline' then 'declined' else 'accepted' end;
  perform 1 from public.homes h join public.home_ownership_offers o on o.home_id = h.id
    where h.id = target_home_id and o.id = target_offer_id
      and actor = case requested_action when 'cancel' then o.from_user_id else o.to_user_id end
      and public.can_access_home(h.id)
    for update of h;
  if not found then raise exception 'Ownership offer unavailable' using errcode = '42501'; end if;
  perform public.require_ownership_session(requested_action = 'accept');
  select * into strict offer from public.home_ownership_offers
    where home_id = target_home_id and id = target_offer_id for update;
  if offer.status = decision and offer.resolved_by = actor then return decision; end if;
  checked_at := clock_timestamp();
  if offer.status <> 'pending' or offer.expires_at <= checked_at then
    raise exception 'Ownership offer is no longer pending' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.homes h where h.id = offer.home_id and h.owner_id = offer.from_user_id)
    or (decision = 'accepted' and not exists (select 1 from public.ownership_eligible_members(offer.home_id,offer.from_user_id) m
      where m.user_id = offer.to_user_id)) then
    raise exception 'Ownership offer unavailable' using errcode = '42501';
  end if;
  update public.home_ownership_offers set status = decision, resolved_at = checked_at, resolved_by = actor
    where id = offer.id;
  if decision = 'accepted' then
    -- All changes commit together. The terminal receipt precedes the role writes
    -- so the membership trigger never invalidates the decision being committed.
    update public.home_members set role = 'admin' where home_id = offer.home_id and user_id = offer.from_user_id;
    update public.home_members set role = 'owner' where home_id = offer.home_id and user_id = offer.to_user_id;
    update public.homes set owner_id = offer.to_user_id where id = offer.home_id;
    delete from public.member_permission_overrides where home_id = offer.home_id
      and user_id in (offer.from_user_id,offer.to_user_id);
    -- Room assignments remain intact. Owner/Admin have whole-home access and
    -- the room_members.role vocabulary is intentionally limited to scoped roles.
  end if;
  return decision;
end;
$$;
revoke all on function public.list_home_ownership_candidates(uuid), public.get_home_ownership_offer(uuid), public.offer_home_ownership(uuid,uuid,uuid),
  public.respond_home_ownership(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.list_home_ownership_candidates(uuid), public.get_home_ownership_offer(uuid), public.offer_home_ownership(uuid,uuid,uuid),
  public.respond_home_ownership(uuid,uuid,text) to authenticated;
