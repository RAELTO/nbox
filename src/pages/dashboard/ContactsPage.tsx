import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Ban, MessageCircle, MoreHorizontal, UserMinus, UserPlus, UserCheck, UserX, X } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useGetOrCreateConversation } from '../../features/chat/useGetOrCreateConversation'
import { useOpenChat } from '../../features/chat/useOpenChat'
import { usePresenceMap } from '../../features/presence/usePresence'
import { useIncomingRequests, useOutgoingRequests } from '../../features/contacts/useContactRequests'
import { useContacts } from '../../features/contacts/useContacts'
import { useSuggestedContacts } from '../../features/contacts/useSuggestedContacts'
import { useFollowingIds, useToggleFollow } from '../../features/follows/useFollows'
import {
  useSendContactRequest,
  useCancelContactRequest,
  useRespondContactRequest,
  useRemoveContact,
} from '../../features/contacts/useContactMutations'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmContext'
import Avatar from '../../components/ui/Avatar'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import type { ContactRequestRow } from '../../features/contacts/useContactRequests'
import type { Profile } from '../../types/database'

type Tab = 'requests' | 'suggest' | 'all'

const AVATAR_COLORS = [
  'var(--accent-1)', 'var(--accent-3)', 'var(--accent-4)',
  'var(--accent-5)', 'var(--accent-2)',
]
function avatarColor(i: number) { return AVATAR_COLORS[i % AVATAR_COLORS.length] }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)  return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24)   return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ─── Incoming request card ────────────────────────────────────────────────────
function IncomingCard({ req, onAccept, onDecline }: {
  req: ContactRequestRow
  onAccept: (req: ContactRequestRow) => void
  onDecline: (req: ContactRequestRow) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', borderBottom: '2px solid var(--line)',
      background: 'var(--accent-2)', color: 'var(--on-accent-2)',
    }}>
      <Link to={`/profile/${req.requester.username}`} style={{ display: 'flex', textDecoration: 'none' }}>
        <Avatar name={req.requester.display_name} src={req.requester.avatar_url} size="md" />
      </Link>
      <Link
        to={`/profile/${req.requester.username}`}
        style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
      >
        <div style={{ fontWeight: 800, fontSize: 14 }}>{req.requester.display_name}</div>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', opacity: 0.85 }}>
          @{req.requester.username} · {timeAgo(req.created_at)}
        </div>
        <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
          wants to add you as a contact
        </div>
      </Link>
      <button type="button"
        className="contact-btn contact-btn-accept"
        style={{ width: 'auto', padding: '0 12px', gap: 5 }}
        onClick={() => onAccept(req)}
      >
        <UserCheck size={13} strokeWidth={3} /> Accept
      </button>
      <button type="button"
        className="contact-btn contact-btn-decline"
        style={{ width: 'auto', padding: '0 12px', gap: 5 }}
        onClick={() => onDecline(req)}
      >
        <UserX size={13} strokeWidth={3} /> Decline
      </button>
    </div>
  )
}

