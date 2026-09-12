# Data Model: Group Chat and Voice Controls

## `conversations` evolution

Existing direct conversations remain valid. Add group name, creator, `active|closed` status,
group-wide voice publication flag, monotonically increasing policy version, next group sequence,
last message ID/sender, and updated/closed timestamps.

Replace direct-only constraints with a discriminated invariant:

- `direct`: `user_a` and `user_b` non-null and ordered; group-only fields null.
- `group`: `user_a` and `user_b` null; name and creator non-null; trimmed visible name length 1-80.

Preserve direct-pair uniqueness as a partial unique index. A group may transition from active to
closed only when the caller is an administrator and its only current member. Closed is terminal in
this pilot.

## `conversation_participants` evolution

Add `role` (`member|admin`), server-issued `joined_at`, and nullable `history_from_sequence` required
for groups. Existing `deleted_at` remains the prospective departure time; `archived_at`,
`last_read_at`, and `voice_notes_mode` keep their user-specific meanings.

Reactivation resets role to member, join time/sequence, deletion/archive/read state, and personal
voice mode. It never restores the former access boundary. The existing composite primary key stays.

Indexes:

- `(user_id, conversation_id) where deleted_at is null`
- `(conversation_id, history_from_sequence, user_id) where deleted_at is null`
- `(conversation_id, user_id) where deleted_at is null and role = 'admin'`

## `messages` evolution

Add `group_sequence bigint`, `client_request_id uuid`, `system_event_type text`, and
`system_event_payload jsonb`. Make `sender_id` nullable under a discriminated constraint:

- system: sender null, structured event present, no attachment, immutable;
- text/voice: sender non-null, system fields null;
- group user message: client request ID and group sequence required.

Initial event types: `group_created`, `member_added`, `member_removed`, `member_left`,
`member_promoted`, `member_demoted`, `group_renamed`, `group_voice_policy_changed`, `group_closed`.

Indexes:

- unique `(conversation_id, group_sequence)` where sequence is not null;
- unique `(conversation_id, sender_id, client_request_id)` where request ID is not null;
- `(conversation_id, group_sequence desc, id desc)` for group cursor history;
- replace the current direct history index with stable `(conversation_id, created_at desc, id desc)`.

## Attachments and private Storage

The existing `message_attachments` and `chat-media` bucket remain canonical. Paths remain
`{conversation_id}/{sender_id}/{message_id}/{attachment.ext}`.

Database and Storage SELECT authorization verifies active/open membership, current join boundary,
and, for group voice, the viewer's effective reception. The voice message shell remains visible as
a placeholder when reception is blocked, but its attachment row and object do not.

## Read models and private helpers

Private helpers use explicit schema qualification and `search_path = ''`:

- `is_active_conversation_participant`
- `can_read_group_sequence`
- `is_group_admin`
- `can_receive_voice_attachment`
- sequence allocation under the conversation lock

Narrow reads expose only caller-safe data:

- `get_inbox_conversations`: normalized, paginated direct/group summaries and unread metadata;
- `get_group_members`: profile identity, role and join time, never private voice/read/archive fields;
- `get_group_voice_state`: caller-visible publication and effective reception state only.

## Authorization matrix

| Action | Member | Admin | Former/non-member |
|---|---:|---:|---:|
| Read visible metadata/history | yes | yes | no |
| Read safe active member list | yes | yes | no |
| Send text or policy-allowed voice | yes | yes | no |
| Set own reception mode | yes | yes | no |
| Rename/add/remove/promote/demote | no | yes | no |
| Change group publication policy | no | yes | no |
| Close as only member | no | yes | no |
| Forge/change/delete system event | no | no | no |

An administrator may remove/demote another administrator only while at least one administrator
remains. Personal voice blocking never changes another member's publication capability.
