import { Lock, LogOut } from 'lucide-react'

interface GroupDangerSectionProps {
  memberCount: number
  isClosed: boolean
  isLastAdminWithOthers: boolean
  canCloseGroup: boolean
  leaving: boolean
  closing: boolean
  onLeave: () => void
  onCloseGroup: () => void
}

export default function GroupDangerSection({
  memberCount,
  isClosed,
  isLastAdminWithOthers,
  canCloseGroup,
  leaving,
  closing,
  onLeave,
  onCloseGroup,
}: GroupDangerSectionProps) {
  if (isClosed) return null

  return (
    <section className="group-details-section group-danger-zone">
      {isLastAdminWithOthers && (
        <p className="group-section-copy">
          Assign another admin before leaving so the group is never left without an administrator.
        </p>
      )}

      <div className="group-danger-actions">
        {memberCount > 1 && (
          <button
            type="button"
            className="btn btn-small group-leave-btn"
            disabled={isLastAdminWithOthers || leaving}
            onClick={onLeave}
          >
            <LogOut size={14} strokeWidth={2.7} aria-hidden="true" />
            {leaving ? 'Leaving…' : 'Leave group'}
          </button>
        )}

        {canCloseGroup && (
          <button
            type="button"
            className="btn btn-small btn-primary"
            disabled={closing}
            onClick={onCloseGroup}
          >
            <Lock size={14} strokeWidth={2.7} aria-hidden="true" />
            {closing ? 'Closing…' : 'Close group'}
          </button>
        )}
      </div>
    </section>
  )
}
