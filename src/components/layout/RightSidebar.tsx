import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { UserPlus, UserCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../features/auth/AuthContext'
import { useContacts } from '../../features/contacts/useContacts'
import { useSuggestedContacts } from '../../features/contacts/useSuggestedContacts'
import { useSendContactRequest } from '../../features/contacts/useContactMutations'
import { useGetOrCreateConversation } from '../../features/chat/useGetOrCreateConversation'
import { usePresenceMap } from '../../features/presence/usePresence'
import { useOpenChat } from '../../features/chat/useOpenChat'


function useTrendingTags() {
  return useQuery({
    queryKey: ['trending-tags'],
    queryFn: async () => {
      const { data } = await supabase
        .from('box_tags')
        .select('tag:tags(id, name, slug)')
        .limit(100)
      const counts: Record<string, { id: string; name: string; slug: string; count: number }> = {}
      for (const row of data ?? []) {
        const t = row.tag as { id: string; name: string; slug: string } | null
        if (!t) continue
        if (!counts[t.id]) counts[t.id] = { ...t, count: 0 }
        counts[t.id].count++
      }
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6)
    },
    staleTime: 60_000,
  })
}


function NumFmt(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}

const AVATAR_PAIRS = [
  { background: 'var(--accent-1)', color: 'var(--on-accent-1)' },
  { background: 'var(--accent-3)', color: 'var(--on-accent-3)' },
  { background: 'var(--accent-4)', color: 'var(--on-accent-4)' },
  { background: 'var(--accent-5)', color: 'var(--on-accent-5)' },
  { background: 'var(--accent-2)', color: 'var(--on-accent-2)' },
]

function avatarPair(index: number) {
  return AVATAR_PAIRS[index % AVATAR_PAIRS.length]
}

export default function RightSidebar() {
  const { user } = useAuth()
  const { data: tags }           = useTrendingTags()
  const { data: suggestions = [] } = useSuggestedContacts(user?.id)
  const { data: realContacts = [] } = useContacts(user?.id)
  const presenceMap    = usePresenceMap(realContacts.map(c => c.other.id))
  const sendRequest  = useSendContactRequest(user?.id ?? '')
  const getOrCreate  = useGetOrCreateConversation(user?.id ?? '')
  const openChat     = useOpenChat()

  async function handleOpenChat(otherId: string, otherName: string, otherUsername: string, otherAvatar: string | null) {
    const convId = await getOrCreate.mutateAsync(otherId)
    openChat({ conversationId: convId, otherId, otherName, otherUsername, otherAvatar })
  }
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [sent, setSent]           = useState<Set<string>>(new Set())

  const visibleSuggestions = suggestions.filter(u => !dismissed.has(u.id))

  async function handleAddContact(id: string) {
    setSent(s => new Set([...s, id]))
    await sendRequest.mutateAsync(id)
  }

  return (
    <>
      {/* Trending tags */}
      <div className="panel mb-4" style={{ padding: 14 }}>
        <div className="uppercase mb-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          🔥 Loud This Week
        </div>
        {(tags ?? []).map(t => (
          <NavLink key={t.id} to={`/tag/${t.slug}`} className="trending-tag-item">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>#{t.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--ink-mute)' }}>
              {NumFmt(t.count)}
            </span>
          </NavLink>
        ))}
        {(tags ?? []).length === 0 && (
          <div className="text-xs text-mute">No tags yet</div>
        )}
      </div>

      {/* Suggestions and Contacts only for signed-in users */}
      {user && visibleSuggestions.length > 0 && (
        <div className="panel mb-4" style={{ padding: 14 }}>
          <div className="uppercase mb-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Suggestions
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', marginRight: -6, paddingRight: 6 }}>
            {visibleSuggestions.map((u, i) => {
              const isSent = sent.has(u.id)
              return (
                <div key={u.id} className="row gap-3 mb-3 items-center">
                  <Link
                    to={`/profile/${u.username}`}
                    title={`View profile for ${u.display_name}`}
                    style={{ display: 'block', flexShrink: 0, textDecoration: 'none' }}
                  >
                    <div className="avatar sm" style={avatarPair(i)}>
                      {u.display_name?.charAt(0).toUpperCase() ?? 'U'}
                    </div>
                  </Link>

                  <Link
                    to={`/profile/${u.username}`}
                    style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.display_name}
                    </div>
                    <div className="text-xs text-mute" style={{ fontFamily: 'var(--font-mono)' }}>
                      @{u.username}
                    </div>
                  </Link>

                  {/* Add contact — distinto de seguir */}
                  <button type="button"
                    className="btn btn-icon btn-small"
                    title={isSent ? 'Request sent' : 'Add contact'}
                    onClick={() => !isSent && handleAddContact(u.id)}
                    style={{
                      background: isSent ? 'var(--accent-4)' : 'var(--accent-1)',
                      color: isSent ? 'var(--on-accent-4)' : 'var(--on-accent-1)',
                      flexShrink: 0, width: 30, height: 30,
                      cursor: isSent ? 'default' : 'pointer',
                    }}
                  >
                    {isSent
                      ? <UserCheck size={13} strokeWidth={2.5} />
                      : <UserPlus  size={13} strokeWidth={2.5} />
                    }
                  </button>

                  <button type="button"
                    className="btn btn-icon btn-small"
                    title="Dismiss"
                    onClick={() => setDismissed(s => new Set([...s, u.id]))}
                    style={{ background: 'var(--bg-panel)', color: 'var(--accent-1)', flexShrink: 0, width: 30, height: 30 }}
                  >
                    <X size={13} strokeWidth={2.5} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Contacts — datos reales, solo logueados */}
      {user && realContacts.length > 0 && (
        <div className="panel" style={{ padding: 14 }}>
          <div className="uppercase mb-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Contacts
          </div>
          <div style={{ maxHeight: 168, overflowY: 'auto', marginRight: -6, paddingRight: 6 }}>
            {realContacts.map((c, i) => (
              <div
                key={c.user_a + c.user_b}
                className="row gap-3 mb-3 sidebar-contact-row"
              >
                <Link
                  to={`/profile/${c.other.username}`}
                  title={`View profile for ${c.other.display_name}`}
                  style={{ position: 'relative', flexShrink: 0, display: 'block', textDecoration: 'none' }}
                >
                  <div className="avatar sm" style={avatarPair(i)}>
                    {c.other.display_name?.charAt(0).toUpperCase() ?? 'U'}
                  </div>
                  {/* Dot solo cuando hay dato real y no es offline */}
                  {presenceMap[c.other.id] && (
                    <div style={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 9, height: 9,
                      background: presenceMap[c.other.id].dotColor,
                      border: '2px solid var(--line)',
                    }} />
                  )}
                </Link>
                <div className="sidebar-contact-copy" aria-hidden="true">
                  <span className="sidebar-contact-name">
                    {c.other.display_name}
                  </span>
                  {presenceMap[c.other.id]?.label && (
                    <span className="sidebar-contact-presence" style={{ color: presenceMap[c.other.id].color }}>
                      {presenceMap[c.other.id].label}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="sidebar-contact-open"
                  onClick={() => handleOpenChat(c.other.id, c.other.display_name, c.other.username, c.other.avatar_url)}
                  aria-label={`Open chat with ${c.other.display_name}`}
                  title={`Open chat with ${c.other.display_name}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
