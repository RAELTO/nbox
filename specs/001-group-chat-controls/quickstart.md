# Quickstart and Verification

This is the implementation acceptance runbook. The Spec Kit pilot itself does not apply a database
migration or enable group UI.

## Preconditions

1. Create the implementation branch from current `develop`.
2. Keep E2E credentials only in the ignored local env file.
3. Inspect target Supabase schema and security/performance advisors.
4. Apply the timestamped migration to a disposable/local or designated preview environment first.

## Static gates

```powershell
pnpm lint
pnpm build
pnpm doctor:score
pnpm analyze
```

Review score/chunk changes; these commands do not substitute for browser/database verification.

## Database gates

Run the authorization matrix for member, administrator, former member and unrelated user. Run
concurrent transactions for the final member slot, last-admin changes, conflicting policy changes,
removal against publication, administrative block against voice publication, and an identical
request retry. Confirm one accepted result, stable rejection where applicable, no duplicate item,
and no orphan attachment. A blocked recipient must not select attachment metadata or the object.

## Browser gates

```powershell
pnpm exec playwright test tests/e2e/authenticated.groups.spec.ts
pnpm exec playwright test tests/e2e/authenticated.voice.spec.ts
pnpm test:e2e:a11y
pnpm test:e2e
```

Capture component and full-page evidence at 1440x900, 1024x768, 768x1024, 390x844 and 360x800.
Manually verify physical microphone recording/playback on Chrome Android because emulated permission
coverage cannot validate the device pipeline.

For SC-002, send 30 text messages per maintained browser profile with both users online. Measure
from successful publish response to visible recipient render. At least 95% of combined observations
must be at or below two seconds, with zero duplicate IDs.

## Release gates

- No serious/critical Axe findings and no missing keyboard/touch action.
- No horizontal overflow or clipped overlay in the evidence matrix.
- Existing direct text, emoji, voice and unread scenarios pass unchanged.
- Supabase advisors contain no new finding attributable to the migration.
- Roadmap/spec reflect completed milestones.
- Preview deployment is green before any `develop` to `main` merge.
