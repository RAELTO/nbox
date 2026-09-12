# Tasks: Group Chat and Voice Controls

**Input**: Design documents from `/specs/001-group-chat-controls/`

**Tests**: Required by the feature specification and NBOX constitution. Story tests are written to
fail before implementation and pass at each checkpoint.

## Phase 1: Setup

**Purpose**: Establish traceable implementation and test surfaces without changing production data.

- [ ] T001 Record `20260912190000_group_chat_controls.sql` and the implementation milestone in NBOX_ROADMAP.md
- [ ] T002 [P] Add reusable authenticated group fixtures without credentials in tests/e2e/support/groups.ts
- [ ] T003 [P] Add a transaction-isolated authorization test harness in supabase/tests/group_chat_controls.sql
- [ ] T004 Capture pre-change Supabase security/performance advisor output in specs/001-group-chat-controls/evidence/pre-advisors.md

---

## Phase 2: Foundational

**Purpose**: Create the shared data and frontend contracts required by every group story.

**Critical**: No story work starts until this phase passes review.

- [ ] T005 Add discriminated conversation, participant, sequence, idempotency, and system-event columns/constraints/indexes in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T006 Add private active-membership, join-boundary, admin, sequence, and safe-read helpers with explicit grants in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T007 Replace group-capable conversation/message/attachment/Storage policies with indexed RLS predicates while preserving direct access in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T008 Restrict direct client message writes so `voice` and `system` cannot bypass protected RPCs in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T009 Add schema-backfill and direct-chat compatibility assertions in supabase/tests/group_chat_controls.sql
- [ ] T010 Regenerate nullable sender and group RPC/table definitions in src/types/database.ts
- [ ] T011 [P] Define `ConversationSummary`, `TimelineItem`, roles, policy states, and stable error codes in src/features/chat/conversationTypes.ts
- [ ] T012 Normalize and paginate direct/group inbox results without scanning all messages in src/features/chat/useConversations.ts
- [ ] T013 Add newest-first cursor pagination and system-event-safe profile mapping in src/features/chat/useMessages.ts
- [ ] T014 Extract one reusable direct/group thread from src/pages/dashboard/InboxPage.tsx into src/components/chat/ConversationThread.tsx
- [ ] T015 Migrate floating-chat state from `other*` fields to `ConversationSummary` in src/features/chat/FloatingChatContext.tsx and src/components/chat/FloatingChatPanel.tsx

**Checkpoint**: Existing direct text, emoji, unread and voice scenarios pass before group UI is enabled.

---

## Phase 3: User Story 1 - Create and Use a Private Group Chat (Priority: P1) MVP

**Goal**: Create a private named group from accepted contacts and exchange text from all viewports.

**Independent Test**: Create a three-person group, send/read text as every member, and prove an
unrelated user sees no metadata, history or live update.

### Tests for User Story 1

- [ ] T016 [P] [US1] Add create/send/read/non-member and idempotent-retry SQL cases in supabase/tests/group_chat_controls.sql
- [ ] T017 [P] [US1] Add five-viewport create/search/open/text scenarios and record the under-two-minute completion measurement in tests/e2e/authenticated.groups.spec.ts

### Implementation for User Story 1

- [ ] T018 [US1] Implement atomic create-group and publish-group-text RPCs plus safe inbox/member reads in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T019 [P] [US1] Add typed group create/member queries and error mapping in src/features/chat/useGroupChatMutations.ts
- [ ] T020 [P] [US1] Add searchable accepted-contact name/member form in src/components/chat/group/CreateGroupDialog.tsx
- [ ] T021 [P] [US1] Add group list identity and avatar fallback in src/components/chat/ConversationListItem.tsx and src/components/chat/group/GroupAvatar.tsx
- [ ] T022 [US1] Integrate lazy group creation and normalized selection into src/pages/dashboard/InboxPage.tsx
- [ ] T023 [US1] Render group headers and text timelines through src/components/chat/ConversationThread.tsx
- [ ] T024 [US1] Add responsive dialog/sheet, focus, touch, safe-area, and overflow styles in src/styles/globals.css

**Checkpoint**: The private text-only group MVP is independently usable and authorized.

---

## Phase 4: User Story 2 - Administrative Voice-Note Block (Priority: P1)

**Goal**: Let admins authoritatively enable/disable group voice publication with an authentic event.

**Independent Test**: Disable voice as admin, reject recording and a racing publish for every member,
keep text usable, and re-enable voice without replacing the conversation.

### Tests for User Story 2

- [ ] T025 [P] [US2] Add admin/non-admin, conflicting-policy, and publish-race SQL cases in supabase/tests/group_chat_controls.sql
- [ ] T026 [P] [US2] Add admin block, text continuity, unsupported-recorder fallback, stale recording, and event scenarios in tests/e2e/authenticated.groups.spec.ts

### Implementation for User Story 2

- [ ] T027 [US2] Implement group publication policy RPC, policy versioning, and protected structured events in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T028 [US2] Extend atomic voice publication to group membership/policy locking in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T029 [US2] Split typed direct-recipient and group-admin send capabilities in src/features/chat/useVoiceNotePolicies.ts
- [ ] T030 [P] [US2] Render immutable structured timeline notices in src/components/chat/SystemEventBubble.tsx
- [ ] T031 [P] [US2] Add lazy admin publication controls in src/components/chat/group/GroupVoiceAdminSection.tsx
- [ ] T032 [US2] Recheck group policy before recording/upload and preserve rejected drafts in src/components/chat/ChatComposer.tsx and src/features/chat/useSendVoiceMessage.ts

