import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Check, CheckCheck, UserCheck, UserX } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import {
  useNotifications, useMarkAllRead, useMarkOneRead, getNotifText,
  type NotificationRow,
} from '../../features/notifications/useNotifications'
import { useRespondContactRequest } from '../../features/contacts/useContactMutations'
import { useToast } from '../ui/Toast'
import Avatar from '../ui/Avatar'

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function NotifItem({ n, onAccept, onDecline, onMarkRead, onCloseDropdown }: {
  n: NotificationRow
  onAccept?: (n: NotificationRow) => void
  onDecline?: (n: NotificationRow) => void
  onMarkRead?: (id: string) => void
  onCloseDropdown: () => void
}) {
  const isContactReq = n.kind === 'contact_request'
  const isUnread = !n.read_at

  return (
    <div className={`notif-item${isUnread ? ' unread' : ''}`}>
      {n.actor ? (
        <Link to={`/profile/${n.actor.username}`} onClick={onCloseDropdown} style={{ display: 'flex', textDecoration: 'none' }}>
          <Avatar name={n.actor.display_name} src={n.actor.avatar_url} size="sm" />
        </Link>
      ) : (
        <div className="notif-item-avatar-placeholder" aria-hidden="true">
          <Bell size={15} strokeWidth={2.5} />
        </div>
      )}
      <div className="notif-item-body">
        <div className="notif-item-text">
          {n.actor && (
            <Link className="notif-item-actor-link" to={`/profile/${n.actor.username}`} onClick={onCloseDropdown}>
              {n.actor.display_name}
            </Link>
          )}
          {n.actor && ' '}
          {n.box_id ? (
            <Link
              to={`/box/${n.box_id}`}
              className="notif-item-box-link"
              onClick={() => {
                if (isUnread && onMarkRead) onMarkRead(n.id)
                onCloseDropdown()
              }}
            >
              {getNotifText(n)}
            </Link>
          ) : (
            getNotifText(n)
          )}
        </div>
        <div className="notif-item-time">{timeAgo(n.created_at)}</div>
      </div>
      <div className="notif-item-actions">
        {isContactReq && onAccept && onDecline && (
          <>
            <button type="button" className="contact-btn contact-btn-accept" onClick={() => onAccept(n)} title="Accept" aria-label="Accept contact request">
              <UserCheck size={12} strokeWidth={3} aria-hidden="true" />
            </button>
            <button type="button" className="contact-btn contact-btn-decline" onClick={() => onDecline(n)} title="Decline" aria-label="Decline contact request">
              <UserX size={12} strokeWidth={3} aria-hidden="true" />
            </button>
          </>
        )}
        {isUnread && onMarkRead && (
          <button
            type="button"
            className="notif-dropdown-mark-one"
            onClick={() => onMarkRead(n.id)}
            title="Mark read"
            aria-label="Mark notification as read"
          >
            <Check size={12} strokeWidth={3} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

export default function NotificationsDropdown({ anchorRef, onClose }: Props) {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { data: notifications = [] } = useNotifications(user?.id)
  const markAllRead = useMarkAllRead(user?.id)
  const markOneRead = useMarkOneRead(user?.id)
  const respond = useRespondContactRequest(user?.id ?? '')
  const modalRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 360 })

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      const dropW = Math.min(360, window.innerWidth - 16)
      let left = rect.right - dropW
      if (left < 8) left = 8
      setPosition({ top: rect.bottom + 6, left, width: dropW })
    }
  }, [anchorRef])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        modalRef.current && !modalRef.current.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) onCloseRef.current()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorRef])

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

  const preview = notifications.slice(0, 8)
  const hasUnread = notifications.some(n => !n.read_at)

  return createPortal(
    <div
      ref={modalRef}
      className="notif-dropdown"
      role="dialog"
      aria-label="Notifications"
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      <div className="notif-dropdown-header">
        <span className="notif-dropdown-title">Notifications</span>
        <div className="notif-dropdown-header-actions">
          {hasUnread && (
            <button
              type="button"
              className="notif-dropdown-mark-all"
              disabled={markAllRead.isPending}
              onClick={() => void markAllRead.mutateAsync().catch(() => toast('Could not mark notifications as read.'))}
            >
              <CheckCheck size={13} strokeWidth={2.7} aria-hidden="true" />
              Mark all read
            </button>
          )}
          <button type="button" className="notif-dropdown-view-all" onClick={() => { navigate('/notifications'); onClose() }}>
            View all
          </button>
        </div>
      </div>

      <div className="notif-dropdown-list">
        {preview.length === 0 && (
          <div className="notif-dropdown-empty">No notifications</div>
        )}
        {preview.map(n => (
          <NotifItem
            key={n.id}
            n={n}
            onCloseDropdown={onClose}
            onMarkRead={id => void markOneRead.mutateAsync(id).catch(() => {})}
            onAccept={n.kind === 'contact_request' ? handleAccept : undefined}
            onDecline={n.kind === 'contact_request' ? handleDecline : undefined}
          />
        ))}
      </div>

      <button
        type="button"
        className="notif-dropdown-footer"
        onClick={() => { navigate('/notifications'); onClose() }}
      >
        VIEW ALL NOTIFICATIONS
      </button>
    </div>,
    document.body,
  )
}
