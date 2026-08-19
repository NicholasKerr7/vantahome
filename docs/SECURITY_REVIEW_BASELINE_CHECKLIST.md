# Security Review Baseline Checklist

Status: **candidate evolving; do not tag or provision a review environment yet**

This checklist separates the commit named during quotation from the source and
builds that an independent reviewer is authorized to test. The quotation
baseline is descriptive only. The testing baseline becomes authoritative only
after the scope and rules of engagement identify it in writing.

## Before freezing

- Accept scope, price, dates, test methods, rules of engagement, data handling,
  finding disclosure, emergency contacts, and retest terms in writing.
- Resolve which application, API, database, OAuth, voice, and architecture work
  packages are included and preserve the explicit exclusions.
- Merge only the changes intended for review. Keep the working tree clean and
  require the repository verification workflow to pass on the candidate commit.
- Confirm the candidate includes no credentials, live household data, private
  findings, or active-project configuration.
- Record the candidate's full commit hash, app version/build numbers, migration
  range, Edge Function inventory, and dependency lockfile hash.

## Freeze procedure

1. Run the repository gates on the exact candidate:

   ```sh
   npm ci
   npm run verify
   npm run security:secrets
   npm run supabase:check
   git status --short
   ```

2. Require an empty working tree and a successful GitHub Actions run for the
   same full commit hash.
3. Update the security review brief with that hash and recalculate its file,
   line, migration, Edge Function, and test counts.
4. Create an annotated, non-moving review tag only after written agreement.
   Record the tag and full commit hash in the private engagement record.
5. Build review artifacts from the tag, record their cryptographic hashes, and
   provide installation instructions through the approved channel.
6. Provision the disposable Supabase project from the tagged migrations and
   Edge Functions only after the source freeze is complete.

## Change control

- Do not rewrite or move the frozen tag.
- Develop unrelated work after the freeze on a separate branch; it is outside
  the authorized assessment unless scope is amended in writing.
- Remediate findings on a dedicated private branch and give the reviewer the
  exact retest commit and build hashes.
- If a pre-test blocker changes the frozen source, create a new tag, update the
  private record, rebuild artifacts, and obtain written acknowledgment before
  testing resumes.
- Keep credentials, findings, exploit evidence, vendor contacts, and commercial
  terms outside the public repository.

## Gate record

Sprint 2 remains open until the agreed assessment and retest satisfy the exit
criteria in the [Independent Security Review Brief](./SECURITY_REVIEW_BRIEF.md).
Commit only a non-sensitive completion summary after closure.
