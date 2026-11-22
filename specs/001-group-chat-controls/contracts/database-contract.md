# Database Contract

All mutations authenticate with `auth.uid()`, validate inputs in Postgres, lock the target
conversation before policy checks, use an empty `search_path` in privileged helpers, and return
stable result/error codes. The client never supplies an authoritative actor, timestamp, sequence,
role, event text, Storage path owner, or policy version.

## Mutation RPCs

### `create_group_conversation`

Input: name, 2-49 distinct accepted-contact IDs, and client request ID. The server includes the
caller, enforces 50 total members, assigns admin, and writes `group_created` atomically.

### `publish_group_text_message`

Input: conversation ID, bounded non-empty body, and client request ID. Active/open membership is
required. A retry returns the original compatible message rather than duplicating it.

### `publish_group_voice_message`

Input: existing voice metadata contract plus client request ID and expected policy version. The RPC
rechecks active membership and group publication policy after taking the lock, validates the private
object path/MIME/size/duration, and inserts message plus attachment atomically.

### Voice settings

- `set_group_voice_publication(conversation_id, enabled, client_request_id)`: admin only; increment
  policy version and insert one event only on a real change.
- `set_group_voice_reception(conversation_id, inherit|allow|block)`: current member, own row only,
  with no public system event.

### Administration

- `add_group_member(conversation_id, user_id, client_request_id)`
- `remove_group_member(conversation_id, user_id, client_request_id)`
- `leave_group(conversation_id, client_request_id)`
- `set_group_member_role(conversation_id, user_id, role, client_request_id)`
- `rename_group_conversation(conversation_id, name, client_request_id)`
- `close_group_conversation(conversation_id, client_request_id)`

Every accepted administrative mutation writes exactly one structured event in the same transaction.
Retries are idempotent. Member-limit and last-admin invariants are checked while locked. Locks are
always acquired in conversation-then-sorted-participant order and transactions remain short.

## Read contracts

- Inbox returns a paginated discriminated direct/group union. Group summaries include only safe
  member count, caller role, last visible item and unread state.
- Group history uses a `(group_sequence,id)` cursor, maximum 50 rows, and RLS removes pre-join rows.
- Blocked recipients may read a voice message shell but receive no attachment metadata or Storage
  access. The UI never requests a signed URL in this state.
- The safe member list excludes `voice_notes_mode`, `last_read_at`, and `archived_at`.

## Stable error codes

- `not_group_member`
- `group_closed`
- `group_admin_required`
- `accepted_contact_required`
- `group_member_limit`
- `last_group_admin`
- `group_voice_disabled`
- `stale_group_policy`
- `invalid_group_name`
- `invalid_group_message`
- `voice_attachment_forbidden`

Frontend copy maps these codes in one module; raw database messages are never rendered.

## Verification

- Test reads and every RPC as member, admin, former member, and unrelated authenticated user.
- Race the 50th slot, last-admin mutations, conflicting policy changes, removal/publication, and
  policy/voice publication.
- Verify clients cannot forge/change/delete system rows or fetch blocked attachment metadata/objects.
- Verify new RLS predicates use indexed columns and `(select auth.uid())` where applicable.
