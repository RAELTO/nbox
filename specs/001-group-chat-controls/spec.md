# Feature Specification: Group Chat and Voice Controls

**Feature Branch**: `chore/spec-kit-pilot`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Add a group chat foundation with administrators, responsive
messaging, and group-wide or personal controls for receiving voice notes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Use a Private Group Chat (Priority: P1)

An authenticated user creates a named group from existing contacts, becomes its first
administrator, and exchanges text messages with the added members. Every member sees the group
in the same inbox used for direct conversations and can use it from desktop, tablet, or mobile.

**Why this priority**: A secure, usable group conversation is the foundation required by every
other group policy and management capability.

**Independent Test**: Create a group with two contacts, open it as each participant, exchange text
messages, and confirm that a non-member cannot see or open the conversation.

**Acceptance Scenarios**:

1. **Given** an authenticated user with accepted contacts, **When** the user names a group and
   selects at least two contacts, **Then** the group is created with that user as administrator and
   appears in every member's inbox.
2. **Given** an active group member, **When** the member sends a text message, **Then** all active
   members receive the message in the correct conversation and chronological position.
3. **Given** a user who is not a current group member, **When** the user attempts to discover or
   open the group, **Then** no group metadata or message content is disclosed.
4. **Given** the same group on desktop, tablet, and mobile, **When** a member opens the conversation,
   **Then** creation, reading, composing, member information, and settings remain available through
   layouts appropriate to that viewport.

---

### User Story 2 - Apply an Administrative Voice-Note Block (Priority: P1)

A group administrator disables new voice notes for the entire group. Members can continue sending
text, but any attempt to start or publish a voice note is stopped with a clear explanation. The
conversation records an authentic system event describing the policy change.

**Why this priority**: A group-wide rule must be authoritative, immediate, and resistant to bypass
before voice notes can safely operate in group conversations.

**Independent Test**: Disable voice notes as an administrator, attempt to record and publish as
multiple members, and confirm that text remains available and no member can bypass the block.

**Acceptance Scenarios**:

1. **Given** voice notes are currently allowed, **When** an administrator disables them, **Then** all
   members see a system event and subsequent recording attempts explain that an administrator has
   disabled voice notes for the group.
2. **Given** a member began recording immediately before the policy changed, **When** the member
   attempts to publish after the change, **Then** publication is rejected, no playable group message
   is created, and the member receives a clear explanation.
3. **Given** a non-administrator, **When** that member attempts to change the group-wide setting,
   **Then** the action is unavailable and any direct attempt is rejected.
4. **Given** voice notes are blocked for the group, **When** any member composes text or an
   administrator re-enables voice notes, **Then** the permitted action succeeds without requiring a
   new conversation.

---

### User Story 3 - Control Personal Voice-Note Reception (Priority: P2)

Each member chooses whether voice notes in a particular group are allowed, blocked, or inherited
from the member's global preference. A personal block affects only that member: voice messages are
represented by an explanatory placeholder and their audio is not loaded on that member's device.

**Why this priority**: Personal control protects attention, privacy, and data usage without imposing
one member's preference on the rest of the group.

**Independent Test**: Block voice notes for one member, send a voice note while group-wide audio is
allowed, and confirm that only that member sees a placeholder while other members can play it.

**Acceptance Scenarios**:

1. **Given** group-wide voice notes are allowed, **When** one member blocks voice notes for that
   group, **Then** existing and new voice messages show a placeholder for that member and no audio
   is loaded for them.
2. **Given** one member has blocked voice notes, **When** another member opens the same message,
   **Then** that other member's own preferences determine whether the audio is playable.
3. **Given** a member chooses inherit, **When** the global voice-note preference changes, **Then** the
   group follows the new global preference without an additional group-setting change.
4. **Given** an administrator has disabled voice notes group-wide, **When** a member's personal
   setting is allow, **Then** the administrative block still takes precedence.

---

### User Story 4 - Manage Membership and Administrator Continuity (Priority: P2)

