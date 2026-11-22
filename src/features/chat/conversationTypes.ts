import type { Profile } from '../../types/database'

export type ConversationKind = 'direct' | 'group'
type GroupStatus = 'active' | 'closed'
export type GroupMemberRole = 'member' | 'admin'
export type VoiceReceptionMode = 'inherit' | 'allow' | 'block'

export type SystemEventType =
  | 'group_created'
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'member_promoted'
  | 'member_demoted'
  | 'group_renamed'
  | 'group_voice_policy_changed'
  | 'group_closed'

type ConversationProfileSummary = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url'
>

interface BaseConversationSummary {
  id: string
  type: ConversationKind
  last_message_id: string | null
  last_message_sender_id: string | null
  last_message_at: string | null
  last_message_text: string | null
  last_message_kind: 'text' | 'image' | 'voice' | 'system' | null
  last_system_event_type: SystemEventType | null
  created_at: string
  updated_at: string
  my_last_read_at: string | null
  has_unread: boolean
  my_voice_notes_mode: VoiceReceptionMode
}

export interface DirectConversationSummary extends BaseConversationSummary {
  type: 'direct'
  user_a: string
  user_b: string
  other: ConversationProfileSummary
}

export interface GroupConversationSummary extends BaseConversationSummary {
  type: 'group'
  name: string
  status: GroupStatus
  member_count: number
  my_role: GroupMemberRole
  voice_notes_allowed: boolean
  voice_policy_version: number
  history_from_sequence: number
}

export type ConversationSummary = DirectConversationSummary | GroupConversationSummary

export interface GroupMember {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  role: GroupMemberRole
  joined_at: string
}

export interface GroupVoiceState {
  conversation_id: string
  status: GroupStatus
  voice_notes_allowed: boolean
  voice_policy_version: number
  my_role: GroupMemberRole
  personal_mode: VoiceReceptionMode
  global_enabled: boolean
  effective_can_receive: boolean
  effective_can_publish: boolean
}

type GroupChatErrorCode =
  | 'not_group_member'
  | 'group_closed'
  | 'group_admin_required'
  | 'accepted_contact_required'
  | 'group_member_limit'
  | 'last_group_admin'
  | 'group_voice_disabled'
  | 'stale_group_policy'
  | 'invalid_group_name'
  | 'invalid_group_message'
  | 'voice_attachment_forbidden'
  | 'user_banned'
  | 'group_other_members_exist'

const GROUP_ERROR_MESSAGES: Record<GroupChatErrorCode, string> = {
  not_group_member: 'You are no longer a member of this group.',
  group_closed: 'This group has been closed and can no longer receive messages.',
  group_admin_required: 'Only a group admin can perform this action.',
  accepted_contact_required: 'You can only add accepted contacts to a private group.',
  group_member_limit: 'Groups are limited to 50 active members.',
  last_group_admin: 'Assign another admin before leaving or removing the last admin role.',
  group_voice_disabled: 'An admin disabled voice notes in this group.',
  stale_group_policy: 'The group voice setting changed while you were sending. Try again.',
  invalid_group_name: 'Group name must be between 1 and 80 characters.',
  invalid_group_message: 'Enter a valid message before sending.',
  voice_attachment_forbidden: 'This voice note could not be verified or attached.',
  user_banned: 'Your account cannot perform this action.',
  group_other_members_exist: 'Remove all other members before closing this group.',
}

function extractGroupChatErrorCode(error: unknown): GroupChatErrorCode | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown }
  const text = [candidate.message, candidate.details, candidate.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')

  for (const code of Object.keys(GROUP_ERROR_MESSAGES) as GroupChatErrorCode[]) {
    if (text.includes(code)) return code
  }
  return null
}

export function mapGroupChatError(
  error: unknown,
  fallback = 'Could not complete the group action. Please try again.',
): string {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown }
    const msg = typeof candidate.message === 'string' ? candidate.message : ''
    if (
      candidate.code === 'PGRST202'
      || candidate.code === '42883'
      || msg.includes('Could not find the function')
    ) {
      return 'Private groups require applying the latest Supabase migration first.'
    }
  }
  const code = extractGroupChatErrorCode(error)
  return code ? GROUP_ERROR_MESSAGES[code] : fallback
}

export function formatSystemEvent(
  eventType: SystemEventType | string | null | undefined,
  payload?: Record<string, unknown> | null,
): string {
  const actorName = typeof payload?.actor_name === 'string' && payload.actor_name.trim()
    ? payload.actor_name.trim()
    : 'An admin'
  const targetName = typeof payload?.target_name === 'string' && payload.target_name.trim()
    ? payload.target_name.trim()
    : 'a member'

  switch (eventType) {
    case 'group_created':
      return `${actorName} created this private group.`
    case 'member_added':
      return `${actorName} added ${targetName}.`
    case 'member_removed':
      return `${actorName} removed ${targetName}.`
    case 'member_left':
      return `${actorName} left the group.`
    case 'member_promoted':
      return `${actorName} made ${targetName} a group admin.`
    case 'member_demoted':
      return `${actorName} removed admin role from ${targetName}.`
    case 'group_renamed': {
      const nextName = typeof payload?.new_name === 'string' && payload.new_name.trim()
        ? `"${payload.new_name.trim()}"`
        : 'a new name'
      return `${actorName} renamed the group to ${nextName}.`
    }
    case 'group_voice_policy_changed':
      return payload?.enabled === false
        ? `${actorName} disabled voice notes for this group.`
        : `${actorName} enabled voice notes for this group.`
    case 'group_closed':
      return `${actorName} closed this group.`
    default:
      return 'Group settings were updated.'
  }
}
