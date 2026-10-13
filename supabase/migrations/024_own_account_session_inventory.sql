/**
 * List only the caller's stored sign-ins without exposing Auth tokens, addresses,
 * or raw client metadata. Presence in Auth is not a claim that a device is online;
 * refreshed_at records token refresh, and expires_at is the explicit not_after
 * deadline rather than every project-level session timeout.
 */
create or replace function public.list_my_account_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  refreshed_at timestamptz,
  expires_at timestamptz,
  device_label text,
  is_current boolean
)
language plpgsql stable security definer
set search_path = '' set row_security = off as $$
declare
  current_user_id uuid := auth.uid();
  current_session_id text := auth.jwt() ->> 'session_id';
begin
  -- A still-unexpired JWT from a removed session must not expose this inventory.
  -- Compare the claim as text so malformed session claims fail closed uniformly.
  if auth.role() is distinct from 'authenticated' or current_user_id is null
    or current_session_id is null or not exists (
      select 1 from auth.sessions current_session
      where current_session.id::text = current_session_id
        and current_session.user_id = current_user_id
        and (current_session.not_after is null or current_session.not_after > now())
    ) then
    raise exception 'A current account session is required' using errcode = '42501';
  end if;

  return query
    select session.id, session.created_at,
      -- Supabase Auth stores this nullable timestamp as UTC without a timezone.
      session.refreshed_at at time zone 'UTC', session.not_after,
      case
        when lower(left(session.user_agent, 512)) ~ '(iphone|ipad|ipod)' then 'ios'
        when lower(left(session.user_agent, 512)) like '%android%' then 'android'
        when lower(left(session.user_agent, 512)) like '%windows%' then 'windows'
        when lower(left(session.user_agent, 512)) ~ '(macintosh|mac os x)' then 'macos'
        when lower(left(session.user_agent, 512)) like '%linux%' then 'linux'
        else 'unknown'
      end,
      session.id::text = current_session_id
    from auth.sessions session
    where session.user_id = current_user_id
      and (session.not_after is null or session.not_after > now())
    order by (session.id::text = current_session_id) desc,
      session.created_at desc nulls last, session.id
    limit 50;
end;
$$;

-- Do not grant client access to auth.sessions or expose an arbitrary-user input.
revoke all on function public.list_my_account_sessions() from public, anon, service_role;
grant execute on function public.list_my_account_sessions() to authenticated;
comment on function public.list_my_account_sessions() is
  'Own stored sign-ins only; sanitized client families, no live-device assertion or token revocation.';