// ─── Outgoing request card ────────────────────────────────────────────────────
function OutgoingCard({ req, onCancel }: {
  req: ContactRequestRow
  onCancel: (req: ContactRequestRow) => void
}) {
  const label = req.status === 'accepted' ? '✓ Accepted'
    : req.status === 'declined' ? '✕ Declined'
    : 'Pending'
  const badgeColors = req.status === 'accepted'
    ? { background: 'var(--accent-4)', color: 'var(--on-accent-4)' }
    : req.status === 'declined'
      ? { background: 'var(--accent-1)', color: 'var(--on-accent-1)' }
      : { background: 'var(--bg-alt)', color: 'var(--ink)' }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', borderBottom: '2px solid var(--line)',
    }}>
      <Link to={`/profile/${req.addressee.username}`} style={{ display: 'flex', textDecoration: 'none' }}>
        <Avatar name={req.addressee.display_name} src={req.addressee.avatar_url} size="md" />
      </Link>
      <Link
        to={`/profile/${req.addressee.username}`}
        style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
      >
        <div style={{ fontWeight: 800, fontSize: 14 }}>{req.addressee.display_name}</div>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-dim)' }}>
          @{req.addressee.username} · {timeAgo(req.created_at)}
        </div>
      </Link>
      <div style={{
        padding: '3px 10px', border: '2px solid var(--line)',
        ...badgeColors, fontSize: 12, fontFamily: 'var(--font-mono)',
        fontWeight: 800, whiteSpace: 'nowrap',
      }}>
        {label}
      </div>
      {req.status === 'pending' && (
        <button type="button"
          className="btn btn-small"
          style={{ padding: '4px 8px' }}
          onClick={() => onCancel(req)}
          title="Cancel request"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

// ─── Suggestion card ──────────────────────────────────────────────────────────
function SuggestionCard({ profile, index, onAdd }: {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  index: number
  onAdd: (id: string) => void
}) {
  const [sent, setSent] = useState(false)
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <Link
        to={`/profile/${profile.username}`}
        style={{
          height: 100,
          background: avatarColor(index),
          backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.07) 14px 16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '3px solid var(--ink)',
          textDecoration: 'none',
        }}
      >
        <Avatar name={profile.display_name} src={profile.avatar_url} size="lg" />
      </Link>
      <div style={{ padding: '10px 12px' }}>
        <Link to={`/profile/${profile.username}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile.display_name}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-mute)', marginTop: 2 }}>
            @{profile.username}
          </div>
        </Link>
        <button type="button"
          className={`btn btn-small ${sent ? '' : 'btn-primary'}`}
          style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
          disabled={sent}
          onClick={() => { onAdd(profile.id); setSent(true) }}
        >
          {sent
            ? <><UserCheck size={13} strokeWidth={2.5} /> Request sent</>
            : <><UserPlus size={13} strokeWidth={2.5} /> Add contact</>
          }
        </button>
      </div>
    </div>
  )
}

function MobileSuggestionRow({ profile, index, sent, onAdd, onDismiss }: {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  index: number
  sent: boolean
  onAdd: (id: string) => void
  onDismiss: (id: string) => void
}) {
  return (
    <div className="contacts-mobile-suggestion-row">
      <Link to={`/profile/${profile.username}`} className="contacts-mobile-avatar-link">
        <Avatar name={profile.display_name} src={profile.avatar_url} size="lg" />
      </Link>
      <div className="contacts-mobile-suggestion-main">
        <Link to={`/profile/${profile.username}`} className="contacts-mobile-name">
          {profile.display_name}
        </Link>
        <div className="contacts-mobile-meta">@{profile.username}</div>
        <div className="contacts-mobile-actions">
          <button type="button"
            className={`btn btn-small ${sent ? '' : 'btn-primary'}`}
            disabled={sent}
            onClick={() => onAdd(profile.id)}
          >
            {sent ? <><UserCheck size={14} strokeWidth={2.5} /> Sent</> : <><UserPlus size={14} strokeWidth={2.5} /> Add</>}
          </button>
          <button type="button"
            className="btn btn-small"
            onClick={() => onDismiss(profile.id)}
          >
            Dismiss
          </button>
        </div>
      </div>
      <div className="contacts-mobile-color-chip" style={{ background: avatarColor(index) }} />
    </div>
  )
}

// ─── Contact card ─────────────────────────────────────────────────────────────
function ContactCard({ profile, index, userId, presence, isFollowing, followPending, onFollow, onRemove }: {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  index: number
  userId: string
  presence: { label: string; color: string } | undefined
  isFollowing: boolean
  followPending: boolean
  onFollow: (profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>, isFollowing: boolean) => void
  onRemove: (id: string, name?: string) => void
}) {
  const getOrCreate = useGetOrCreateConversation(userId)
  const openChat    = useOpenChat()

  async function handleMessage() {
    const convId = await getOrCreate.mutateAsync(profile.id)
    openChat({ conversationId: convId, otherId: profile.id, otherName: profile.display_name, otherUsername: profile.username, otherAvatar: profile.avatar_url })
  }

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <Link
        to={`/profile/${profile.username}`}
        style={{
          height: 80,
          background: avatarColor(index),
          backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.07) 14px 16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '3px solid var(--ink)',
          textDecoration: 'none',
        }}
      >
        <Avatar name={profile.display_name} src={profile.avatar_url} size="md" />
      </Link>
      <div style={{ padding: '10px 12px' }}>
        <Link to={`/profile/${profile.username}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile.display_name}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-mute)', marginTop: 2 }}>
            @{profile.username}
          </div>
        </Link>
        {presence?.label && (
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: presence.color, marginTop: 3, letterSpacing: '.04em' }}>
            {presence.label}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button type="button"
            className="btn btn-small btn-primary"
            style={{ flex: 1, justifyContent: 'center', gap: 4 }}
            onClick={handleMessage}
            disabled={getOrCreate.isPending}
          >
            <MessageCircle size={13} strokeWidth={2.5} /> Message
          </button>
          <button
            type="button"
            className={`btn btn-small${isFollowing ? ' contact-following' : ''}`}
            style={{ padding: '4px 8px' }}
            title={isFollowing ? `Unfollow ${profile.display_name}` : `Follow ${profile.display_name}`}
            aria-pressed={isFollowing}
            data-testid="contact-follow-button"
            disabled={followPending}
            onClick={() => onFollow(profile, isFollowing)}
          >
            {isFollowing
              ? <UserMinus size={13} strokeWidth={2.5} />
              : <UserPlus size={13} strokeWidth={2.5} />
            }
          </button>
          <button type="button"
            className="btn btn-small"
            style={{ padding: '4px 8px', color: 'var(--accent-1)' }}
            title="Remove contact"
            onClick={() => onRemove(profile.id, profile.display_name)}
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

function MobileContactRow({ profile, presence, onOpenMenu }: {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  presence: { label: string; color: string } | undefined
  onOpenMenu: () => void
}) {
  return (
    <div className="contacts-mobile-friend-row">
      <Link to={`/profile/${profile.username}`} className="contacts-mobile-avatar-link">
        <Avatar name={profile.display_name} src={profile.avatar_url} size="lg" />
      </Link>
      <Link to={`/profile/${profile.username}`} className="contacts-mobile-friend-copy">
        <span className="contacts-mobile-name">{profile.display_name}</span>
        <span className="contacts-mobile-meta">
          {presence?.label ? presence.label : `@${profile.username}`}
        </span>
      </Link>
      <button type="button" className="contacts-mobile-menu-btn" onClick={onOpenMenu} title="Options">
        <MoreHorizontal size={22} strokeWidth={3} />
      </button>
    </div>
  )
}

function ContactActionSheet({ profile, isFollowing, followPending, onClose, onMessage, onFollow, onBlock, onRemove }: {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  isFollowing: boolean
  followPending: boolean
  onClose: () => void
  onMessage: () => void
  onFollow: () => void
  onBlock: () => void
  onRemove: () => void
}) {
  return createPortal(
    <div className="contacts-action-sheet-overlay" onClick={onClose}>
      <div className="contacts-action-sheet" onClick={e => e.stopPropagation()}>
        <div className="contacts-action-handle" />
        <div className="contacts-action-head">
          <Avatar name={profile.display_name} src={profile.avatar_url} size="md" />
          <div>
            <div className="contacts-action-name">{profile.display_name}</div>
            <div className="contacts-action-meta">@{profile.username}</div>
          </div>
          <button type="button" className="contacts-action-close" onClick={onClose}>
            <X size={18} strokeWidth={3} />
          </button>
        </div>

        <button type="button" className="contacts-action-item" onClick={onMessage}>
          <MessageCircle size={21} strokeWidth={2.5} />
          <span>Send message to {profile.display_name}</span>
        </button>
        <button
          type="button"
          className="contacts-action-item"
          onClick={onFollow}
          disabled={followPending}
          aria-pressed={isFollowing}
          data-testid="contact-sheet-follow-button"
        >
          {isFollowing
            ? <UserMinus size={21} strokeWidth={2.5} />
            : <UserPlus size={21} strokeWidth={2.5} />
          }
          <span>{isFollowing ? 'Unfollow' : 'Follow'} {profile.display_name}</span>
          <small>{isFollowing ? 'Remove their drops from your Following feed.' : 'See their drops in your Following feed.'}</small>
        </button>
        <button type="button" className="contacts-action-item" onClick={onBlock}>
          <Ban size={21} strokeWidth={2.5} />
          <span>Block {profile.display_name}</span>
          <small>They will not be able to see or contact you.</small>
        </button>
        <button type="button" className="contacts-action-item danger" onClick={onRemove}>
          <UserMinus size={21} strokeWidth={2.5} />
          <span>Remove {profile.display_name} from your contacts</span>
          <small>Remove {profile.display_name} from your list.</small>
        </button>
      </div>
    </div>,
    document.body
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('suggest')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [sentSuggestions, setSentSuggestions] = useState<Set<string>>(new Set())
  const [selectedContact, setSelectedContact] = useState<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null>(null)

  const { data: incoming = [] }    = useIncomingRequests(user?.id)
  const { data: outgoing = [] }    = useOutgoingRequests(user?.id)
  const { data: contacts = [] }    = useContacts(user?.id)
  const { data: suggestions = [] } = useSuggestedContacts(user?.id)
  const { data: followingIds = [] } = useFollowingIds(user?.id)

  const sendRequest   = useSendContactRequest(user?.id ?? '')
  const cancelRequest = useCancelContactRequest(user?.id ?? '')
  const respond       = useRespondContactRequest(user?.id ?? '')
  const removeContact = useRemoveContact(user?.id ?? '')
  const toggleFollow  = useToggleFollow(user?.id)
  const presenceMap   = usePresenceMap(contacts.map(c => c.other.id))
  const mobileGetOrCreate = useGetOrCreateConversation(user?.id ?? '')
  const openChat = useOpenChat()

  const pendingIncoming = incoming.length
  const visibleSuggestions = suggestions.filter(p => !dismissed.has(p.id))

  const NAV: { id: Tab; label: string; badge?: number }[] = [
    { id: 'requests', label: 'Requests', badge: pendingIncoming },
    { id: 'suggest',  label: 'Suggestions' },
    { id: 'all',      label: `All · ${contacts.length}` },
  ]

  async function handleAccept(req: ContactRequestRow) {
    await respond.mutateAsync({ requestId: req.id, requesterId: req.requester_id, accept: true })
    toast(`✓ You are now connected with ${req.requester.display_name}`)
  }

  async function handleDecline(req: ContactRequestRow) {
    await respond.mutateAsync({ requestId: req.id, requesterId: req.requester_id, accept: false })
    toast(`Request from ${req.requester.display_name} declined`)
  }

  async function handleCancel(req: ContactRequestRow) {
    await cancelRequest.mutateAsync(req.id)
    toast('Request canceled')
  }

  async function handleAdd(addresseeId: string) {
    setSentSuggestions(s => new Set([...s, addresseeId]))
    await sendRequest.mutateAsync(addresseeId)
    toast('Request sent')
  }

  async function handleRemove(otherId: string, name?: string) {
    const ok = await confirm({
      title: 'Remove contact?',
      message: name ? `${name} will be removed from your contacts.` : 'This contact will be removed.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    await removeContact.mutateAsync(otherId)
    toast('Contact removed')
  }

  async function handleMobileMessage(profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>) {
    if (!user?.id) return
    const convId = await mobileGetOrCreate.mutateAsync(profile.id)
    openChat({ conversationId: convId, otherId: profile.id, otherName: profile.display_name, otherUsername: profile.username, otherAvatar: profile.avatar_url })
    setSelectedContact(null)
  }

  async function handleMobileRemove(profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>) {
    await handleRemove(profile.id, profile.display_name)
    setSelectedContact(null)
  }

  async function handleFollow(
    profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>,
    isFollowing: boolean,
    closeSheet = false,
  ) {
    try {
      const nextFollowing = await toggleFollow.mutateAsync({ profileId: profile.id, isFollowing })
      toast(nextFollowing ? `Following ${profile.display_name}.` : `Unfollowed ${profile.display_name}.`)
      if (closeSheet) setSelectedContact(null)
    } catch {
      toast('Could not update this follow.')
    }
  }

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      <div className="contacts-page-grid">
        {/* ── Nav lateral ── */}
        <div className="panel contacts-side-panel" style={{ padding: '12px 8px' }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 20,
            letterSpacing: '-0.02em', padding: '4px 8px 12px',
            borderBottom: '2px solid var(--ink)', marginBottom: 8,
          }}>
            CONTACTS
          </div>
          {NAV.map(n => (
            <button type="button"
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`side-link${tab === n.id ? ' active' : ''}`}
              style={{ width: '100%' }}
            >
              {n.label}
              {!!n.badge && n.badge > 0 && (
                <span className="badge" style={{ marginLeft: 'auto' }}>{n.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div>
          <div className="contacts-mobile-home">
            <div className="contacts-mobile-top">
              <h1>Contacts</h1>
            </div>
            <div className="contacts-mobile-pills">
              <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
                Requests
                {pendingIncoming > 0 && <span>{pendingIncoming}</span>}
              </button>
              <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
                Your contacts
              </button>
            </div>
          </div>

          {/* SOLICITUDES */}
          {tab === 'requests' && (
            <>
              {/* Received */}
              <div style={{ marginBottom: 20 }}>
                <h2 className="section-title" style={{ marginBottom: 12 }}>
                  ▸ Received
                </h2>
                {incoming.length === 0 ? (
                  <div className="panel contacts-empty-panel">
                    <UserPlus size={58} strokeWidth={1.8} />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>NO REQUESTS</div>
                    <div className="text-sm text-mute mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
                      When someone sends you a contact request, it will appear here.
                    </div>
                    <button type="button" className="btn btn-small btn-primary" onClick={() => setTab('suggest')}>
                      View suggestions
                    </button>
                  </div>
                ) : (
                  <div className="panel" style={{ padding: 0 }}>
                    {incoming.map(r => (
                      <IncomingCard key={r.id} req={r} onAccept={handleAccept} onDecline={handleDecline} />
                    ))}
                  </div>
                )}
              </div>

              {/* Sent */}
              {outgoing.length > 0 && (
                <div>
                  <h2 className="section-title" style={{ marginBottom: 12 }}>▸ Sent</h2>
                  <div className="panel" style={{ padding: 0 }}>
                    {outgoing.map(r => (
                      <OutgoingCard key={r.id} req={r} onCancel={handleCancel} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* SUGERENCIAS */}
          {tab === 'suggest' && (
            <>
              <h2 className="section-title" style={{ marginBottom: 16 }}>Suggestions for you</h2>
              {visibleSuggestions.length === 0 ? (
                <div className="panel" style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>NOTHING YET</div>
                  <div className="text-sm text-mute mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
                    Follow more users to see relevant suggestions
                  </div>
                </div>
              ) : (
                <>
                <div className="contacts-desktop-card-grid">
                  {visibleSuggestions.map((p, i) => (
                    <SuggestionCard key={p.id} profile={p} index={i} onAdd={handleAdd} />
                  ))}
                </div>
                <div className="contacts-mobile-list">
                  {visibleSuggestions.map((p, i) => (
                    <MobileSuggestionRow
                      key={p.id}
                      profile={p}
                      index={i}
                      sent={sentSuggestions.has(p.id)}
                      onAdd={handleAdd}
                      onDismiss={(id) => setDismissed(s => new Set([...s, id]))}
                    />
                  ))}
                </div>
                </>
              )}
            </>
          )}

          {/* TODOS */}
          {tab === 'all' && (
            <>
              <h2 className="section-title" style={{ marginBottom: 16 }}>▸ All your contacts</h2>
              {contacts.length === 0 ? (
                <div className="panel contacts-empty-panel">
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>NO CONTACTS YET</div>
                  <div className="text-sm text-mute mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
                    Add contacts from suggestions or from the feed
                  </div>
                </div>
              ) : (
                <>
                <div className="contacts-desktop-card-grid">
                  {contacts.map((c, i) => (
                    <ContactCard
                      key={c.user_a + c.user_b}
                      profile={c.other}
                      index={i}
                      userId={user!.id}
                      presence={presenceMap[c.other.id]}
                      isFollowing={followingIds.includes(c.other.id)}
                      followPending={toggleFollow.isPending}
                      onFollow={handleFollow}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
                <div className="contacts-mobile-list">
                  <div className="contacts-mobile-count">{contacts.length} contacts</div>
                  {contacts.map((c) => (
                    <MobileContactRow
                      key={c.user_a + c.user_b}
                      profile={c.other}
                      presence={presenceMap[c.other.id]}
                      onOpenMenu={() => setSelectedContact(c.other)}
                    />
                  ))}
                </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {selectedContact && (
        <ContactActionSheet
          profile={selectedContact}
          isFollowing={followingIds.includes(selectedContact.id)}
          followPending={toggleFollow.isPending}
          onClose={() => setSelectedContact(null)}
          onMessage={() => handleMobileMessage(selectedContact)}
          onFollow={() => handleFollow(selectedContact, followingIds.includes(selectedContact.id), true)}
          onBlock={() => { toast('Block profile coming soon'); setSelectedContact(null) }}
          onRemove={() => handleMobileRemove(selectedContact)}
        />
      )}
    </AppShell>
  )
}
