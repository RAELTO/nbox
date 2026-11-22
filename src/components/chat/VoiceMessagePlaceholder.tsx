import { MicOff } from 'lucide-react'

interface VoiceMessagePlaceholderProps {
  compact?: boolean
  onOpenSettings?: () => void
}

export default function VoiceMessagePlaceholder({
  compact = false,
  onOpenSettings,
}: VoiceMessagePlaceholderProps) {
  return (
    <div
      className={`voice-message-placeholder${compact ? ' compact' : ''}`}
      role="group"
      aria-label="Voice note hidden by your personal reception setting"
    >
      <span className="voice-placeholder-icon" aria-hidden="true">
        <MicOff size={compact ? 14 : 16} strokeWidth={2.7} />
      </span>
      <span className="voice-placeholder-copy">
        <strong>Voice note hidden</strong>
        <small>Blocked by your setting. Audio was not downloaded.</small>
      </span>
      {onOpenSettings && (
        <button
          type="button"
          className="voice-placeholder-btn"
          onClick={onOpenSettings}
        >
          Settings
        </button>
      )}
    </div>
  )
}
