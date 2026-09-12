import { createPortal } from 'react-dom'
import { useRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AudioLines, Minus, X, Phone, Video } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useMessages } from '../../features/chat/useMessages'
import { usePresence } from '../../features/presence/usePresence'
import { useFloatingChat, type FloatingChatEntry } from '../../features/chat/FloatingChatContext'
import Avatar from '../ui/Avatar'
import { useToast } from '../ui/Toast'
import ChatComposer from './ChatComposer'
import ChatMessageBubble from './ChatMessageBubble'
import VoiceNoteConversationSettings from './VoiceNoteConversationSettings'

function timeMsg(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function FloatingWindow({ entry, index }: { entry: FloatingChatEntry; index: number }) {
  const { user } = useAuth()
  const { closeChat, toggleMinimize } = useFloatingChat()
  const { data: messages = [] } = useMessages(entry.conversationId, user?.id)
  const presence = usePresence(entry.otherId)
  const toast = useToast()
  const bottomRef = useRef<HTMLDivElement>(null)
  const voiceSettingsButtonRef = useRef<HTMLButtonElement>(null)
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)

  const right = Math.min(18 + index * 356, Math.max(10, window.innerWidth - 360))

  useEffect(() => {
    if (!entry.minimized) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, entry.minimized])

  if (entry.minimized) {
    return (
      <div className="float-chat-min" style={{ right }}>
        <button
          type="button"
          className="float-chat-min-toggle"
          onClick={() => toggleMinimize(entry.conversationId)}
          aria-label={`Restore chat with ${entry.otherName}`}
        >
          <span style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar name={entry.otherName} src={entry.otherAvatar} size="sm" />
            <span style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 9, height: 9,
              background: presence.dotColor,
              border: '2px solid #111111',
            }} />
          </span>
          <span className="float-chat-min-name">{entry.otherName}</span>
        </button>
        <button
          type="button"
          aria-label="Close chat"
          style={{
            width: 26, height: 26, flexShrink: 0,
            background: 'var(--ink)', border: '2px solid var(--ink)',
            color: 'var(--bg-panel)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { e.stopPropagation(); closeChat(entry.conversationId) }}
        >
          <X size={13} strokeWidth={3} />
        </button>
      </div>
    )
  }

  return (
    <div className="float-chat" style={{ right }}>
      <div className="fc-head">
        <Link
          to={`/profile/${entry.otherUsername}`}
          title={`View ${entry.otherName}'s profile`}
          style={{ position: 'relative', flexShrink: 0, display: 'block', textDecoration: 'none' }}
        >
          <Avatar name={entry.otherName} src={entry.otherAvatar} size="sm" />
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 9, height: 9,
            background: presence.dotColor,
            border: '2px solid #111111',
          }} />
        </Link>
        <Link
          to={`/profile/${entry.otherUsername}`}
          style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.otherName}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: presence.color, letterSpacing: '.04em' }}>
            {presence.label || (presence.status === 'offline' ? 'OFFLINE' : 'ACTIVE')}
          </div>
        </Link>
        <button
          ref={voiceSettingsButtonRef}
          className="fc-icon"
          type="button"
          title="Voice note settings"
          aria-label="Voice note settings"
          aria-haspopup="dialog"
          aria-expanded={voiceSettingsOpen}
          onClick={() => setVoiceSettingsOpen(true)}
        >
          <AudioLines size={13} strokeWidth={2.7} aria-hidden="true" />
        </button>
        <button className="fc-icon fc-call" type="button" title="Call" onClick={() => toast('Calls coming soon')}>
          <Phone size={13} strokeWidth={2.5} />
        </button>
        <button className="fc-icon fc-video" type="button" title="Video" onClick={() => toast('Video coming soon')}>
          <Video size={13} strokeWidth={2.5} />
        </button>
        <button className="fc-icon" type="button" title="Minimize" onClick={() => toggleMinimize(entry.conversationId)}>
          <Minus size={12} strokeWidth={2.5} />
        </button>
        <button className="fc-icon" type="button" title="Close" onClick={() => closeChat(entry.conversationId)}>
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>

      <div className="fc-msgs">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
            Be the first to write
          </div>
        )}
        {messages.map(m => {
          const isMe = m.sender_id === user?.id
          return (
            <ChatMessageBubble
              key={m.id}
              message={m}
              isMine={isMe}
              time={timeMsg(m.created_at)}
              sentLabel=" sent"
              compact
            />
          )
        })}
        <div ref={bottomRef} />
      </div>

      <ChatComposer
        conversationId={entry.conversationId}
        userId={user?.id ?? ''}
        compact
        onAttach={() => toast('Attachments coming soon')}
      />
      {voiceSettingsOpen && user?.id && (
        <VoiceNoteConversationSettings
          conversationId={entry.conversationId}
          userId={user.id}
          otherName={entry.otherName}
          onClose={() => setVoiceSettingsOpen(false)}
          anchorRef={voiceSettingsButtonRef}
        />
      )}
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
    document.body
  )
}
