# Research: Group Chat and Voice Controls

## Decision 1: Extend the existing conversation aggregate

**Decision**: Add group-specific fields and constraints to `conversations`, and extend
`conversation_participants`, `messages`, and `message_attachments` rather than adding a parallel
group-message schema.

**Rationale**: Direct chat already provides inbox ordering, unread state, Realtime invalidation,
voice metadata, private Storage and shared UI. A second stack would duplicate the highest-risk
authorization and media behavior.

**Alternatives rejected**:

- Separate `groups`, `group_messages`, and `group_message_attachments`: useful for a future social
  group/feed product, but duplicates chat behavior and confuses that separate roadmap item.
- Encode group members in JSON: prevents relational constraints, indexed RLS and safe concurrent
  member-limit enforcement.

## Decision 2: Add accepted contacts immediately during the pilot

**Decision**: Creation and administrator add-member actions activate accepted contacts immediately.
There is no pending invitation state in this feature.

**Rationale**: This resolves creation consistently, keeps the pilot bounded and avoids introducing
notifications and invitation lifecycle rules before the group-chat foundation is proven.

**Alternative rejected**: Pending invitations require acceptance/rejection, expiry, notification,
privacy and membership-state contracts that are independently valuable but outside this pilot.

## Decision 3: Use transactional RPCs and per-conversation sequence numbers

**Decision**: Every group publication or administrative mutation locks the conversation row,
allocates the next monotonic `group_sequence`, validates current membership/policy, and commits the
change plus any system event atomically. Client request IDs make retries safe.

**Rationale**: Server timestamps alone cannot define an unambiguous join boundary under concurrent
messages. A conversation-local sequence supports stable order, current-membership history and
precise policy cutovers. Direct chats retain their current path until intentionally migrated.

**Alternatives rejected**: Client timestamps are untrusted; a global sequence couples unrelated
conversations; optimistic client checks cannot stop a publish racing an administrator block.

## Decision 4: Store immutable system events in `messages`

**Decision**: Permit a null sender only for `kind = 'system'`; add a constrained structured event
type and JSON payload. Only protected RPCs may create system rows. Clients cannot insert, update or
delete them.

**Rationale**: Events belong in the same ordered stream and pagination boundary as messages.
Structured fields allow reliable rendering and audit assertions without parsing prose.

**Alternative rejected**: A separate event stream requires two queries and a client merge that can
drift under pagination and Realtime delivery.

## Decision 5: Keep personal voice preferences private at the data boundary

**Decision**: Reuse `conversation_participants.voice_notes_mode`. Group-wide `allow/block` controls
publication; member `inherit/allow/block` plus the global profile flag controls reception. Attachment
metadata and private Storage objects are selectable only when the viewer may receive the audio.

**Rationale**: Hiding a player in React is insufficient because a known signed URL or attachment
row could still disclose audio. A member may publish while personally blocking reception when the
group-wide policy allows it.

**Alternative rejected**: UI-only filtering violates the security constitution and still downloads
data the user asked not to receive.

## Decision 6: Reset the access boundary on rejoin

**Decision**: A former participant can be reactivated in the existing composite-key row. The server
resets role, join time, join sequence and departure state. Earlier history remains inaccessible;
immutable system events retain the audit trail.

**Rationale**: The application needs current membership, not a public membership-history browser.
This avoids selecting the latest of multiple membership-period rows throughout RLS.

**Alternative rejected**: One row per membership period gives richer audit data but complicates
current-state uniqueness without a pilot requirement.

## Decision 7: Use RLS-aware Postgres Changes, not public group channels

**Decision**: Subscribe to group messages plus the viewer's participant row and group metadata.
Removal triggers immediate UI closure/cache eviction; later rows and Storage requests fail RLS.
Presence/Broadcast and group notifications are excluded.

**Rationale**: Existing chat uses Supabase Postgres Changes. Extending it minimizes new surface area
while membership RLS remains authoritative.

**Alternative rejected**: Public channels can leak group existence. Private Broadcast may be
reconsidered if measured scale makes database-change subscriptions insufficient.

## Decision 8: Normalize the frontend conversation contract

**Decision**: Replace `other*` and direct-only shapes with a discriminated `ConversationSummary` and
extract one `ConversationThread` consumed by Inbox and floating windows. Use a paginated inbox read
model instead of downloading every message to calculate the last sender.

**Rationale**: The current hooks and floating context assume `user_a/user_b`; keeping those assumptions
would spread group conditionals and duplicate behavior.

**Alternative rejected**: A separate Group Chat page creates two message experiences and makes
responsive parity and direct-chat regression harder to maintain.

## Decision 9: Keep the pilot dependency-neutral and lazy

**Decision**: Use existing React, TanStack Query, Supabase, Zod, React Hook Form, Lucide and
Playwright/Axe tooling. Lazy-load group creation/details and the heavy floating chat host only when
opened.

**Rationale**: The feature requires domain design, not another UI/state library. This protects
bundle size and supply-chain policy.

## Existing risks and boundaries

- Current queries are direct-chat-specific and fetch all messages to discover last senders.
- Current message loading returns the oldest 100 rather than cursor-paginating the newest history.
- `messages.sender_id` and frontend profile joins assume every row has a sender.
- Current Storage signed URLs last five minutes; authorization cannot retract one already issued.
  Group audio must remain user-initiated, use very short URLs or authenticated download, and never
  prefetch when blocked.
- Existing Supabase advisories include policy initialization and multiple-permissive-policy warnings
  in older tables. New policies must use `(select auth.uid())`, indexed predicates and consolidation;
  the wider cleanup remains separately tracked.
- Revocation is prospective. NBOX can stop later requests and purge its cache, but cannot retract
  content already seen or copied.