**Checkpoint**: Group publication policy is server-authoritative, race-safe and visible on every viewport.

---

## Phase 5: User Story 3 - Personal Voice-Note Reception (Priority: P2)

**Goal**: Let each member privately inherit, allow or block group voice reception without affecting
another member's ability to publish or play.

**Independent Test**: Block one member, prove no attachment/signed-URL request occurs for that member,
and play the same message as another member.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add preference precedence and blocked attachment/Storage SQL cases in supabase/tests/group_chat_controls.sql
- [ ] T034 [P] [US3] Add self-blocked sender, preserved pre-block voice, placeholder, zero-media-request, inherit, and independent-playback scenarios in tests/e2e/authenticated.groups.spec.ts

### Implementation for User Story 3

- [ ] T035 [US3] Implement caller-private reception state and attachment/Storage authorization in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T036 [US3] Expose separate send and playback capabilities without leaking preferences in src/features/chat/useVoiceNotePolicies.ts
- [ ] T037 [P] [US3] Add accessible non-player blocked state in src/components/chat/VoiceMessagePlaceholder.tsx
- [ ] T038 [P] [US3] Add personal inherit/allow/block controls in src/components/chat/group/PersonalVoicePreferenceSection.tsx
- [ ] T039 [US3] Prevent attachment fetch/player mount when blocked in src/components/chat/ChatMessageBubble.tsx and src/components/chat/VoiceMessageBubble.tsx

**Checkpoint**: Personal reception is private and enforced by UI, database metadata, and Storage.

---

## Phase 6: User Story 4 - Membership and Administrator Continuity (Priority: P2)

**Goal**: Manage members, roles, rejoining, leaving, renaming and safe group closure.

**Independent Test**: Add/remove/re-add, promote/demote, rename, leave after transferring admin, close
an admin-only group, and prove immediate prospective revocation.

### Tests for User Story 4

- [ ] T040 [P] [US4] Add member-limit, rejoin boundary, last-admin, closure, revocation, and concurrency SQL cases in supabase/tests/group_chat_controls.sql
- [ ] T041 [P] [US4] Add member/role/name/leave/closure and live-revocation scenarios in tests/e2e/authenticated.groups.spec.ts

### Implementation for User Story 4

- [ ] T042 [US4] Implement add/remove/rejoin/leave/role/rename/close RPCs and atomic events in supabase/migrations/20260912190000_group_chat_controls.sql
- [ ] T043 [US4] Add member/details queries and administration mutations in src/features/chat/useGroupChatMutations.ts
- [ ] T044 [P] [US4] Build safe member list and role actions in src/components/chat/group/GroupMemberList.tsx
- [ ] T045 [P] [US4] Build lazy rename/add/leave/close details surface in src/components/chat/group/GroupDetailsDialog.tsx
- [ ] T046 [US4] Subscribe to own membership changes and evict/close revoked conversations in src/components/chat/ConversationThread.tsx
- [ ] T047 [US4] Integrate group details in Inbox and compact floating presentation in src/pages/dashboard/InboxPage.tsx and src/components/chat/FloatingChatPanel.tsx

**Checkpoint**: Group ownership cannot be orphaned and revoked users receive no later data.

---

## Phase 7: Polish and Cross-Cutting Verification

- [ ] T048 [P] Add group keyboard/focus and serious/critical Axe coverage in tests/e2e/authenticated.a11y.spec.ts
- [ ] T049 [P] Add five-viewport group baselines and full-page evidence in tests/e2e/authenticated.visual.spec.ts
- [ ] T050 Run the 30-message-per-profile SC-002 protocol and record results in specs/001-group-chat-controls/evidence/performance.md
- [ ] T051 Verify physical recording/playback and permission recovery on Chrome Android and record results in specs/001-group-chat-controls/evidence/android-voice.md
- [ ] T052 Run direct-chat regression, full Playwright, lint and production build from specs/001-group-chat-controls/quickstart.md
- [ ] T053 Run React Doctor and bundle analysis, lazy-load group/details/floating surfaces, and record deltas in specs/001-group-chat-controls/evidence/frontend-quality.md
- [ ] T054 Re-run Supabase advisors and document no new feature finding in specs/001-group-chat-controls/evidence/post-advisors.md
- [ ] T055 Update delivered checkboxes, decisions and remaining risks in specs/001-group-chat-controls/spec.md and NBOX_ROADMAP.md

---

## Dependencies and Execution Order

- Setup -> Foundational -> US1 is the minimum viable private group chat.
- US2 depends on the US1 group/thread foundation, but is independently testable as a policy slice.
- US3 depends on group voice messages from US2; its reception rules never alter publication.
- US4 depends on US1 membership but may be developed alongside US2/US3 after foundational contracts.
- Cross-cutting verification follows whichever stories are selected for release.

Parallel examples: T002/T003, T011 plus database work, T016/T017, T025/T026, T033/T034,
T040/T041, and the separate component tasks marked `[P]` operate on different files after their
phase prerequisites exist.

## Implementation Strategy

1. Deliver Setup and Foundational without exposing group UI.
2. Deliver US1 as the MVP and stop for independent RLS and five-viewport validation.
3. Add US2 before enabling group voice publication.
4. Add US3 to enforce personal reception at every data boundary.
5. Add US4 management/continuity, then execute all cross-cutting release gates.

Every task uses the required checkbox, sequential ID, optional parallel marker, story label where
applicable, and explicit repository path.
