# Guest access extensions

An accepted Guest with a finite deadline can be extended or renewed from their
member card. They keep their account, room assignments, and action permissions;
they do not need another invitation or acceptance.

## Owner experience

Open **dashboard account → Household → Members → Guest**. The deadline row shows
**Extend access** while active and **Renew access** after expiry. Guests without
an automatic expiry have no extension action.

1. Choose **1 hour**, **24 hours**, **7 days**, or an exact local date and time.
2. Review the current and proposed deadlines and the assigned-room summary.
3. Confirm the change. The success screen displays the server-confirmed deadline.

An active extension adds to the existing deadline. A renewal starts at server
confirmation time; its preview is labeled as expected until saved. A custom end
must be later than both now and the existing deadline. Every new deadline is
limited to the next 365 days. Local custom inputs reject calendar rollover and
nonexistent daylight-saving times.

Changing the deadline clears optional interior-layout consent. The Owner can
share it again separately. Pending invitations for the same person and household
are replaced, so a stale invitation cannot later replace renewed access.

## Authority and data boundaries

Migration `020_guest_access_extension.sql` exposes the narrow
`extend_guest_access` RPC. It verifies the authenticated household administrator,
effective invitation permission, and an existing Guest membership. It rejects
foreign homes, self-extension, non-Guest targets, missing or unlimited deadlines,
invalid duration combinations, and shortened access.

The request includes the deadline reviewed by the administrator. A locked
comparison rejects stale or repeated requests rather than adding time twice.
Authenticated direct updates to `access_expires_at` are disabled. Other membership
columns retain their existing grants and row-level policies.

The client verifies the session before and after protected confirmation and API
work. It installs the new deadline only from a fresh verified membership snapshot.
Network errors and saved-but-unconfirmed results are explicit; a late result
cannot grant access to a different account or household.

## Guest experience

The Guest's member card shows their updated deadline. Remote edits normally
arrive within 60 seconds plus network time, or on foreground return. A Guest on
the home-access screen can choose **Check access** to refresh immediately. A
verified renewed membership exits that screen without signing in again. Failed
or stale checks remain closed.

This is an access-management change, not a new device-control permission. Expiry
continues to be enforced by server authorization and the existing app timers.

## Verification record

October 7, 2026:

- Full app suite: **176 suites / 2,561 tests passed**, including 50 service,
  24 date-policy, and 14 new UI tests. After the final layout/copy adjustment,
  the 47 household UI/security tests and TypeScript passed again.
- Isolated PostgreSQL 17: all 20 migrations, **482 assertions / 10 suites**,
  including 68 extension cases. Temporary database removed.
- Staging migration 020 deployed. Hosted API checks use exact error codes,
  verifying active/expired/custom changes, stale-request rejection, denied
  Guest self-extension/direct writes, unchanged device/room scope, and cleared
  interior consent. No real Guest membership was changed.
- Responsive browser review: 375 × 667, 768 × 1024, and 1024 × 768. Duration, review, custom
  date/time, and confirmed-success surfaces fit; the landscape member card uses
  a compact identity row to keep its pager reachable.
- Authenticated browser: Owner extension and expired-Guest renewal displayed
  confirmed success. The expired Guest used **Check access** and returned to the
  property without another sign-in or invitation; **My rooms** still listed only
  Living room / six devices, and **Open smart door** remained disabled. No browser
  errors remained. Synthetic accounts/home and private credentials were removed.
- Preview **39** Release build, identity/scheme/profile/signature checks passed.
  The iPhone 16 Pro Max app listing confirms installed version 1.0.0 (39), and the
  developer service launched it. Production source metadata was restored.
  The user subsequently confirmed the requested iPhone renewal check works:
  renewal, Guest return with the existing account, Living-room light access, and
  blocked door control. This is user-reported physical evidence; it does not
  establish custom deadlines or automatic expiry.
  In a separate physical check, the user supplied an Airplane Mode screenshot
  showing **Unable to verify home access**, **Retry**, and **Sign out** with Wi-Fi
  off, then confirmed that reconnecting restored access with door control still
  blocked. Recovery timing and use of Retry were not specified; broader lifecycle
  behavior remains separate.
  Physical iPad testing remains deferred.

The first hosted stale-request check exposed PostgREST's retry behavior for
custom `40001` errors. Business staleness now returns `22023` and the regression
expects that precise code rather than accepting a timeout as a denial. All SQL
checks passed after repair; no active extension RPC remained stuck in staging.
See [Supabase's explanation](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

Logs and screenshots are under the work directory recorded in
[WORKING_CONTEXT.md](WORKING_CONTEXT.md). Test fixtures use disposable accounts;
never use the real household's expired Guest as an automated test fixture.
