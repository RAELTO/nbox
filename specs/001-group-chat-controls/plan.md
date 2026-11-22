# Implementation Plan: Group Chat and Voice Controls

**Branch**: `chore/spec-kit-pilot` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-group-chat-controls/spec.md`

## Summary

Extend the existing private conversation system to support named group chats, server-authorized
membership and administrator changes, ordered immutable system events, and two independent voice
controls: an administrator policy for publication and a private member preference for reception.
The implementation evolves the current chat and private `chat-media` model instead of creating a
parallel stack. Group mutations and publication use transactional RPCs; RLS and Storage policies
enforce active membership, the current join point, and effective voice reception.

## Technical Context

**Language/Version**: TypeScript 6.0, React 19.2, PostgreSQL on Supabase

**Primary Dependencies**: Vite 8, React Router 7, TanStack Query 5, Supabase JS 2, Zod 4,
React Hook Form 7, Lucide React; no new runtime dependency

**Storage**: Supabase Postgres plus the existing private `chat-media` Storage bucket

**Testing**: SQL authorization/concurrency verification, ESLint, TypeScript/Vite production build,
Playwright interaction/visual/accessibility tests, React Doctor and bundle review

**Target Platform**: Modern Chromium-class desktop and mobile browsers at the five maintained
Playwright viewports

**Project Type**: React single-page web application with Supabase backend

**Performance Goals**: 95% of online group text deliveries visible once within two seconds in a
30-message test run; no duplicate events; no eager blocked-audio request; no material initial-route
bundle regression

**Constraints**: Private groups only, 50 active members maximum, current-membership history only,
server-side authorization, private audio, cross-viewport parity, no notification expansion, no
client-authored system events

**Scale/Scope**: One reusable chat domain serving inbox and floating panels; group creation,
member/role/name management, text, voice publication policy, personal reception and closure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **Identity**: PASS. Reuse current NBOX chat primitives, vocabulary, tokens, hard borders, shadows
  and Lucide icons; all new UI copy is English.
- **Data-boundary security**: PASS BY DESIGN. One timestamped migration; RLS/private helpers;
  protected mutation RPCs; private Storage; no credentials or media in Git.
- **Viewport parity**: PASS BY PLAN. Creation, thread, member list and settings have desktop,
  tablet, 390 px and 360 px layouts and Playwright evidence.
- **Single source**: PASS. Existing chat tables/hooks/components are extended; this spec owns feature
  behavior and the roadmap owns portfolio status.
- **Verification and efficiency**: PASS BY PLAN. No dependency addition; targeted SQL/browser tests
  precede full lint/build/doctor/bundle checks.

**Post-design re-check**: PASS. The design keeps authorization in Postgres/Storage, uses one chat
model, defines accessibility/responsive contracts, and introduces no constitutional exception.
Pre-existing Supabase policy-performance advisories remain a separate backlog and must not be
broadened by the new migration.

## Project Structure

### Documentation (this feature)

```text
specs/001-group-chat-controls/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- database-contract.md
|   `-- ui-contract.md
|-- checklists/requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- components/chat/
|   |-- ConversationThread.tsx           # planned extraction
|   |-- GroupChatDetails.tsx              # planned, lazy
|   |-- GroupChatForm.tsx                 # planned, lazy
|   |-- SystemEventBubble.tsx             # planned
|   `-- VoiceMessagePlaceholder.tsx       # planned
|-- features/chat/
|   |-- conversationTypes.ts              # planned discriminated types
|   |-- useConversations.ts
|   |-- useGroupChatMutations.ts           # planned RPC mutations
|   |-- useMessages.ts
|   `-- useVoiceNotePolicies.ts
|-- pages/dashboard/InboxPage.tsx
|-- styles/globals.css
`-- types/database.ts

supabase/migrations/
`-- 20260912190000_group_chat_controls.sql   # reserved for implementation

tests/e2e/
|-- authenticated.groups.spec.ts          # planned
|-- authenticated.voice.spec.ts
|-- authenticated.visual.spec.ts
`-- authenticated.a11y.spec.ts
```

**Structure Decision**: Keep one React application backed directly by Supabase. Extend the existing
chat feature and shared components so inbox and floating chat consume the same conversation,
timeline and policy contracts. Put schema/security evolution in one reviewable migration and then
regenerate checked TypeScript database types.

## Complexity Tracking

No constitution violations are required.
