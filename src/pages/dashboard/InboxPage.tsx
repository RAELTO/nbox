import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Phone, Video, ArrowLeft, AudioLines, Mail } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useConversations } from '../../features/chat/useConversations'
import { useMessages } from '../../features/chat/useMessages'
import { usePresence, usePresenceMap } from '../../features/presence/usePresence'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import { useToast } from '../../components/ui/Toast'
import ChatComposer from '../../components/chat/ChatComposer'
import ChatMessageBubble from '../../components/chat/ChatMessageBubble'
import VoiceNoteConversationSettings from '../../components/chat/VoiceNoteConversationSettings'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'var(--accent-1)', 'var(--accent-3)', 'var(--accent-4)',
  'var(--accent-5)', 'var(--accent-2)',
]
function strColor(str: string) {
  let h = 0
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)  return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24)   return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)    return `${d}d`
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

function msgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'TODAY'
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY'
  return d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()
}

// ─── Sq avatar ────────────────────────────────────────────────────────────────
function SqAvatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      className="sq-avatar"
      style={{ width: size, height: size, background: strColor(name), fontSize: size * 0.38 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ─── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({ children, title, onClick, disabled }: {
  children: React.ReactNode
  title?: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inbox-action-btn"
    >
      {children}
    </button>
  )
}

// ─── Thread panel ─────────────────────────────────────────────────────────────
function ThreadPanel({ conversationId, userId, otherId, otherName, otherUsername, onBack }: {
  conversationId: string; userId: string; otherId: string
  otherName: string; otherUsername: string; onBack: () => void
}) {
  const { data: messages = [] } = useMessages(conversationId, userId)
  const presence = usePresence(otherId)
  const toast    = useToast()
  const bottomRef = useRef<HTMLDivElement>(null)
  const voiceSettingsButtonRef = useRef<HTMLButtonElement>(null)
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <main className="chat-thread">
      {/* Header */}
      <div className="chat-thread-head">
        <button type="button" data-mobile-back onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4, marginRight: 2 }}>
          <ArrowLeft size={16} strokeWidth={2.5} />
        </button>
        <Link to={`/profile/${otherUsername}`} style={{ display: 'flex', textDecoration: 'none' }}>
          <SqAvatar name={otherName} size={40} />
        </Link>
        <Link
          to={`/profile/${otherUsername}`}
          style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>{otherName}</div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: presence.color, letterSpacing: '.04em', marginTop: 1 }}>
            {presence.label || (presence.status === 'offline' ? '● OFFLINE' : '● ACTIVE')}
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            ref={voiceSettingsButtonRef}
            type="button"
            className="inbox-action-btn"
            title="Voice note settings"
            aria-label="Voice note settings"
            aria-haspopup="dialog"
            aria-expanded={voiceSettingsOpen}
            onClick={() => setVoiceSettingsOpen(true)}
          >
            <AudioLines size={16} strokeWidth={2.7} aria-hidden="true" />
          </button>
          <ActionBtn title="Call" onClick={() => toast('Calls coming soon')}>
            <Phone size={15} strokeWidth={2.5} />
          </ActionBtn>
          <ActionBtn title="Video" onClick={() => toast('Video coming soon')}>
            <Video size={15} strokeWidth={2.5} />
          </ActionBtn>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-msgs">
        {messages.length === 0 && (
          <div className="chat-first-msg">Be the first to write</div>
        )}
        {messages.map((m, index) => {
          const day = dayLabel(m.created_at)
          const prevDay = index > 0 ? dayLabel(messages[index - 1].created_at) : ''
          const showSep = day !== prevDay
          const isMe = m.sender_id === userId
          return (
            <div key={m.id} className="chat-msg-row">
              {showSep && <div className="chat-day-sep">{day}</div>}
              <ChatMessageBubble message={m} isMine={isMe} time={msgTime(m.created_at)} />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatComposer
        conversationId={conversationId}
        userId={userId}
        onAttach={() => toast('Attachments coming soon')}
      />
      {voiceSettingsOpen && (
        <VoiceNoteConversationSettings
          conversationId={conversationId}
          userId={userId}
          otherName={otherName}
          onClose={() => setVoiceSettingsOpen(false)}
          anchorRef={voiceSettingsButtonRef}
        />
      )}
    </main>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const toast = useToast()

  useLayoutEffect(() => {
    if (window.innerWidth > 760) return
    const bar = document.querySelector<HTMLElement>('.mobile-bar')
    if (bar) document.documentElement.style.setProperty('--mob-bar-h', `${bar.offsetHeight}px`)
    return () => { document.documentElement.style.removeProperty('--mob-bar-h') }
  }, [])

  const { data: convs = [], isLoading } = useConversations(user?.id)
  const otherIds    = convs.map(c => c.other.id)
  const presenceMap = usePresenceMap(otherIds)

  const activeId   = params.get('c')
  const activeConv = convs.find(c => c.id === activeId) ?? null

  const filtered = convs.filter(c =>
    !search || c.other.display_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      <div className={`chat-grid${activeId ? ' show-thread' : ''}`} style={{ height: undefined }}>

        {/* ── Lista de conversaciones ── */}
        <aside className="chat-list">
          {/* Header amarillo */}
          <div className="chat-list-head">
            <h2>NBOX</h2>
            <button
              type="button"
              onClick={() => toast('New chat coming soon')}
              className="chat-new-btn"
            >
              + New
            </button>
          </div>

          {/* Search */}
          <div className="chat-list-search">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" />
          </div>

          {/* Conversations */}
          <div className="chat-list-body">
            {isLoading && (
              <div className="chat-list-loading">Loading…</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="chat-list-empty">
                No conversations.<br />Go to Contacts to start a chat.
              </div>
            )}
            {filtered.map(c => {
              const p = presenceMap[c.other.id]
              return (
                <div
                  key={c.id}
                  className={`chat-item${c.id === activeId ? ' active' : ''}`}
                >
                  <Link
                    to={`/profile/${c.other.username}`}
                    title={`View profile for ${c.other.display_name}`}
                    style={{ position: 'relative', flexShrink: 0, display: 'block', textDecoration: 'none' }}
                  >
                    <SqAvatar name={c.other.display_name} size={52} />
                    {p && (
                      <div className="presence-dot" style={{ background: p.dotColor }} />
                    )}
                  </Link>
                  <button type="button" className="ci-body chat-item-open" onClick={() => setParams({ c: c.id })}>
                    <div className="ci-name">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {c.other.display_name}
                      </span>
                      {c.last_message_at && (
                        <span className="ci-time">{timeAgo(c.last_message_at)}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="ci-last">
                        {c.last_message_text ?? `@${c.other.username}`}
                      </div>
                      {c.has_unread && <div className="ci-unread">!</div>}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── Thread / Empty state ── */}
        {activeConv ? (
          <ThreadPanel
            key={activeConv.id}
            conversationId={activeConv.id}
            userId={user?.id ?? ''}
            otherId={activeConv.other.id}
            otherName={activeConv.other.display_name}
            otherUsername={activeConv.other.username}
            onBack={() => setParams({})}
          />
        ) : (
          <main className="chat-thread chat-empty-state" style={{ background: 'var(--bg)' }}>
            <div className="chat-empty-icon">
              <Mail size={34} strokeWidth={2.5} />
            </div>
            <div className="chat-empty-title">NBOX</div>
            <div className="chat-empty-sub">Select a conversation to get started</div>
          </main>
        )}
      </div>
    </AppShell>
  )
}
