import { LogOut, Trash2 } from 'lucide-react'

interface GroupDangerSectionProps {
  memberCount: number
  isAdmin: boolean
  isClosed: boolean
  isLastAdminWithOthers: boolean
  leaving: boolean
  deleting: boolean
  onLeave: () => void
  onDeleteGroup: () => void
}

export default function GroupDangerSection({
  memberCount,
  isAdmin,
  isClosed,
  isLastAdminWithOthers,
  leaving,
  deleting,
  onLeave,
  onDeleteGroup,
}: GroupDangerSectionProps) {
  if (isClosed) return null

  return (
    <section className="group-details-section group-danger-zone">
      {isLastAdminWithOthers && (
        <p className="group-section-copy">
          Assign another admin before leaving, or delete this group permanently as admin.
        </p>
      )}

      <div className="group-danger-actions">
        {memberCount > 1 && (
          <button
            type="button"
            className="btn btn-small group-leave-btn"
            disabled={isLastAdminWithOthers || leaving || deleting}
            onClick={onLeave}
          >
            <LogOut size={14} strokeWidth={2.7} aria-hidden="true" />
            {leaving ? 'Leaving…' : 'Leave group'}
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            className="btn btn-small btn-primary"
            disabled={deleting || leaving}
            onClick={onDeleteGroup}
          >
            <Trash2 size={14} strokeWidth={2.7} aria-hidden="true" />
            {deleting ? 'Deleting…' : 'Delete group'}
          </button>
        )}
      </div>
    </section>
  )
}
