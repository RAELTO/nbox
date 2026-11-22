import { UserPlus } from 'lucide-react'
import type { GroupMember } from '../../../features/chat/conversationTypes'
import type { ContactWithProfile } from '../../../features/contacts/useContacts'
import GroupMemberList from './GroupMemberList'

interface GroupMembersSectionProps {
  members: GroupMember[]
  currentUserId: string
  isAdmin: boolean
  isClosed: boolean
  isLoading: boolean
  addPending: boolean
  pendingUserId: string | null
  selectedNewMemberId: string
  addableContacts: ContactWithProfile[]
  onSelectNewMember: (id: string) => void
  onAddMember: () => void
  onToggleRole: (member: GroupMember) => void
  onRemoveMember: (member: GroupMember) => void
}

export default function GroupMembersSection({
  members,
  currentUserId,
  isAdmin,
  isClosed,
  isLoading,
  addPending,
  pendingUserId,
  selectedNewMemberId,
  addableContacts,
  onSelectNewMember,
  onAddMember,
  onToggleRole,
  onRemoveMember,
}: GroupMembersSectionProps) {
  return (
    <section className="group-details-section" aria-labelledby="group-members-heading">
      <div className="group-section-head">
        <h3 id="group-members-heading">Members ({members.length})</h3>
      </div>

      {isAdmin && !isClosed && (
        <div className="group-add-member-bar">
          <select
            aria-label="Select contact to add"
            value={selectedNewMemberId}
            disabled={members.length >= 50 || addableContacts.length === 0 || addPending}
            onChange={event => onSelectNewMember(event.target.value)}
          >
            <option value="">
              {members.length >= 50
                ? '50-member limit reached'
                : addableContacts.length === 0
                  ? 'No other accepted contacts to add'
                  : 'Select accepted contact to add…'}
            </option>
            {addableContacts.map(c => (
              <option key={c.other.id} value={c.other.id}>
                {c.other.display_name} (@{c.other.username})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-small"
            disabled={!selectedNewMemberId || members.length >= 50 || addPending}
            onClick={onAddMember}
          >
            <UserPlus size={14} strokeWidth={2.7} aria-hidden="true" /> Add
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="voice-policy-loading" role="status">
          Loading members…
        </div>
      ) : (
        <GroupMemberList
          members={members}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          isClosed={isClosed}
          pendingUserId={pendingUserId}
          onToggleRole={onToggleRole}
          onRemoveMember={onRemoveMember}
        />
      )}
    </section>
  )
}
