import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, MicOff, Paperclip, Send, Smile, Square, Trash2, X } from 'lucide-react'
import { useSendMessage } from '../../features/chat/useMessages'
import { useSendVoiceMessage } from '../../features/chat/useSendVoiceMessage'
import { useVoiceRecorder } from '../../features/chat/useVoiceRecorder'
import { formatVoiceDuration } from '../../features/chat/voiceFormats'
import VoiceAudioControl from './VoiceAudioControl'
import {
  isVoiceNotesBlockedError,
  useVoiceNoteCapability,
  VOICE_NOTES_BLOCKED_MESSAGE,
} from '../../features/chat/useVoiceNotePolicies'

interface ChatComposerProps {
  conversationId: string
  userId: string
  compact?: boolean
  onAttach?: () => void
  onEmoji?: () => void
}

export default function ChatComposer({
  conversationId,
  userId,
  compact = false,
  onAttach,
  onEmoji,
}: ChatComposerProps) {
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const stopButtonRef = useRef<HTMLButtonElement>(null)
  const sendText = useSendMessage(conversationId, userId)
  const sendVoice = useSendVoiceMessage(conversationId, userId)
  const voice = useVoiceRecorder()
  const voicePermission = useVoiceNoteCapability(conversationId)

  useEffect(() => {
    if (voice.phase === 'recording') stopButtonRef.current?.focus({ preventScroll: true })
  }, [voice.phase])

  async function handleTextSend() {
    const body = text.trim()
    if (!body || sendText.isPending) return
    setSendError(null)
    try {
      await sendText.mutateAsync(body)
      setText('')
    } catch {
      setSendError('The message could not be sent. Please try again.')
    }
  }

  async function handleVoiceSend() {
    if (!voice.draft || sendVoice.isPending) return
    setSendError(null)
    try {
      await sendVoice.mutateAsync({ draft: voice.draft })
      voice.discard()
    } catch (error) {
      setSendError(isVoiceNotesBlockedError(error)
        ? `${VOICE_NOTES_BLOCKED_MESSAGE} Your recording was not uploaded.`
        : 'The voice note could not be sent. Your recording is still here to retry.')
    }
  }

  async function handleVoiceStart() {
    setSendError(null)
    const result = await voicePermission.refetch()
    if (result.isError) {
      setSendError('Could not verify whether this chat accepts voice notes. Try again.')
      return
    }
    if (!result.data?.allowed) {
      setSendError(VOICE_NOTES_BLOCKED_MESSAGE)
      return
    }
    await voice.start()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') void handleTextSend()
  }

  if (voice.phase === 'requesting' || voice.phase === 'recording') {
    return (
      <div
        className={`chat-composer voice-compose recording${compact ? ' compact' : ''}`}
        onKeyDown={event => { if (event.key === 'Escape') voice.discard() }}
      >
        <div className="voice-record-status" role="status" aria-live="polite">
          {voice.phase === 'requesting' ? (
            <><LoaderCircle className="voice-spinner" size={17} aria-hidden="true" /> CONNECTING MIC</>
          ) : (
            <><span className="voice-record-dot" aria-hidden="true" /> REC</>
          )}
        </div>
        <span className="voice-record-time" aria-label={`Recording duration ${formatVoiceDuration(voice.elapsedMs)}`}>
          {formatVoiceDuration(voice.elapsedMs)}
        </span>
        <button type="button" className="voice-text-btn" onClick={voice.discard} aria-label="Cancel voice recording">
          <X size={16} aria-hidden="true" /> <span>Cancel</span>
        </button>
        <button
          ref={stopButtonRef}
          type="button"
          className="voice-stop-btn"
          onClick={voice.stop}
          disabled={voice.phase !== 'recording'}
          aria-label="Stop voice recording"
          autoFocus={voice.phase === 'recording'}
        >
          <Square size={14} fill="currentColor" aria-hidden="true" /> <span>Stop</span>
        </button>
      </div>
    )
  }

  if (voice.draft) {
    return (
      <div className={`chat-composer voice-compose preview${compact ? ' compact' : ''}`}>
        <VoiceAudioControl
          durationMs={voice.draft.durationMs}
          src={voice.draft.previewUrl}
          label="voice note preview"
        />
        <button type="button" className="voice-delete-btn" onClick={voice.discard} aria-label="Discard voice note">
          <Trash2 size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="voice-send-btn"
          onClick={handleVoiceSend}
          disabled={sendVoice.isPending}
          aria-label={sendVoice.isPending ? 'Sending voice note' : 'Send voice note'}
        >
          {sendVoice.isPending
            ? <LoaderCircle className="voice-spinner" size={17} aria-hidden="true" />
            : <Send size={17} aria-hidden="true" />}
        </button>
        {sendError && <div className="voice-compose-error" role="alert">{sendError}</div>}
      </div>
    )
  }

  return (
    <div className={`chat-composer${compact ? ' compact' : ''}`}>
      <button type="button" className="chat-composer-icon" onClick={onAttach} aria-label="Attach file">
        <Paperclip size={compact ? 13 : 15} strokeWidth={2.5} aria-hidden="true" />
      </button>
      <input
        value={text}
        onChange={event => { setText(event.target.value); setSendError(null) }}
        onKeyDown={handleKeyDown}
        placeholder="Message…"
        aria-label="Message"
      />
      {!compact && (
        <button type="button" className="chat-composer-icon" onClick={onEmoji} aria-label="Choose emoji">
          <Smile size={15} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
      {text.trim() ? (
        <button
          type="button"
          className="chat-composer-send"
          onClick={handleTextSend}
          disabled={sendText.isPending}
          aria-label={sendText.isPending ? 'Sending message' : 'Send message'}
        >
          {sendText.isPending
            ? <LoaderCircle className="voice-spinner" size={17} aria-hidden="true" />
            : <Send size={17} strokeWidth={2.5} aria-hidden="true" />}
        </button>
      ) : (
        <button
          type="button"
          className="chat-composer-mic"
          onClick={() => void handleVoiceStart()}
          disabled={!voice.isSupported || voicePermission.isLoading || voicePermission.data?.allowed === false || voicePermission.isError}
          aria-label={voicePermission.data?.allowed === false
            ? 'Voice notes are disabled by the recipient'
            : voice.isSupported ? 'Record voice message' : 'Voice recording unavailable'}
          title={voicePermission.data?.allowed === false
            ? VOICE_NOTES_BLOCKED_MESSAGE
            : voice.isSupported ? 'Record voice message' : 'Voice recording is not supported by this browser'}
        >
          {voicePermission.isLoading
            ? <LoaderCircle className="voice-spinner" size={17} aria-hidden="true" />
            : <Mic size={17} strokeWidth={2.7} aria-hidden="true" />}
        </button>
      )}
      {(voicePermission.data?.allowed === false || voicePermission.isError) && !voice.error && !sendError && (
        <div className="voice-compose-notice" role="status">
          <MicOff size={14} aria-hidden="true" />
          <span>{voicePermission.data?.allowed === false
            ? VOICE_NOTES_BLOCKED_MESSAGE
            : 'Could not verify voice-note permission.'}</span>
          <button type="button" onClick={() => void voicePermission.refetch()}>Check again</button>
        </div>
      )}
      {(voice.error || sendError) && (
        <div className="voice-compose-error" role="alert">
          <span>{voice.error ?? sendError}</span>
          {voice.error && <button type="button" onClick={voice.clearError}>Dismiss</button>}
        </div>
      )}
    </div>
  )
}
