import { LoaderCircle, Mic, MicOff } from 'lucide-react'
import {
  useSetGlobalVoiceNotePolicy,
  type GlobalVoiceNotePolicy,
} from '../../features/chat/useVoiceNotePolicies'

export default function VoiceNoteGlobalSetting({ userId, enabled }: { userId: string; enabled: boolean }) {
  const updatePolicy = useSetGlobalVoiceNotePolicy(userId)
  const current = updatePolicy.isPending
    ? updatePolicy.variables
    : enabled ? 'allow' : 'block'

  async function select(next: GlobalVoiceNotePolicy) {
    if (current === next || updatePolicy.isPending) return
    await updatePolicy.mutateAsync(next).catch(() => undefined)
  }

  return (
    <section id="voice-note-settings" className="voice-global-setting" aria-labelledby="voice-global-title">
      <div className="voice-global-copy">
        <span className="voice-policy-kicker">CHAT PRIVACY</span>
        <h2 id="voice-global-title">Voice notes</h2>
        <p>Set your default for every chat. You can still make a different choice inside a specific conversation.</p>
      </div>

      <div className="voice-global-options" role="radiogroup" aria-label="Default voice-note preference">
          <button
            type="button"
            role="radio"
            aria-checked={current === 'allow'}
            className={current === 'allow' ? 'selected' : ''}
            disabled={updatePolicy.isPending}
            onClick={() => void select('allow')}
          >
            <Mic size={21} strokeWidth={2.7} aria-hidden="true" />
            <span><strong>Allow</strong><small>People can send voice notes by default.</small></span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={current === 'block'}
            className={current === 'block' ? 'selected' : ''}
            disabled={updatePolicy.isPending}
            onClick={() => void select('block')}
          >
            <MicOff size={21} strokeWidth={2.7} aria-hidden="true" />
            <span><strong>Block</strong><small>Voice notes stay off unless you allow a chat.</small></span>
          </button>
      </div>

      {updatePolicy.isPending && (
        <div className="voice-global-saving" role="status">
          <LoaderCircle className="voice-spinner" size={14} aria-hidden="true" /> Saving
        </div>
      )}
      {updatePolicy.isError && (
        <div className="voice-policy-error" role="alert">Could not save your preference. Try again.</div>
      )}
    </section>
  )
}
