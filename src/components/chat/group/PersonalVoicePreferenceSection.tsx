import { Check, Mic, MicOff, RotateCcw } from 'lucide-react'
import { mapGroupChatError, type VoiceReceptionMode } from '../../../features/chat/conversationTypes'
import { useSetGroupVoiceReception } from '../../../features/chat/useGroupChatMutations'

interface PersonalVoicePreferenceSectionProps {
  conversationId: string
  userId: string
  personalMode: VoiceReceptionMode
  globalEnabled: boolean
  effectiveCanReceive: boolean
}

const OPTIONS: Array<{
  value: VoiceReceptionMode
  label: string
  description: string
  Icon: typeof Mic
}> = [
  {
    value: 'inherit',
    label: 'Use my default',
    description: 'Follow your profile voice-note setting.',
    Icon: RotateCcw,
  },
  {
    value: 'allow',
    label: 'Allow here',
    description: 'Play voice notes in this group.',
    Icon: Mic,
  },
  {
    value: 'block',
    label: 'Block here',
    description: 'Show a placeholder and never download audio.',
    Icon: MicOff,
  },
]

export default function PersonalVoicePreferenceSection({
  conversationId,
  userId,
  personalMode,
  globalEnabled,
  effectiveCanReceive,
}: PersonalVoicePreferenceSectionProps) {
  const setReception = useSetGroupVoiceReception(conversationId, userId)

  async function handleSelect(mode: VoiceReceptionMode) {
    if (mode === personalMode || setReception.isPending) return
    await setReception.mutateAsync(mode).catch(() => undefined)
  }

  return (
    <section className="group-details-section" aria-labelledby="personal-voice-heading">
      <div className="group-section-head">
        <h3 id="personal-voice-heading">Your voice-note reception</h3>
        <span className="group-privacy-pill">PRIVATE TO YOU</span>
      </div>
      <p className="group-section-copy">
        Only affects your device. Other members cannot see this setting and can still send voice notes if allowed by an admin.
      </p>

      <div className="voice-policy-options" role="radiogroup" aria-label="Personal voice-note reception in this group">
        {OPTIONS.map(({ value, label, description, Icon }) => {
          const selected = personalMode === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? 'selected' : ''}
              disabled={setReception.isPending}
              onClick={() => void handleSelect(value)}
            >
              <span className="voice-policy-option-icon"><Icon size={17} strokeWidth={2.7} aria-hidden="true" /></span>
              <span className="voice-policy-option-copy">
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <span className="voice-policy-option-check" aria-hidden="true">
                {selected && <Check size={15} strokeWidth={3.5} />}
              </span>
            </button>
          )
        })}
      </div>

      <div className={`voice-policy-result ${effectiveCanReceive ? 'allows' : 'blocks'}`} role="status">
        {effectiveCanReceive ? <Mic size={16} aria-hidden="true" /> : <MicOff size={16} aria-hidden="true" />}
        <span>
          <strong>{effectiveCanReceive ? 'AUDIO PLAYABLE FOR YOU' : 'AUDIO HIDDEN FOR YOU'}</strong>
          {personalMode === 'inherit' && ` / Profile default is ${globalEnabled ? 'on' : 'off'}`}
        </span>
      </div>

      {setReception.isError && (
        <div className="voice-policy-error" role="alert">
          {mapGroupChatError(setReception.error, 'Could not save your voice reception preference.')}
        </div>
      )}
    </section>
  )
}
