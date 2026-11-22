import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Mail, Plus, Users } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useConversations } from '../../features/chat/useConversations'
import { usePresenceMap } from '../../features/presence/usePresence'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import ConversationListItem from '../../components/chat/ConversationListItem'
import ConversationThread from '../../components/chat/ConversationThread'

const CreateGroupDialog = lazy(() => import('../../components/chat/group/CreateGroupDialog'))

type InboxFilter = 'all' | 'direct' | 'group'

export default function InboxPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const newBtnRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (window.innerWidth > 760) return
    const bar = document.querySelector<HTMLElement>('.mobile-bar')
    if (bar) document.documentElement.style.setProperty('--mob-bar-h', `${bar.offsetHeight}px`)
    return () => { document.documentElement.style.removeProperty('--mob-bar-h') }
  }, [])

  const { data: convs = [], isLoading } = useConversations(user?.id)
  const directOtherIds = useMemo(
    () => convs.flatMap(c => (c.type === 'direct' ? [c.other.id] : [])),
    [convs],
  )
  const presenceMap = usePresenceMap(directOtherIds)

  const activeId = params.get('c')
  const activeConv = convs.find(c => c.id === activeId) ?? null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return convs.filter(c => {
      if (filter !== 'all' && c.type !== filter) return false
      if (!q) return true
      if (c.type === 'group') return c.name.toLowerCase().includes(q)
      return (
        c.other.display_name.toLowerCase().includes(q)
        || c.other.username.toLowerCase().includes(q)
      )
    })
  }, [convs, filter, search])

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      <div className={`chat-grid${activeId ? ' show-thread' : ''}`} style={{ height: undefined }}>
        <aside className="chat-list">
          <div className="chat-list-head">
            <h2>NBOX</h2>
            <button
              ref={newBtnRef}
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="chat-new-btn"
              aria-haspopup="dialog"
              aria-expanded={newChatOpen}
            >
              <Plus size={14} strokeWidth={3} aria-hidden="true" />
              <span>New</span>
            </button>
          </div>

          <div className="chat-list-search">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chats or groups…"
              aria-label="Search conversations"
            />
          </div>

          <div className="chat-list-filters" role="group" aria-label="Conversation type filters">
            {([
              ['all', 'All'],
              ['direct', 'Direct'],
              ['group', 'Groups'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                className={`chat-filter-chip${filter === key ? ' active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {key === 'group' && <Users size={11} strokeWidth={2.8} aria-hidden="true" />}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="chat-list-body">
            {isLoading && (
              <div className="chat-list-loading">Loading…</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="chat-list-empty">
                {search || filter !== 'all' ? (
                  'No matching conversations.'
                ) : (
                  <>
                    No conversations.<br />Start a chat or create a group with + New.
                  </>
                )}
              </div>
            )}
            {filtered.map(c => (
              <ConversationListItem
                key={c.id}
                conversation={c}
                isActive={c.id === activeId}
                presence={c.type === 'direct' ? presenceMap[c.other.id] : undefined}
                onSelect={id => setParams({ c: id })}
              />
            ))}
          </div>
        </aside>

        {activeConv ? (
          <ConversationThread
            key={activeConv.id}
            conversation={activeConv}
            userId={user?.id ?? ''}
            variant="inbox"
            onBack={() => setParams({})}
            onRevoked={() => setParams({})}
          />
        ) : (
          <main className="chat-thread chat-empty-state" style={{ background: 'var(--bg)' }}>
            <div className="chat-empty-icon">
              <Mail size={34} strokeWidth={2.5} aria-hidden="true" />
            </div>
            <div className="chat-empty-title">NBOX</div>
            <div className="chat-empty-sub">Select a conversation or create a private group</div>
          </main>
        )}
      </div>

      {newChatOpen && user?.id && (
        <Suspense fallback={null}>
          <CreateGroupDialog
            userId={user.id}
            anchorRef={newBtnRef}
            onClose={() => setNewChatOpen(false)}
            onOpenedConversation={conversationId => {
              setNewChatOpen(false)
              setParams({ c: conversationId })
            }}
          />
        </Suspense>
      )}
    </AppShell>
  )
}
