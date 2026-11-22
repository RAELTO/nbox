import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, CheckCheck, UserCheck, UserX } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import {
  useNotifications, useMarkAllRead, useMarkOneRead, getNotifText,
  type NotifKind, type NotificationRow,
} from '../../features/notifications/useNotifications'
import { useRespondContactRequest } from '../../features/contacts/useContactMutations'
import { useToast } from '../../components/ui/Toast'
import Avatar from '../../components/ui/Avatar'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'

type FilterKey = 'all' | 'unread' | NotifKind

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',             label: 'All'       },
  { key: 'unread',          label: 'Unread'    },
  { key: 'contact_request', label: 'Contacts'  },
  { key: 'reaction',        label: 'Reactions' },
  { key: 'vote',            label: 'Votes'     },
  { key: 'comment',         label: 'Comments'  },
  { key: 'follow',          label: 'Followers' },
  { key: 'share',           label: 'Shares'    },
]

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function NotifItem({ n, onAccept, onDecline, onMarkRead, markingId }: {
  n: NotificationRow
  onAccept?: (n: NotificationRow) => void
  onDecline?: (n: NotificationRow) => void
  onMarkRead?: (id: string) => void
  markingId?: string | null
}) {
  const isContactReq = n.kind === 'contact_request'
  const isContactAcc = n.kind === 'contact_accepted'
  const isUnread = !n.read_at

  return (
    <div className={`notif-row${isUnread ? ' unread' : ''}`}>
      {n.actor ? (
        <Link to={`/profile/${n.actor.username}`} className="notif-row-avatar-link">
          <Avatar name={n.actor.display_name} src={n.actor.avatar_url} size="md" />
        </Link>
      ) : (
        <div className="notif-row-fallback-avatar" aria-hidden="true">
          <Bell size={18} strokeWidth={2.5} />
        </div>
      )}

      <div className="notif-row-main">
        <div className="notif-row-text">
          {n.actor && (
            <Link to={`/profile/${n.actor.username}`} className="notif-row-actor">
              {n.actor.display_name}
            </Link>
          )}
          {n.actor && ' '}
          {n.box_id ? (
            <Link
              to={`/box/${n.box_id}`}
              className="notif-row-target"
              onClick={() => { if (isUnread && onMarkRead) onMarkRead(n.id) }}
            >
              {getNotifText(n)}
            </Link>
          ) : (
            getNotifText(n)
          )}
        </div>
        <div className="notif-row-time">{timeAgo(n.created_at)}</div>
      </div>

      <div className="notif-row-actions">
        {isContactReq && onAccept && onDecline && (
          <div className="notif-contact-actions">
            <button type="button" className="contact-btn contact-btn-accept notif-contact-btn" onClick={() => onAccept(n)}>
              <UserCheck size={13} strokeWidth={3} aria-hidden="true" /> Accept
            </button>
            <button type="button" className="contact-btn contact-btn-decline notif-contact-btn" onClick={() => onDecline(n)}>
              <UserX size={13} strokeWidth={3} aria-hidden="true" /> Decline
            </button>
          </div>
        )}

        {isContactAcc && (
          <div className="notif-new-badge">NEW CONTACT</div>
        )}

        {isUnread && onMarkRead && (
          <button
            type="button"
            className="notif-mark-one-btn"
            aria-label="Mark read"
            title="Mark read"
            disabled={markingId === n.id}
            onClick={() => onMarkRead(n.id)}
          >
            <Check size={14} strokeWidth={3} aria-hidden="true" />
            <span>Mark read</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [markingId, setMarkingId] = useState<string | null>(null)

  const { data: notifications = [] } = useNotifications(user?.id)
  const markAllRead = useMarkAllRead(user?.id)
  const markOneRead = useMarkOneRead(user?.id)
  const respond = useRespondContactRequest(user?.id ?? '')

  async function handleAccept(n: NotificationRow) {
    if (!n.contact_request_id || !n.actor_id) return
    await respond.mutateAsync({ requestId: n.contact_request_id, requesterId: n.actor_id, accept: true })
    if (!n.read_at) await markOneRead.mutateAsync(n.id).catch(() => {})
    toast(`${n.actor?.display_name ?? 'User'} is now your contact`)
  }

  async function handleDecline(n: NotificationRow) {
    if (!n.contact_request_id || !n.actor_id) return
    await respond.mutateAsync({ requestId: n.contact_request_id, requesterId: n.actor_id, accept: false })
    if (!n.read_at) await markOneRead.mutateAsync(n.id).catch(() => {})
    toast(`Request from ${n.actor?.display_name ?? 'user'} declined`)
  }

  async function handleMarkOne(id: string) {
    setMarkingId(id)
    try {
      await markOneRead.mutateAsync(id)
    } catch {
      toast('Could not mark notification as read.')
    } finally {
      setMarkingId(null)
    }
  }

  async function handleMarkAll() {
    try {
      await markAllRead.mutateAsync()
      toast('All notifications marked as read.')
    } catch {
      toast('Could not mark notifications as read.')
    }
  }

  const filtered = notifications.filter(n => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'unread') return !n.read_at
    if (activeFilter === 'contact_request') return n.kind === 'contact_request' || n.kind === 'contact_accepted'
    return n.kind === activeFilter
  })

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      <div className="notif-page-head">
        <h1>NBOX - NOTIFS</h1>
        <div className="notif-page-head-actions">
          {unreadCount > 0 && (
            <span className="notif-unread-pill" role="status">
              {unreadCount} unread
            </span>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              className="btn btn-small notif-mark-all-btn"
              disabled={markAllRead.isPending}
              onClick={() => void handleMarkAll()}
            >
              <CheckCheck size={14} strokeWidth={2.7} aria-hidden="true" />
              {markAllRead.isPending ? 'Updating…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      <div className="notif-filters-row" role="group" aria-label="Notification filters">
        {FILTERS.map(f => {
          const isActive = activeFilter === f.key
          return (
            <button
              type="button"
              key={f.key}
              aria-pressed={isActive}
              onClick={() => setActiveFilter(f.key)}
              className={`notif-filter-btn${isActive ? ' active' : ''}`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {filtered.length === 0 && (
          <div className="notif-empty-state">
            No notifications here
          </div>
        )}
        {filtered.map(n => (
          <NotifItem
            key={n.id}
            n={n}
            markingId={markingId}
            onMarkRead={id => void handleMarkOne(id)}
            onAccept={n.kind === 'contact_request' ? handleAccept : undefined}
            onDecline={n.kind === 'contact_request' ? handleDecline : undefined}
          />
        ))}
      </div>
    </AppShell>
  )
}
