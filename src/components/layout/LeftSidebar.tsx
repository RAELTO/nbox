import { useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Home, Compass, Contact, Inbox, UsersRound, Clock, Bookmark, Settings2, LogOut, LogIn } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useProfile } from '../../features/profile/useProfile'
import { useIncomingRequests } from '../../features/contacts/useContactRequests'
import { useContacts } from '../../features/contacts/useContacts'
import { usePresenceMap } from '../../features/presence/usePresence'
import { useGetOrCreateConversation } from '../../features/chat/useGetOrCreateConversation'
import { useOpenChat } from '../../features/chat/useOpenChat'
import { useIsAdmin } from '../../features/auth/useIsAdmin'
import { useToast } from '../ui/Toast'
import AppearanceModal from '../ui/AppearanceModal'
import ConfirmDialog from '../ui/ConfirmDialog'
import Avatar from '../ui/Avatar'
import AdminBadge from '../ui/AdminBadge'

const AVATAR_PAIRS = [
  { background: 'var(--accent-1)', color: 'var(--on-accent-1)' },
  { background: 'var(--accent-3)', color: 'var(--on-accent-3)' },
  { background: 'var(--accent-4)', color: 'var(--on-accent-4)' },
  { background: 'var(--accent-5)', color: 'var(--on-accent-5)' },
  { background: 'var(--accent-2)', color: 'var(--on-accent-2)' },
]

export default function LeftSidebar() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const isAdmin = useIsAdmin()
  const { data: incoming = [] } = useIncomingRequests(user?.id)
  const { data: realContacts = [] } = useContacts(user?.id)
  const presenceMap = usePresenceMap(realContacts.map(c => c.other.id))
  const getOrCreate = useGetOrCreateConversation(user?.id ?? '')
  const openChat = useOpenChat()
  const navigate = useNavigate()
  const toast = useToast()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const appearanceBtnRef = useRef<HTMLButtonElement>(null)

  async function handleContactChat(otherId: string, otherName: string, otherUsername: string, otherAvatar: string | null) {
    const convId = await getOrCreate.mutateAsync(otherId)
    openChat({ conversationId: convId, otherId, otherName, otherUsername, otherAvatar })
  }

  async function handleSignOut() {
    await signOut()
    toast('See you soon. Keep it loud.')
    navigate('/login')
    setConfirmSignOut(false)
  }

  return (
    <>
      {/* Sidebar panel — white background so text doesn't blend with dot-grid */}
      <nav
        className="side-nav"
        style={{
          background: 'var(--bg-panel)',
          border: 'var(--border)',
          boxShadow: 'var(--shadow)',
          padding: '10px 8px',
        }}
      >
        {/* Profile snippet */}
        {user && (
          <NavLink to="/my-box" title="My Profile" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <Avatar
              name={profile?.display_name ?? user.email ?? 'U'}
              src={profile?.avatar_url}
              size="sm"
            />
            <div className="side-link-info" style={{ minWidth: 0, flex: 1 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800 }}>
                {profile?.display_name ?? user.email}
                {isAdmin && <AdminBadge />}
              </div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-mute)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                My Profile
              </div>
            </div>
          </NavLink>
        )}

        <NavLink to="/" end title="Home" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
          <Home size={20} strokeWidth={2.5} /> Home
        </NavLink>

        <NavLink to="/explore" title="Explore" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
          <Compass size={20} strokeWidth={2.5} /> Explore
        </NavLink>

        {user && (
          <NavLink to="/nbox" title="NBOX" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <Inbox size={20} strokeWidth={2.5} /> NBOX
          </NavLink>
        )}

        {user && (
          <NavLink to="/contacts" title="Contacts" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <Contact size={20} strokeWidth={2.5} /> Contacts
            {incoming.length > 0 && (
              <span className="badge" style={{ marginLeft: 'auto' }}>{incoming.length}</span>
            )}
          </NavLink>
        )}

        {user && (
          <NavLink to="/groups" title="Groups" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <UsersRound size={20} strokeWidth={2.5} /> Groups
          </NavLink>
        )}

        {user && (
          <NavLink to="/saves" title="Saved" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <Bookmark size={20} strokeWidth={2.5} /> Saved
          </NavLink>
        )}

        {user && (
          <button type="button" title="Memories" className="side-link" onClick={() => toast('Memories coming soon')}>
            <Clock size={20} strokeWidth={2.5} /> Memories
          </button>
        )}

        {/* Appearance — opens modal */}
        <button type="button"
          ref={appearanceBtnRef}
          title="Appearance"
          className={`side-link${appearanceOpen ? ' active' : ''}`}
          onClick={() => setAppearanceOpen(o => !o)}
        >
          <Settings2 size={20} strokeWidth={2.5} /> Appearance
        </button>

        {user ? (
          <button type="button" title="Sign out" className="side-link side-link-danger" onClick={() => setConfirmSignOut(true)}>
            <LogOut size={20} strokeWidth={2.5} /> Sign out
          </button>
        ) : (
          <NavLink to="/login" title="Sign in" className="side-link">
            <LogIn size={20} strokeWidth={2.5} /> Sign in
          </NavLink>
        )}

      </nav>

      {/* Panel Contacts — solo visible en tablet (821-1100px) via CSS */}
      {user && realContacts.length > 0 && (
        <div className="sidebar-tablet-contacts panel" style={{ padding: 14, marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Contacts
          </div>
          {realContacts.map((c, i) => (
            <div
              key={c.user_a + c.user_b}
              className="tablet-contact-row row gap-3 mb-3"
            >
              <Link
                to={`/profile/${c.other.username}`}
                onClick={e => e.stopPropagation()}
                title={`View profile for ${c.other.display_name}`}
                style={{ position: 'relative', flexShrink: 0, display: 'block', textDecoration: 'none' }}
              >
                <div className="avatar sm" style={AVATAR_PAIRS[i % AVATAR_PAIRS.length]}>
                  {c.other.display_name?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                {presenceMap[c.other.id] && (
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 9, height: 9,
                    background: presenceMap[c.other.id].dotColor,
                    border: '2px solid var(--line)',
                  }} />
                )}
              </Link>
              <span className="tablet-contact-name" aria-hidden="true">
                {c.other.display_name}
              </span>
              <button
                type="button"
                className="tablet-contact-chat"
                title={`Chat with ${c.other.display_name}`}
                aria-label={`Chat with ${c.other.display_name}`}
                onClick={() => handleContactChat(c.other.id, c.other.display_name, c.other.username, c.other.avatar_url)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Sign out confirmation */}
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="You are about to sign out. You will need to sign in again to post, comment, or save boxes."
        confirmLabel="Yes, sign out"
        cancelLabel="Stay"
        onConfirm={handleSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />

      {/* Appearance modal */}
      {appearanceOpen && (
        <AppearanceModal
          onClose={() => setAppearanceOpen(false)}
          anchorRef={appearanceBtnRef}
        />
      )}
    </>
  )
}
