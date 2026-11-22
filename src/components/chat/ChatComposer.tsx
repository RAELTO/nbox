import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Lock, Mic, MicOff, Paperclip, Send, Smile } from 'lucide-react'
import { mapGroupChatError, type ConversationKind } from '../../features/chat/conversationTypes'
import { useSendMessage } from '../../features/chat/useMessages'
import { useSendVoiceMessage } from '../../features/chat/useSendVoiceMessage'
import { useVoiceRecorder } from '../../features/chat/useVoiceRecorder'
import EmojiPickerPopover from './EmojiPickerPopover'
import VoiceRecordingBar from './VoiceRecordingBar'
import {
  GROUP_VOICE_DISABLED_MESSAGE,
  isVoiceNotesBlockedError,
  useVoiceNoteCapability,
  VOICE_NOTES_BLOCKED_MESSAGE,
} from '../../features/chat/useVoiceNotePolicies'

interface ChatComposerProps {
  conversationId: string
  userId: string
  conversationType?: ConversationKind
  groupVoiceDisabled?: boolean
  groupPolicyVersion?: number
  disabledReason?: string | null
  compact?: boolean
  onAttach?: () => void
}

export default function ChatComposer({
  conversationId,
  userId,
  conversationType = 'direct',
  groupVoiceDisabled = false,
  groupPolicyVersion,
  disabledReason = null,
  compact = false,
  onAttach,
}: ChatComposerProps) {
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [isPreparingVoice, setIsPreparingVoice] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const voiceStartPendingRef = useRef(false)
  const voiceStartAttemptRef = useRef(0)
  const sendText = useSendMessage(conversationId, userId, conversationType)
  const sendVoice = useSendVoiceMessage(conversationId, userId, conversationType)
  const voice = useVoiceRecorder()
  const voicePermission = useVoiceNoteCapability(conversationId)

  useEffect(() => () => {
    voiceStartAttemptRef.current += 1
    voiceStartPendingRef.current = false
  }, [])

  const closeEmojiPicker = useCallback((restoreFocus: boolean) => {
    setEmojiPickerOpen(false)
    if (restoreFocus) requestAnimationFrame(() => emojiButtonRef.current?.focus({ preventScroll: true }))
  }, [])

  if (disabledReason) {
    return (
      <div className={`chat-composer chat-composer-closed${compact ? ' compact' : ''}`} role="status">
        <Lock size={15} strokeWidth={2.6} aria-hidden="true" />
        <span>{disabledReason}</span>
      </div>
    )
  }

  const isGroup = conversationType === 'group'
  const blockedByPolicy =
    (isGroup && groupVoiceDisabled)
    || voicePermission.data?.allowed === false
  const blockedNotice = isGroup && (groupVoiceDisabled || voicePermission.data?.reason === 'group_voice_disabled')
    ? GROUP_VOICE_DISABLED_MESSAGE
    : VOICE_NOTES_BLOCKED_MESSAGE

  function handleEmojiSelect(emoji: string) {
    const input = inputRef.current
    const selectionStart = input?.selectionStart ?? text.length
    const selectionEnd = input?.selectionEnd ?? selectionStart
    const nextText = `${text.slice(0, selectionStart)}${emoji}${text.slice(selectionEnd)}`
    const nextCaret = selectionStart + emoji.length

    setText(nextText)
    setSendError(null)
    setEmojiPickerOpen(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  async function handleTextSend() {
    const body = text.trim()
    if (!body || sendText.isPending) return
    setSendError(null)
    try {
      await sendText.mutateAsync(body)
      setText('')
    } catch (error) {
      setSendError(
        isGroup
          ? mapGroupChatError(error, 'The message could not be sent. Please try again.')
          : 'The message could not be sent. Please try again.',
      )
    }
  }

  async function handleVoiceSend() {
    if (!voice.draft || sendVoice.isPending) return
    setSendError(null)
    try {
      await sendVoice.mutateAsync({
        draft: voice.draft,
        expectedPolicyVersion: voicePermission.data?.policyVersion ?? groupPolicyVersion,
      })
      voice.discard()
    } catch (error) {
      if (isVoiceNotesBlockedError(error)) {
        const message = isGroup
          ? mapGroupChatError(error, GROUP_VOICE_DISABLED_MESSAGE)
          : VOICE_NOTES_BLOCKED_MESSAGE
        setSendError(`${message} Your recording was not uploaded.`)
      } else {
        setSendError(
          isGroup
            ? mapGroupChatError(error, 'The voice note could not be sent. Your recording is still here to retry.')
            : 'The voice note could not be sent. Your recording is still here to retry.',
        )
      }
    }
  }

  async function handleVoiceStart() {
    if (voiceStartPendingRef.current) return
    voiceStartPendingRef.current = true
    const attempt = ++voiceStartAttemptRef.current
    setIsPreparingVoice(true)
    setSendError(null)
    try {
      const result = await voicePermission.refetch()
      if (attempt !== voiceStartAttemptRef.current) return
      if (result.isError) {
        setSendError('Could not verify whether this chat accepts voice notes. Try again.')
        return
      }
      if (!result.data?.allowed || (isGroup && groupVoiceDisabled)) {
        setSendError(
          isGroup && (result.data?.reason === 'group_voice_disabled' || groupVoiceDisabled)
            ? GROUP_VOICE_DISABLED_MESSAGE
            : VOICE_NOTES_BLOCKED_MESSAGE,
        )
        return
      }
      await voice.start()
    } finally {
      if (attempt === voiceStartAttemptRef.current) {
        voiceStartPendingRef.current = false
        setIsPreparingVoice(false)
      }
    }
  }

  if (voice.phase === 'requesting' || voice.phase === 'recording' || voice.draft) {
    return (
      <VoiceRecordingBar
        phase={voice.phase}
        elapsedMs={voice.elapsedMs}
        draft={voice.draft}
        compact={compact}
        isSending={sendVoice.isPending}
        sendError={sendError}
        onStop={voice.stop}
        onDiscard={voice.discard}
        onSend={() => void handleVoiceSend()}
      />
    )
  }

  return (
    <div className={`chat-composer${compact ? ' compact' : ''}`}>
      <button type="button" className="chat-composer-icon" onClick={onAttach} aria-label="Attach file">
        <Paperclip size={compact ? 13 : 15} strokeWidth={2.5} aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        value={text}
        onChange={event => { setText(event.target.value); setSendError(null) }}
        onKeyDown={event => { if (event.key === 'Enter') void handleTextSend() }}
        placeholder="Message…"
        aria-label="Message"
      />
      <button
        ref={emojiButtonRef}
        type="button"
        className="chat-composer-icon chat-composer-emoji"
        onClick={() => {
          inputRef.current?.blur()
          setEmojiPickerOpen(open => !open)
        }}
        aria-label="Choose emoji"
        aria-haspopup="dialog"
        aria-expanded={emojiPickerOpen}
      >
        <Smile size={compact ? 14 : 15} strokeWidth={2.5} aria-hidden="true" />
      </button>
      {text.trim() ? (
        <button
          type="button"
          className="chat-composer-send"
          onClick={() => void handleTextSend()}
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
          disabled={
            !voice.isSupported
            || isPreparingVoice
            || voicePermission.isFetching
            || blockedByPolicy
            || voicePermission.isError
          }
          aria-label={
            blockedByPolicy
              ? isGroup
                ? 'Voice notes are disabled in this group'
                : 'Voice notes are disabled by the recipient'
              : voice.isSupported
                ? 'Record voice message'
                : 'Voice recording unavailable on this device'
          }
          title={
            blockedByPolicy
              ? blockedNotice
              : voice.isSupported
                ? 'Record voice message'
                : 'Voice recording is not supported by this browser'
          }
        >
          {isPreparingVoice || voicePermission.isFetching
            ? <LoaderCircle className="voice-spinner" size={17} aria-hidden="true" />
            : <Mic size={17} strokeWidth={2.7} aria-hidden="true" />}
        </button>
      )}
      {(blockedByPolicy || voicePermission.isError || (!compact && !voice.isSupported)) && !voice.error && !sendError && (
        <div className="voice-compose-notice" role="status">
          <MicOff size={14} aria-hidden="true" />
          <span>
            {blockedByPolicy
              ? blockedNotice
              : !voice.isSupported
                ? 'Voice recording is unavailable on this browser. Text messages still work.'
                : 'Could not verify voice-note permission.'}
          </span>
          {voicePermission.isError && (
            <button type="button" onClick={() => void voicePermission.refetch()}>Check again</button>
          )}
        </div>
      )}
      {(voice.error || sendError) && (
        <div className="voice-compose-error" role="alert">
          <span>{voice.error ?? sendError}</span>
          {voice.error && <button type="button" onClick={voice.clearError}>Dismiss</button>}
        </div>
      )}
      {emojiPickerOpen && (
        <EmojiPickerPopover
          anchorRef={emojiButtonRef}
          onSelect={handleEmojiSelect}
          onClose={closeEmojiPicker}
        />
      )}
    </div>
  )
}
