import { Link } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { formatSystemEvent, type ConversationSummary } from '../../features/chat/conversationTypes'
import type { PresenceInfo } from '../../features/presence/usePresence'
import GroupAvatar from './group/GroupAvatar'

const AVATAR_PAIRS = [
  { background: 'var(--accent-1)', color: 'var(--on-accent-1)' },
  { background: 'var(--accent-3)', color: 'var(--on-accent-3)' },
  { background: 'var(--accent-4)', color: 'var(--on-accent-4)' },
  { background: 'var(--accent-5)', color: 'var(--on-accent-5)' },
  { background: 'var(--accent-2)', color: 'var(--on-accent-2)' },
]

function strPair(str: string) {
  let h = 0
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_PAIRS[Math.abs(h) % AVATAR_PAIRS.length]
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

function SqAvatar({ name, size = 52 }: { name: string; size?: number }) {
  return (
    <div
      className="sq-avatar"
      style={{ width: size, height: size, ...strPair(name), fontSize: size * 0.38 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function getPreviewCopy(conv: ConversationSummary): string {
  if (conv.type === 'group') {
    if (conv.last_message_kind === 'system' && conv.last_system_event_type) {
      return formatSystemEvent(conv.last_system_event_type)
    }
    if (conv.last_message_text) return conv.last_message_text
    return `${conv.member_count} ${conv.member_count === 1 ? 'member' : 'members'}`
  }
  return conv.last_message_text ?? `@${conv.other.username}`
}

interface ConversationListItemProps {
  conversation: ConversationSummary
  isActive: boolean
  presence?: PresenceInfo
  onSelect: (conversationId: string) => void
}

export default function ConversationListItem({
  conversation,
  isActive,
  presence,
  onSelect,
}: ConversationListItemProps) {
  const isGroup = conversation.type === 'group'
  const title = isGroup ? conversation.name : conversation.other.display_name
  const preview = getPreviewCopy(conversation)

  return (
    <div
      className={`chat-item${isActive ? ' active' : ''}${isGroup ? ' is-group' : ''}`}
      data-testid={`conversation-item-${conversation.id}`}
    >
      {isGroup ? (
        <div className="chat-item-avatar-wrap" aria-hidden="true">
          <GroupAvatar name={conversation.name} size={52} />
        </div>
      ) : (
        <Link
          to={`/profile/${conversation.other.username}`}
          title={`View profile for ${conversation.other.display_name}`}
          style={{ position: 'relative', flexShrink: 0, display: 'block', textDecoration: 'none' }}
        >
          <SqAvatar name={conversation.other.display_name} size={52} />
          {presence && (
            <div className="presence-dot" style={{ background: presence.dotColor }} />
          )}
        </Link>
      )}

      <button
        type="button"
        className="ci-body chat-item-open"
        aria-current={isActive ? 'true' : undefined}
        onClick={() => onSelect(conversation.id)}
      >
        <div className="ci-name">
          <span className="ci-name-text">{title}</span>
          {isGroup && (
            <span className="ci-group-badge">
              <Users size={10} strokeWidth={2.8} aria-hidden="true" />
              <span>GROUP</span>
            </span>
          )}
          {conversation.last_message_at && (
            <span className="ci-time">{timeAgo(conversation.last_message_at)}</span>
          )}
        </div>
        <div className="ci-sub-row">
          <div className="ci-last">{preview}</div>
          {isActive && (
            <span className="ci-active-marker" aria-hidden="true">
              <Check size={11} strokeWidth={3.2} />
            </span>
          )}
          {conversation.has_unread && <div className="ci-unread" aria-label="Unread messages">!</div>}
        </div>
      </button>
    </div>
  )
}