Administrators add accepted contacts directly, remove members, and assign additional administrators.
Members can inspect the participant list and leave voluntarily. The group always retains at least
one administrator while it has members.

**Why this priority**: Private groups require understandable membership and continuous ownership to
avoid inaccessible or unmanaged conversations.

**Independent Test**: Add and remove members, promote a second administrator, leave as the original
creator, and confirm that access changes immediately and one administrator remains.

**Acceptance Scenarios**:

1. **Given** a group administrator and an accepted contact, **When** the administrator adds that
   contact, **Then** the new member gains access from the join point and the group records a system
   event.
2. **Given** a removed or departed member, **When** that user attempts to reopen or receive updates
   from the group, **Then** access is denied immediately.
3. **Given** the only administrator, **When** that person attempts to leave or remove their own role,
   **Then** the action requires assigning another administrator first.
4. **Given** a regular member, **When** the member views group details, **Then** administrative
   actions are absent while participant information and the leave action remain available.

### Edge Cases

- A contact relationship ends after both users have joined the same group; existing group
  membership remains until an administrator removes the member or the member leaves.
- Two administrators change the group-wide voice setting at nearly the same time; the latest
  accepted change becomes authoritative and only authentic accepted changes create system events.
- A member loses connectivity while sending text or voice; pending content is not duplicated when
  connectivity returns, and a voice note is rechecked against current policy before publication.
- A personal preference changes while a voice message is visible; blocked audio becomes a
  placeholder and is no longer requested, while allowed audio remains user-initiated.
- A member is removed while the conversation is open; the composer becomes unavailable and no
  further group data is disclosed by the server, live subscription, or later media requests; the
  client closes the surface and clears its group cache without claiming to erase content the member
  already viewed.
- A former member is added again; the reactivation establishes a new server-issued join point and
  does not restore history from the former membership period.
- A group reaches its member limit; administrators receive a clear explanation and existing members
  remain unaffected.
- A group has no messages yet; members see an intentional empty state with the composer available.
- A device or browser cannot record audio; text remains usable and the interface explains that
  recording is unavailable on that device.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Authenticated users MUST be able to create a private group containing themselves and
  at least two accepted contacts.
- **FR-002**: A group MUST have a name between 1 and 80 visible characters and MUST support up to 50
  current members during the pilot phase.
- **FR-003**: The creator MUST become the first group administrator and member.
- **FR-004**: Current members MUST be able to find the group in their inbox, inspect its current
  membership, read messages available to them, and send text messages.
- **FR-005**: Non-members and former members MUST NOT receive group metadata, message content, media,
  presence updates, or policy events.
- **FR-006**: New and returning members MUST see messages and system events created from their
  current server-issued join point forward; earlier history, including history from a former
  membership period, MUST remain undisclosed during the pilot.
- **FR-007**: Members MUST be able to leave a group, and administrators MUST be able to remove
  current members other than the last remaining administrator.
- **FR-008**: Administrators MUST be able to promote members to administrator and demote
  administrators when at least one other administrator remains.
- **FR-008A**: An administrator MUST be able to close the group when they are its only current
  member. Closing MUST revoke future access and publication for everyone and MUST NOT be usable as
  a shortcut to expose or transfer prior history.
- **FR-009**: Only administrators MUST be able to disable or enable new voice-note publication for
  the entire group.
- **FR-010**: The current group-wide voice policy MUST be checked before recording begins and again
  before a voice note is published.
- **FR-011**: A group-wide block MUST override every member-level or global allow preference.
- **FR-012**: Every member MUST be able to set a per-group voice preference of inherit, allow, or
  block without changing the experience of other members.
- **FR-013**: Inherit MUST follow the member's global voice-note preference; an explicit per-group
  allow or block MUST take precedence over that global preference.
- **FR-014**: When a member's effective preference blocks voice notes, the conversation MUST display
  an explanatory placeholder instead of a player and MUST NOT load playable audio on that device.
- **FR-015**: Personal voice settings MUST remain private to the member; other members MUST NOT be
  told who personally blocked voice notes.
