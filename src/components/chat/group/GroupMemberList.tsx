import { Link } from 'react-router-dom'
import { Crown, ShieldCheck, ShieldOff, UserMinus } from 'lucide-react'
import type { GroupMember } from '../../../features/chat/conversationTypes'
import Avatar from '../../ui/Avatar'

interface GroupMemberListProps {
  members: GroupMember[]
  currentUserId: string
  isAdmin: boolean
  isClosed: boolean
  pendingUserId: string | null
  onToggleRole: (member: GroupMember) => void
  onRemoveMember: (member: GroupMember) => void
}

export default function GroupMemberList({
  members,
  currentUserId,
  isAdmin,
  isClosed,
  pendingUserId,
  onToggleRole,
  onRemoveMember,
}: GroupMemberListProps) {
  const adminCount = members.filter(m => m.role === 'admin').length

  return (
    <ul className="group-member-list" aria-label="Group members">
      {members.map(member => {
        const isSelf = member.user_id === currentUserId
        const isMemberAdmin = member.role === 'admin'
        const isSoleAdmin = isMemberAdmin && adminCount <= 1
        const isBusy = pendingUserId === member.user_id

        return (
          <li key={member.user_id} className="group-member-row">
            <Link
              to={`/profile/${member.username}`}
              className="group-member-identity"
            >
              <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
              <span className="group-member-copy">
                <strong>
                  {member.display_name}
                  {isSelf && <span className="group-self-tag">YOU</span>}
                </strong>
                <small>@{member.username}</small>
              </span>
            </Link>

            <div className="group-member-actions">
              {isMemberAdmin && (
                <span className="group-role-badge">
                  <Crown size={11} strokeWidth={2.8} aria-hidden="true" /> ADMIN
                </span>
              )}

              {isAdmin && !isClosed && (
                <>
                  <button
                    type="button"
                    className="group-member-action-btn"
                    disabled={isBusy || (isMemberAdmin && isSoleAdmin)}
                    title={
                      isMemberAdmin && isSoleAdmin
                        ? 'Assign another admin before removing the last admin role'
                        : isMemberAdmin
                          ? `Demote ${member.display_name}`
                          : `Make ${member.display_name} admin`
                    }
                    aria-label={
                      isMemberAdmin
                        ? `Remove admin role from ${member.display_name}`
                        : `Make ${member.display_name} group admin`
                    }
                    onClick={() => onToggleRole(member)}
                  >
                    {isMemberAdmin
                      ? <ShieldOff size={14} strokeWidth={2.6} aria-hidden="true" />
                      : <ShieldCheck size={14} strokeWidth={2.6} aria-hidden="true" />}
                  </button>

                  {!isSelf && (
                    <button
                      type="button"
                      className="group-member-action-btn danger"
                      disabled={isBusy || (isMemberAdmin && isSoleAdmin)}
                      title={
                        isMemberAdmin && isSoleAdmin
                          ? 'Cannot remove the last remaining admin'
                          : `Remove ${member.display_name}`
                      }
                      aria-label={`Remove ${member.display_name} from group`}
                      onClick={() => onRemoveMember(member)}
                    >
                      <UserMinus size={14} strokeWidth={2.6} aria-hidden="true" />
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
