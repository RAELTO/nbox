import { createPortal } from 'react-dom'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { AudioLines, Check, LoaderCircle, Mic, MicOff, RotateCcw, X } from 'lucide-react'
import {
  useSetConversationVoiceNotePolicy,
  useVoiceNoteSettings,
  type ConversationVoiceNotePolicy,
} from '../../features/chat/useVoiceNotePolicies'
import { useDialogAccessibility } from '../ui/useDialogAccessibility'

interface VoiceNoteConversationSettingsProps {
  conversationId: string
  userId: string
  otherName: string
  onClose: () => void
  anchorRef?: React.RefObject<HTMLElement | null>
}

const OPTIONS: Array<{
  value: ConversationVoiceNotePolicy
  label: string
  description: string
  Icon: typeof Mic
}> = [
  {
    value: 'inherit',
    label: 'Use my default',
    description: 'Follow the setting saved in your profile.',
    Icon: RotateCcw,
  },
  {
    value: 'allow',
    label: 'Allow here',
    description: 'Receive voice notes in this chat.',
    Icon: Mic,
  },
  {
    value: 'block',
    label: 'Block here',
    description: 'Do not receive voice notes in this chat.',
    Icon: MicOff,
  },
]

export default function VoiceNoteConversationSettings({
  conversationId,
  userId,
  otherName,
  onClose,
  anchorRef,
}: VoiceNoteConversationSettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const settings = useVoiceNoteSettings(conversationId, userId)
  const setConversationPolicy = useSetConversationVoiceNotePolicy(conversationId, userId)
  useDialogAccessibility({ dialogRef: panelRef, onClose, restoreFocusRef: anchorRef })

  const current = settings.data?.conversationPolicy ?? 'inherit'
  const globalAllows = settings.data?.globalPolicy !== 'block'
  const effectivelyAllows = current === 'allow' || (current === 'inherit' && globalAllows)

  async function selectPolicy(policy: ConversationVoiceNotePolicy) {
    if (policy === current || setConversationPolicy.isPending) return
    await setConversationPolicy.mutateAsync(policy).catch(() => undefined)
  }

  return createPortal(
    <div className="voice-policy-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div
        ref={panelRef}
        className="voice-policy-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-policy-title"
        tabIndex={-1}
      >
        <div className="voice-policy-head">
          <span className="voice-policy-kicker"><AudioLines size={14} aria-hidden="true" /> CHAT AUDIO</span>
          <button type="button" onClick={onClose} aria-label="Close voice note settings">
            <X size={18} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        <div className="voice-policy-body">
          <div>
            <h2 id="voice-policy-title">Voice notes</h2>
            <p>Choose whether {otherName} can send voice notes to you in this chat.</p>
          </div>

          {settings.isLoading ? (
            <div className="voice-policy-loading" role="status">
              <LoaderCircle className="voice-spinner" size={18} aria-hidden="true" /> Loading settings
            </div>
          ) : settings.isError ? (
            <div className="voice-policy-error" role="alert">
              Could not load your voice-note settings.
              <button type="button" onClick={() => void settings.refetch()}>Try again</button>
            </div>
          ) : (
            <>
              <div className="voice-policy-options" role="radiogroup" aria-label="Voice notes in this chat">
                {OPTIONS.map(({ value, label, description, Icon }) => {
                  const selected = current === value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={selected ? 'selected' : ''}
                      disabled={setConversationPolicy.isPending}
                      onClick={() => void selectPolicy(value)}
                    >
                      <span className="voice-policy-option-icon"><Icon size={19} strokeWidth={2.7} aria-hidden="true" /></span>
                      <span className="voice-policy-option-copy">
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <span className="voice-policy-option-check" aria-hidden="true">
                        {selected && <Check size={16} strokeWidth={3.5} />}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className={`voice-policy-result ${effectivelyAllows ? 'allows' : 'blocks'}`} role="status">
                {effectivelyAllows ? <Mic size={17} aria-hidden="true" /> : <MicOff size={17} aria-hidden="true" />}
                <span>
                  <strong>{effectivelyAllows ? 'ON IN THIS CHAT' : 'OFF IN THIS CHAT'}</strong>
                  {current === 'inherit' && ` / Profile default is ${globalAllows ? 'on' : 'off'}`}
                </span>
              </div>
            </>
          )}

          {setConversationPolicy.isError && (
            <div className="voice-policy-error" role="alert">Could not save this setting. Try again.</div>
          )}

          <Link className="voice-policy-profile-link" to="/my-box#voice-note-settings" onClick={onClose}>
            Change the default for all chats
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}