- **FR-015A**: A member whose personal preference blocks reception MAY still publish a voice note
  while the administrative group-wide policy allows publication.
- **FR-016**: An administrative voice-policy change MUST create a system event that members cannot
  impersonate, edit, or delete.
- **FR-017**: Membership, administrator, and group-name changes MUST create authentic system events
  visible only to members entitled to see them.
- **FR-017A**: Only administrators MUST be able to rename a group, and every accepted name MUST
  satisfy the same 1-to-80-visible-character rule used at creation.
- **FR-018**: Existing voice notes MUST remain part of the conversation after a new group-wide block;
  each member's effective reception preference determines whether those messages are playable.
- **FR-019**: Text messaging MUST remain available when recording is unsupported or any voice policy
  blocks audio.
- **FR-020**: Policy or membership changes MUST take effect before any later message publication is
  accepted, including work started under an older policy.
- **FR-021**: Rejected or failed voice publication MUST NOT create an empty voice message, expose a
  media location, or leave other members expecting unavailable content.
- **FR-022**: The group chat, member list, administration, policy controls, placeholders, and system
  events MUST retain equivalent capability across supported desktop, tablet, and mobile layouts.
- **FR-023**: All interactive controls MUST have accessible names, visible keyboard focus, touch-safe
  targets, and understandable status or error announcements.
- **FR-024**: Group search and unread state MUST distinguish group conversations from direct chats
  without changing the behavior of existing direct conversations.

### Key Entities

- **Group Conversation**: A private named conversation with current membership, creation time,
  lifecycle state, and an authoritative group-wide voice-note policy.
- **Group Membership**: A user's bounded access to a group, including role, join point, departure
  state, and membership timestamps.
- **Group Message**: Text, voice, or authentic system content associated with one group and a sender
  when applicable.
- **Member Voice Preference**: One member's inherit, allow, or block choice for a specific group.
- **System Event**: An immutable, non-user-authored record of accepted membership, role, name, or
  administrative voice-policy changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a named group with selected contacts and send the first text message
  in under two minutes on each supported viewport class.
- **SC-002**: At least 95% of text messages sent while recipients are online become visible to those
  recipients within two seconds and appear only once.
- **SC-003**: In authorization tests, 100% of non-member and former-member attempts disclose no group
  details, messages, media, or live updates.
- **SC-004**: An accepted administrative voice-policy change governs 100% of recording and
  publication attempts that begin or finish after the change.
- **SC-005**: A member with an effective personal block receives a placeholder for 100% of group
  voice messages and receives no playable audio content for those messages.
- **SC-006**: All creation, messaging, membership, administration, and voice-policy scenarios are
  completable at 1440x900, 1024x768, 768x1024, 390x844, and 360x800 without horizontal overflow or
  missing actions.
- **SC-007**: The group surfaces contain no serious or critical automated accessibility violations,
  and every primary action is operable by keyboard and touch.
- **SC-008**: Existing direct-chat text, emoji, and voice-note regression scenarios continue to pass
  unchanged after group chat is introduced.

## Assumptions

- The pilot covers private group conversations only; public group discovery and public invitations
  are excluded.
- Only accepted contacts can be invited, but ending a contact relationship does not automatically
  remove an existing group membership.
- New members receive history only from their join point. Historical sharing can be specified as a
  separate future capability.
- The pilot member limit is 50, chosen to bound the first release while preserving meaningful group
  use; raising the limit requires a later capacity review.
- Voice recording and playback reuse the user-visible behavior already established for direct chat.
- Audio/video calls, general file attachments, reactions to group messages, replies, mentions,
  end-to-end encryption, group feeds, and advanced moderation are outside this feature.
- Existing authentication, profile identities, global voice preference, inbox navigation, and
  notification behavior remain available dependencies.
- Adding an accepted contact is immediate during the pilot; invitation acceptance, rejection, and
  pending membership states are deferred to a separate capability.
- Group notifications are outside this pilot. The inbox and an open private Realtime subscription
  provide discovery and live updates without creating a second notification path.
