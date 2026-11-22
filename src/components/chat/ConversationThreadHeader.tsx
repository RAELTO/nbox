import { Link } from 'react-router-dom'
import { ArrowLeft, AudioLines, Minus, Phone, Settings2, Users, Video, X } from 'lucide-react'
import type { ConversationSummary } from '../../features/chat/conversationTypes'
import type { PresenceInfo } from '../../features/presence/usePresence'
import Avatar from '../ui/Avatar'
import GroupAvatar from './group/GroupAvatar'

function SqAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div
      className="sq-avatar"
      style={{ width: size, height: size, background: 'var(--accent-3)', color: 'var(--on-accent-3)', fontSize: size * 0.38 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

interface ConversationThreadHeaderProps {
  conversation: ConversationSummary
  compact: boolean
  presence: PresenceInfo
  voiceSettingsOpen: boolean
  groupDetailsOpen: boolean
  voiceSettingsButtonRef: React.RefObject<HTMLButtonElement | null>
  groupDetailsButtonRef: React.RefObject<HTMLButtonElement | null>
  onBack?: () => void
  onMinimize?: () => void
  onClose?: () => void
  onOpenVoiceSettings: () => void
  onOpenGroupDetails: () => void
  onStubAction: (message: string) => void
}

export default function ConversationThreadHeader({
  conversation,
  compact,
  presence,
  voiceSettingsOpen,
  groupDetailsOpen,
  voiceSettingsButtonRef,
  groupDetailsButtonRef,
  onBack,
  onMinimize,
  onClose,
  onOpenVoiceSettings,
  onOpenGroupDetails,
  onStubAction,
}: ConversationThreadHeaderProps) {
  const isGroup = conversation.type === 'group'

  return (
    <div className={compact ? 'fc-head' : 'chat-thread-head'}>
      {onBack && !compact && (
        <button
          type="button"
          data-mobile-back
          aria-label="Back to inbox"
          className="chat-mobile-back-btn"
          onClick={onBack}
        >
          <ArrowLeft size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}

      {isGroup ? (
        <>
          <GroupAvatar name={conversation.name} size={compact ? 32 : 40} />
          <div className="chat-thread-meta">
            <div className="chat-thread-title">{conversation.name}</div>
            <div className="chat-thread-subtitle">
              <Users size={11} strokeWidth={2.6} aria-hidden="true" />
              <span>{conversation.member_count} members · {conversation.my_role === 'admin' ? 'Admin' : 'Member'}</span>
            </div>
          </div>
          <div className="chat-thread-actions">
            <button
              ref={groupDetailsButtonRef}
              type="button"
              className={compact ? 'fc-icon' : 'inbox-action-btn'}
              title="Group details"
              aria-label="Group details"
              aria-haspopup="dialog"
              aria-expanded={groupDetailsOpen}
              onClick={onOpenGroupDetails}
            >
              <Settings2 size={compact ? 13 : 16} strokeWidth={2.6} aria-hidden="true" />
            </button>
            {compact && onMinimize && (
              <button className="fc-icon" type="button" title="Minimize" aria-label="Minimize chat" onClick={onMinimize}>
                <Minus size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
            {compact && onClose && (
              <button className="fc-icon" type="button" title="Close" aria-label="Close chat" onClick={onClose}>
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <Link
            to={`/profile/${conversation.other.username}`}
            title={compact ? `View ${conversation.other.display_name}'s profile` : undefined}
            className="chat-thread-avatar-link"
          >
            {compact ? (
              <>
                <Avatar name={conversation.other.display_name} src={conversation.other.avatar_url} size="sm" />
                <span className="chat-thread-presence-dot" style={{ background: presence.dotColor }} />
              </>
            ) : (
              <SqAvatar name={conversation.other.display_name} size={40} />
            )}
          </Link>
          <Link to={`/profile/${conversation.other.username}`} className="chat-thread-meta-link">
            <div className={`chat-thread-direct-name${compact ? ' compact' : ''}`}>
              {conversation.other.display_name}
            </div>
            <div
              className={`chat-thread-direct-status${compact ? ' compact' : ''}`}
              style={{ color: presence.color }}
            >
              {presence.label || (presence.status === 'offline' ? (compact ? 'OFFLINE' : '● OFFLINE') : (compact ? 'ACTIVE' : '● ACTIVE'))}
            </div>
          </Link>
          <div className="chat-thread-actions">
            <button
              ref={voiceSettingsButtonRef}
              type="button"
              className={compact ? 'fc-icon' : 'inbox-action-btn'}
              title="Voice note settings"
              aria-label="Voice note settings"
              aria-haspopup="dialog"
              aria-expanded={voiceSettingsOpen}
              onClick={onOpenVoiceSettings}
            >
              <AudioLines size={compact ? 13 : 16} strokeWidth={2.7} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={compact ? 'fc-icon fc-call' : 'inbox-action-btn'}
              title="Call"
              aria-label="Call"
              onClick={() => onStubAction('Calls coming soon')}
            >
              <Phone size={compact ? 13 : 15} strokeWidth={2.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={compact ? 'fc-icon fc-video' : 'inbox-action-btn'}
              title="Video"
              aria-label="Video"
              onClick={() => onStubAction('Video coming soon')}
            >
              <Video size={compact ? 13 : 15} strokeWidth={2.5} aria-hidden="true" />
            </button>
            {compact && onMinimize && (
              <button className="fc-icon" type="button" title="Minimize" aria-label="Minimize chat" onClick={onMinimize}>
                <Minus size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
            {compact && onClose && (
              <button className="fc-icon" type="button" title="Close" aria-label="Close chat" onClick={onClose}>
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
