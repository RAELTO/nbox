import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useConversations } from '../../features/chat/useConversations'
import { useFloatingChat, type FloatingChatEntry } from '../../features/chat/FloatingChatContext'
import type { ConversationSummary } from '../../features/chat/conversationTypes'
import { usePresence } from '../../features/presence/usePresence'
import Avatar from '../ui/Avatar'
import ConversationThread from './ConversationThread'
import GroupAvatar from './group/GroupAvatar'

function buildFallbackSummary(entry: FloatingChatEntry, userId: string): ConversationSummary {
  const now = new Date().toISOString()
  if (entry.type === 'group') {
    return {
      id: entry.conversationId,
      type: 'group',
      name: entry.title || entry.otherName || 'Group chat',
      status: 'active',
      member_count: 3,
      my_role: 'member',
      voice_notes_allowed: true,
      voice_policy_version: 1,
      history_from_sequence: 1,
      last_message_id: null,
      last_message_sender_id: null,
      last_message_at: null,
      last_message_text: null,
      last_message_kind: null,
      last_system_event_type: null,
      created_at: now,
      updated_at: now,
      my_last_read_at: null,
      has_unread: false,
      my_voice_notes_mode: 'inherit',
    }
  }
  return {
    id: entry.conversationId,
    type: 'direct',
    user_a: userId,
    user_b: entry.otherId,
    other: {
      id: entry.otherId,
      username: entry.otherUsername,
      display_name: entry.otherName,
      avatar_url: entry.otherAvatar,
    },
    last_message_id: null,
    last_message_sender_id: null,
    last_message_at: null,
    last_message_text: null,
    last_message_kind: null,
    last_system_event_type: null,
    created_at: now,
    updated_at: now,
    my_last_read_at: null,
    has_unread: false,
    my_voice_notes_mode: 'inherit',
  }
}

function FloatingWindow({ entry, index }: { entry: FloatingChatEntry; index: number }) {
  const { user } = useAuth()
  const { data: convs = [] } = useConversations(user?.id)
  const { closeChat, toggleMinimize } = useFloatingChat()
  const presence = usePresence(entry.type === 'group' ? '' : entry.otherId)

  const right = Math.min(18 + index * 356, Math.max(10, window.innerWidth - 360))
  const label = entry.title || entry.otherName

  if (entry.minimized) {
    return (
      <div className="float-chat-min" style={{ right }}>
        <button
          type="button"
          className="float-chat-min-toggle"
          onClick={() => toggleMinimize(entry.conversationId)}
          aria-label={`Restore chat with ${label}`}
        >
          <span style={{ position: 'relative', flexShrink: 0 }}>
            {entry.type === 'group' ? (
              <GroupAvatar name={label} size={28} />
            ) : (
              <>
                <Avatar name={entry.otherName} src={entry.otherAvatar} size="sm" />
                <span style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 9, height: 9,
                  background: presence.dotColor,
                  border: '2px solid #111111',
                }} />
              </>
            )}
          </span>
          <span className="float-chat-min-name">{label}</span>
        </button>
        <button
          type="button"
          aria-label="Close chat"
          className="float-chat-close-btn"
          onClick={e => { e.stopPropagation(); closeChat(entry.conversationId) }}
        >
          <X size={13} strokeWidth={3} aria-hidden="true" />
        </button>
      </div>
    )
  }

  const resolvedConversation =
    convs.find(c => c.id === entry.conversationId)
    ?? buildFallbackSummary(entry, user?.id ?? '')

  return (
    <div className="float-chat" style={{ right }}>
      <ConversationThread
        conversation={resolvedConversation}
        userId={user?.id ?? ''}
        variant="floating"
        onMinimize={() => toggleMinimize(entry.conversationId)}
        onClose={() => closeChat(entry.conversationId)}
        onRevoked={() => closeChat(entry.conversationId)}
      />
    </div>
  )
}

export default function FloatingChats() {
  const { chats } = useFloatingChat()
  if (!chats.length) return null

  return createPortal(
    <>
      {chats.map((entry, i) => (
        <FloatingWindow key={entry.conversationId} entry={entry} index={i} />
      ))}
    </>,
    document.body,
  )
}
