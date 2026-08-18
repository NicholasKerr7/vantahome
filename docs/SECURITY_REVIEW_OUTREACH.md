# Independent Security Review Outreach

Status: **scope prepared; owner approval required before a paid engagement**

## Recommended first contact

Cure53 is the preferred first contact because its published services and reports
cover white-box mobile applications, APIs, server software, architecture, and
source-code review. Send the brief in
[Independent Security Review Brief](./SECURITY_REVIEW_BRIEF.md) and request a
non-binding proposal from `hello@cure53.de`.

## Alternatives

- Trail of Bits: request an application-security design assessment plus a
  comprehensive code assessment. Strong fit for architecture and root-cause
  review; pricing is quote-based.
- Bishop Fox: request a mobile application assessment that includes API and
  business-logic testing. Pricing is quote-based.
- Cobalt: consider only if a human-led mobile plus API scope is quoted. Its
  advertised autonomous fixed-price offering is web-only and is therefore not
  sufficient for the Sprint 2 gate by itself.

## Proposed inquiry

Subject: `VantaHome independent mobile, Supabase, and architecture security review`

Body:

> Hello Cure53 team,
>
> I am seeking a non-binding proposal for an independent white-box security
> review of VantaHome, an early-stage Expo/React Native smart-home application
> backed by Supabase Auth, PostgreSQL Row Level Security, RPCs, and Deno Edge
> Functions.
>
> The review is a gated pre-alpha assessment focused on mobile authentication,
> cross-household and cross-room authorization, action-level permissions,
> service-role boundaries, command replay/expiry/idempotency, abuse controls,
> OAuth account linking, and privacy-safe observability. Dynamic testing would
> use only a disposable Supabase project and synthetic accounts.
>
> The public repository is https://github.com/NicholasKerr7/vantahome and the
> proposed baseline commit is
> e1b8ea073b4892fb6655c1761d2795bfd8b80444. A detailed scope brief is attached
> or can be provided as plain text.
>
> Please advise on your recommended scope, team size, effort, earliest
> availability, price, included retesting, NDA/data-handling terms, and relevant
> React Native, Supabase/PostgreSQL RLS, OAuth, or IoT application experience.
>
> This request is for a quotation only and does not authorize testing or create
> a paid engagement.
>
> Regards,  
> Nicholas Kerr

## Engagement safeguards

- Do not send live Supabase credentials during quotation.
- Do not authorize testing until scope, price, dates, rules of engagement, and
  data handling are accepted in writing.
- Create the disposable assessment project only after a reviewer is contracted.
- Freeze and tag the agreed review commit before testing begins.
- Track findings privately; never file exploitable details in the public repo.
