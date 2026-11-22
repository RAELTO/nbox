import type { MessageRow } from '../../features/chat/useMessages'
import SystemEventBubble from './SystemEventBubble'
import VoiceMessageBubble from './VoiceMessageBubble'
import VoiceMessagePlaceholder from './VoiceMessagePlaceholder'

interface ChatMessageBubbleProps {
  message: MessageRow
  isMine: boolean
  time: string
  sentLabel?: string
  compact?: boolean
  isGroup?: boolean
  voiceReceptionBlocked?: boolean
  onOpenVoiceSettings?: () => void
}

export default function ChatMessageBubble({
  message,
  isMine,
  time,
  sentLabel = ' ✓✓',
  compact = false,
  isGroup = false,
  voiceReceptionBlocked = false,
  onOpenVoiceSettings,
}: ChatMessageBubbleProps) {
  if (message.kind === 'system') {
    return <SystemEventBubble message={message} compact={compact} />
  }

  const voiceAttachment = message.attachments?.find(attachment => attachment.kind === 'voice')
  const shouldShowVoicePlaceholder =
    message.kind === 'voice' && (voiceReceptionBlocked || (isGroup && !voiceAttachment))

  return (
    <div
      className={`msg-bubble ${isMine ? 'me' : 'them'}${message.kind === 'voice' ? ' voice' : ''}${compact ? ' compact' : ''}`}
    >
      {isGroup && !isMine && message.sender?.display_name && (
        <div className="msg-sender-name">{message.sender.display_name}</div>
      )}
      {message.kind === 'voice' ? (
        shouldShowVoicePlaceholder ? (
          <VoiceMessagePlaceholder compact={compact} onOpenSettings={onOpenVoiceSettings} />
        ) : (
          <VoiceMessageBubble attachment={voiceAttachment} ttlSeconds={isGroup ? 60 : 5 * 60} />
        )
      ) : (
        <div className="msg-body">{message.body}</div>
      )}
      <div className="msg-time">{time}{isMine && sentLabel}</div>
    </div>
  )
}
