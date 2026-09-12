import type { MessageRow } from '../../features/chat/useMessages'
import VoiceMessageBubble from './VoiceMessageBubble'

interface ChatMessageBubbleProps {
  message: MessageRow
  isMine: boolean
  time: string
  sentLabel?: string
  compact?: boolean
}

export default function ChatMessageBubble({
  message,
  isMine,
  time,
  sentLabel = ' ✓✓',
  compact = false,
}: ChatMessageBubbleProps) {
  const voiceAttachment = message.attachments?.find(attachment => attachment.kind === 'voice')

  return (
    <div className={`msg-bubble ${isMine ? 'me' : 'them'}${message.kind === 'voice' ? ' voice' : ''}${compact ? ' compact' : ''}`}>
      {message.kind === 'voice'
        ? <VoiceMessageBubble attachment={voiceAttachment} />
        : <div className="msg-body">{message.body}</div>}
      <div className="msg-time">{time}{isMine && sentLabel}</div>
    </div>
  )
}
