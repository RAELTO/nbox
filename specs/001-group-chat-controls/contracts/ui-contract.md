# UI Contract

## Shared behavior

- Inbox and floating chat consume the same discriminated conversation model, thread, timeline,
  composer and voice-policy hooks.
- Group creation/details and the heavy floating panel mount lazily only when opened.
- UI copy is English; icons are Lucide; surfaces reuse NBOX tokens, hard borders and shadows.
- Stable backend codes map to concise accessible copy; raw errors never appear.

## Create group

- `New chat` offers `Direct message` and `Group chat` without removing the direct path.
- The form contains name, searchable accepted-contact multi-select, selected count and a submit
  disabled until the name and two-contact minimum are valid.
- Desktop/tablet use a centered, clamped dialog. Mobile uses a viewport-safe sheet below the header
  and above bottom navigation; the primary action remains reachable with the keyboard open.
- Success opens the thread. Failure preserves input and announces the mapped reason.

## Thread and details

- The header identifies a group without individual presence and opens `Group details`.
- Details show safe active members, caller role, personal reception setting and admin-only
  rename/add/remove/role/publication controls.
- Mobile details replace the thread with a back action; desktop/tablet may use a side panel. No
  capability is omitted.
- Revocation unsubscribes, cancels pending work, removes cached group data, closes the surface and
  announces that access ended.

## Timeline and voice

- Text and playable voice reuse existing bubbles.
- System events are centered non-interactive notices derived from structured codes, never styled as
  a user message and never editable.
- Personal blocking renders `VoiceMessagePlaceholder`; it never mounts the audio control or requests
  attachment metadata/signed URLs.
- Group-wide blocking disables recording and explains `An admin disabled voice notes in this group.`
  Text and emoji stay usable.

## Accessibility and responsive evidence

- Dialog/sheet focus is trapped/restored; Escape/back closes safely.
- Member controls, menus, toggles and placeholders expose accessible name/state.
- Destructive actions confirm the exact member/group; live status is concise and non-repeating.
- Touch targets meet the repository's 44 CSS px target where space permits.

| Viewport | Required evidence |
|---|---|
| 1440x900 | list, thread, details panel, create dialog |
| 1024x768 | list/thread/settings without overlap |
| 768x1024 | one-panel navigation and portal surfaces |
| 390x844 | creation, thread, member/admin/personal voice controls |
| 360x800 | same capabilities, keyboard-safe composer, no horizontal overflow |

The active group is identifiable by text/icon, not color alone. Visual snapshots supplement
interaction assertions; they never replace them.
