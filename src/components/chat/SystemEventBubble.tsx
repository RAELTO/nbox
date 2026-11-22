import {
  Crown,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Pencil,
  ShieldAlert,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import { formatSystemEvent, type SystemEventType } from '../../features/chat/conversationTypes'
import type { MessageRow } from '../../features/chat/useMessages'

function SystemEventIcon({
  type,
  enabled,
  size,
}: {
  type: SystemEventType | null
  enabled: boolean
  size: number
}) {
  if (type === 'member_added') return <UserPlus size={size} strokeWidth={2.7} aria-hidden="true" />
  if (type === 'member_removed') return <UserMinus size={size} strokeWidth={2.7} aria-hidden="true" />
  if (type === 'member_left') return <LogOut size={size} strokeWidth={2.7} aria-hidden="true" />
  if (type === 'member_promoted' || type === 'member_demoted') return <Crown size={size} strokeWidth={2.7} aria-hidden="true" />
  if (type === 'group_renamed') return <Pencil size={size} strokeWidth={2.7} aria-hidden="true" />
  if (type === 'group_voice_policy_changed') {
    return enabled
      ? <Mic size={size} strokeWidth={2.7} aria-hidden="true" />
      : <MicOff size={size} strokeWidth={2.7} aria-hidden="true" />
  }
  if (type === 'group_closed') return <Lock size={size} strokeWidth={2.7} aria-hidden="true" />
  return <ShieldAlert size={size} strokeWidth={2.7} aria-hidden="true" />
}

export default function SystemEventBubble({
  message,
  compact = false,
}: {
  message: MessageRow
  compact?: boolean
}) {
  const copy = message.system_event_type
    ? formatSystemEvent(message.system_event_type, message.system_event_payload)
    : message.body

  return (
    <div
      className={`chat-system-event${compact ? ' compact' : ''}`}
      role="status"
      aria-live="off"
    >
      <SystemEventIcon
        type={message.system_event_type}
        enabled={message.system_event_payload?.enabled === true}
        size={compact ? 12 : 14}
      />
      <span>{copy}</span>
    </div>
  )
}
