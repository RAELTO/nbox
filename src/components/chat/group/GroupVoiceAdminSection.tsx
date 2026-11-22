import { Mic, MicOff, Shield } from 'lucide-react'
import { mapGroupChatError } from '../../../features/chat/conversationTypes'
import { useSetGroupVoicePublication } from '../../../features/chat/useGroupChatMutations'

interface GroupVoiceAdminSectionProps {
  conversationId: string
  userId: string
  voiceNotesAllowed: boolean
  isClosed: boolean
}

export default function GroupVoiceAdminSection({
  conversationId,
  userId,
  voiceNotesAllowed,
  isClosed,
}: GroupVoiceAdminSectionProps) {
  const setPublication = useSetGroupVoicePublication(conversationId, userId)

  async function handleToggle(nextAllowed: boolean) {
    if (isClosed || nextAllowed === voiceNotesAllowed || setPublication.isPending) return
    await setPublication.mutateAsync(nextAllowed).catch(() => undefined)
  }

  return (
    <section className="group-details-section group-admin-box" aria-labelledby="group-admin-voice-heading">
      <div className="group-section-head">
        <h3 id="group-admin-voice-heading">
          <Shield size={15} strokeWidth={2.7} aria-hidden="true" /> Group voice publication
        </h3>
        <span className="group-admin-pill">ADMIN CONTROL</span>
      </div>
      <p className="group-section-copy">
        Control whether members can record and send new voice notes in this group. Changes create a visible system event.
      </p>

      <div className="group-voice-admin-toggle" role="group" aria-label="Group voice publication policy">
        <button
          type="button"
          className={`btn btn-small${voiceNotesAllowed ? ' is-selected' : ''}`}
          aria-pressed={voiceNotesAllowed}
          disabled={isClosed || setPublication.isPending}
          onClick={() => void handleToggle(true)}
        >
          <Mic size={14} strokeWidth={2.7} aria-hidden="true" />
          Allow voice notes
        </button>
        <button
          type="button"
          className={`btn btn-small${!voiceNotesAllowed ? ' is-selected-danger' : ''}`}
          aria-pressed={!voiceNotesAllowed}
          disabled={isClosed || setPublication.isPending}
          onClick={() => void handleToggle(false)}
        >
          <MicOff size={14} strokeWidth={2.7} aria-hidden="true" />
          Disable voice notes
        </button>
      </div>

      {setPublication.isError && (
        <div className="voice-policy-error" role="alert">
          {mapGroupChatError(setPublication.error)}
        </div>
      )}
    </section>
  )
}
