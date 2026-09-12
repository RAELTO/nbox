<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Added principles:
  - I. Preserve NBOX Product Identity
  - II. Enforce Security at the Data Boundary
  - III. Maintain Cross-Viewport Feature Parity
  - IV. Keep One Trusted Source per Concern
  - V. Ship Only Verified, Efficient Changes
- Added sections:
  - Technical and Product Constraints
  - Development and Review Workflow
- Removed sections: none
- Deferred items: none
-->

# NBOX Constitution

## Core Principles

### I. Preserve NBOX Product Identity

Every product change MUST preserve NBOX as a direct, modular, neobrutalist social
experience. Product terminology MUST use box/drop, dropear, contacts, votes, and reactions
according to the established vocabulary. All new user-facing text MUST be in English.
Interactive icons MUST use Lucide React rather than Unicode characters, except for documented
NBOX textual decorators. New UI MUST reuse the existing design tokens, hard borders, deliberate
shadows, and current visual hierarchy instead of introducing an unrelated design system.

Rationale: a recognizable language and visual system are core product behavior, not optional
decoration.

### II. Enforce Security at the Data Boundary

Authorization MUST be enforced by database policies or trusted server-side functions; frontend
visibility checks MUST NOT be treated as authorization. Every schema change MUST be represented
by a timestamped migration committed under `supabase/migrations/` and reconciled with the target
Supabase environment. Secrets, test credentials, authenticated browser state, and private media
MUST remain local and ignored by Git. Notifications MUST originate from protected database
triggers. URLs, uploads, and private chat media MUST pass the repository's established validation,
ownership, and participant-access controls.

Rationale: clients are untrusted, and consistent server-side enforcement prevents bypasses,
orphaned data, and accidental exposure.

### III. Maintain Cross-Viewport Feature Parity

Every user capability MUST remain available on desktop, tablet, and mobile at the documented
breakpoints: mobile at 600 px or below, tablet at 960 px or below, and desktop above 960 px.
Layouts MAY adapt, collapse, or move controls, but MUST NOT silently remove functionality.
Interactive changes MUST support keyboard, touch, visible focus, appropriate accessible names,
and viewport-safe overlays. Modals, dropdowns, and popovers MUST use portals and MUST remain
clamped to the viewport. Significant UI changes MUST be verified across the five maintained
Playwright viewport profiles and checked for serious or critical accessibility violations.

Rationale: responsive design in NBOX is a functional contract, not merely a visual resize.

### IV. Keep One Trusted Source per Concern

The roadmap MUST describe portfolio status and priority. A Spec Kit feature specification MUST
describe the intended behavior and acceptance criteria for each substantial bounded change. Code,
migrations, and automated tests MUST implement and verify that contract. Discoveries that alter
accepted behavior MUST flow back into the active specification and roadmap before the feature is
considered complete. Equivalent components, hooks, queries, and business rules MUST be reused or
extracted instead of copied.

Rationale: explicit ownership of information prevents conflicting documents and duplicated logic.

### V. Ship Only Verified, Efficient Changes

Every shippable change MUST pass linting and the production build. Tests MUST be proportional to
risk: changed user flows require interaction coverage, responsive UI requires viewport coverage,
and database policies require authorization and race-condition coverage. React Doctor MUST be used
as a trend signal and MUST NOT replace build, lint, or browser tests. Large optional dependencies
and feature surfaces MUST be lazy-loaded where practical, and meaningful bundle changes MUST be
reviewed. Dependency additions MUST respect the seven-day minimum release age and the repository's
restricted lifecycle-script policy unless a documented review approves an exception.

Rationale: correctness, supply-chain safety, and client performance are joint release criteria.

## Technical and Product Constraints

- The supported application stack is React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7,
  TanStack Query 5, Supabase, Zod, React Hook Form, Lucide React, and pnpm 12.
- Server state MUST use the established feature hooks and TanStack Query patterns. Realtime state
  MUST preserve the current Supabase participant and policy boundaries.
- Feature code belongs under the established `src/features`, `src/components`, and `src/pages`
  domains. Shared patterns MUST move to the nearest appropriate shared module.
- Chat media MUST use private storage with database metadata; public URLs MUST NOT become the
  authorization mechanism.
- A new runtime dependency requires a license and maintenance review, an audit, and evidence that
  an existing dependency or platform capability cannot reasonably provide the behavior.

## Development and Review Workflow

1. Substantial features begin with a bounded specification containing testable scenarios, explicit
   exclusions, assumptions, entities, and measurable success criteria.
2. Implementation branches MUST originate from the current `develop` branch. Routine accepted work
   accumulates in `develop`; reviewed batches move from `develop` to `main` through a pull request.
3. Commits, pull-request titles, and pull-request descriptions MUST be in English and describe the
   delivered outcome.
4. Supabase changes MUST inspect existing schema and advisories first, use a committed migration,
   and validate RLS and privileged functions before UI integration is marked complete.
5. Visual work MUST include browser evidence at the affected viewports. Functional work MUST include
   regression evidence for adjacent flows so responsive adaptations do not remove capabilities.
6. The roadmap and active specification MUST be updated as each traced milestone is completed.
7. A change MUST NOT merge to `main` while required checks fail, the deployment preview fails, or
   the working diff contains unreviewed artifacts or credentials.

## Governance

This constitution is the highest repository-level governance document for NBOX. Feature plans,
task lists, and implementation decisions MUST demonstrate compliance or explicitly document a
time-bounded exception and its risk. Amendments require a reviewable change that explains the
rationale, migration impact, and any affected specifications or templates.

Constitution versions follow semantic versioning: MAJOR for incompatible removals or redefinitions
of governance, MINOR for new principles or materially expanded requirements, and PATCH for
clarifications without changed obligations. Every substantial feature review MUST check security,
responsive parity, accessibility, roadmap/spec consistency, verification evidence, and dependency
impact before merge.

Runtime implementation details remain in `CLAUDE.md`, architecture documents, and active feature
specifications. When those documents conflict with this constitution, this constitution prevails
until it is formally amended.

**Version**: 1.0.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-12
