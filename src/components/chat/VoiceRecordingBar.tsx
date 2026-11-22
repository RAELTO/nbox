import { useEffect, useRef } from 'react'
import { LoaderCircle, Send, Square, Trash2, X } from 'lucide-react'
import { formatVoiceDuration } from '../../features/chat/voiceFormats'
import type { VoiceDraft } from '../../features/chat/useVoiceRecorder'
import VoiceAudioControl from './VoiceAudioControl'

interface VoiceRecordingBarProps {
  phase: 'idle' | 'requesting' | 'recording' | 'preview' | 'error'
  elapsedMs: number
  draft: VoiceDraft | null
  compact: boolean
  isSending: boolean
  sendError: string | null
  onStop: () => void
  onDiscard: () => void
  onSend: () => void
}

export default function VoiceRecordingBar({
  phase,
  elapsedMs,
  draft,
  compact,
  isSending,
  sendError,
  onStop,
  onDiscard,
  onSend,
}: VoiceRecordingBarProps) {
  const stopButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (phase === 'recording') stopButtonRef.current?.focus({ preventScroll: true })
  }, [phase])

  useEffect(() => {
    if (phase !== 'requesting' && phase !== 'recording') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDiscard()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onDiscard, phase])

  if (phase === 'requesting' || phase === 'recording') {
    return (
      <div className={`chat-composer voice-compose recording${compact ? ' compact' : ''}`}>
        <div className="voice-record-status" role="status" aria-live="polite">
          {phase === 'requesting' ? (
            <><LoaderCircle className="voice-spinner" size={17} aria-hidden="true" /> CONNECTING MIC</>
          ) : (
            <><span className="voice-record-dot" aria-hidden="true" /> REC</>
          )}
        </div>
        <span className="voice-record-time" aria-label={`Recording duration ${formatVoiceDuration(elapsedMs)}`}>
          {formatVoiceDuration(elapsedMs)}
        </span>
        <button type="button" className="voice-text-btn" onClick={onDiscard} aria-label="Cancel voice recording">
          <X size={16} aria-hidden="true" /> <span>Cancel</span>
        </button>
        <button
          ref={stopButtonRef}
          type="button"
          className="voice-stop-btn"
          onClick={onStop}
          disabled={phase !== 'recording'}
          aria-label="Stop voice recording"
        >
          <Square size={14} fill="currentColor" aria-hidden="true" /> <span>Stop</span>
        </button>
      </div>
    )
  }

  if (!draft) return null

  return (
    <div className={`chat-composer voice-compose preview${compact ? ' compact' : ''}`}>
      <VoiceAudioControl
        durationMs={draft.durationMs}
        src={draft.previewUrl}
        label="voice note preview"
      />
      <button type="button" className="voice-delete-btn" onClick={onDiscard} aria-label="Discard voice note">
        <Trash2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="voice-send-btn"
        onClick={onSend}
        disabled={isSending}
        aria-label={isSending ? 'Sending voice note' : 'Send voice note'}
      >
        {isSending
          ? <LoaderCircle className="voice-spinner" size={17} aria-hidden="true" />
          : <Send size={17} aria-hidden="true" />}
      </button>
      {sendError && <div className="voice-compose-error" role="alert">{sendError}</div>}
    </div>
  )
}
