import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Shield, ShieldCheck, UserCheck, UserMinus, UserPlus } from 'lucide-react'
import {
  mapSocialGroupError,
  type SocialGroupMemberRole,
  type SocialGroupMemberRow,
  type SocialGroupModAction,
  useInviteContactToSocialGroup,
  useModerateSocialGroupMember,
} from '../../features/groups/useSocialGroups'
import { useContacts } from '../../features/contacts/useContacts'
import Avatar from '../ui/Avatar'
import { useConfirm } from '../ui/ConfirmContext'
import { useToast } from '../ui/Toast'

interface GroupMembersTabProps {
  groupId: string
  slug: string
  groupName: string
  currentUserId: string
  myRole: SocialGroupMemberRole | null
  members: SocialGroupMemberRow[]
  isLoading: boolean
}

export default function GroupMembersTab({
  groupId,
  slug,
  groupName,
  currentUserId,
  myRole,
  members,
  isLoading,
}: GroupMembersTabProps) {
  const isAdmin = myRole === 'admin'
  const isMod = myRole === 'moderator' || isAdmin
  const confirm = useConfirm()
  const toast = useToast()
  const [selectedContactId, setSelectedContactId] = useState('')
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const contactsQuery = useContacts(isMod ? currentUserId : undefined)
  const inviteMember = useInviteContactToSocialGroup(groupId, slug)
  const moderateMember = useModerateSocialGroupMember(groupId, slug)

  const invitableContacts = useMemo(() => {
    const existingIds = new Set(members.map(m => m.user_id))
    return (contactsQuery.data ?? []).filter(c => !existingIds.has(c.other.id))
  }, [contactsQuery.data, members])

  const activeMembers = members.filter(m => m.status === 'active')
  const bannedMembers = members.filter(m => m.status === 'banned')

  async function handleInvite() {
    if (!selectedContactId || inviteMember.isPending) return
    try {
      await inviteMember.mutateAsync(selectedContactId)
      setSelectedContactId('')
      toast('Contact added to this community.')
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  async function handleAction(member: SocialGroupMemberRow, action: SocialGroupModAction, confirmCopy?: string) {
    if (confirmCopy) {
      const ok = await confirm({
        title: `${member.profile.display_name}`,
        message: confirmCopy,
        confirmLabel: 'Confirm',
        danger: action === 'remove' || action === 'ban',
      })
      if (!ok) return
    }
    setBusyUserId(member.user_id)
    try {
      await moderateMember.mutateAsync({ targetUserId: member.user_id, action })
      toast('Member permissions updated.')
    } catch (error) {
      toast(mapSocialGroupError(error))
    } finally {
      setBusyUserId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="panel social-group-panel-pad">Loading members…</div>
    )
  }

  return (
    <div className="social-group-stack">
      {isMod && (
        <section className="panel social-group-card">
          <div className="group-section-head">
            <h3><UserPlus size={16} strokeWidth={2.7} aria-hidden="true" /> Add accepted contact</h3>
          </div>
          <div className="group-add-member-bar">
            <select
              aria-label="Select contact to add"
              value={selectedContactId}
              onChange={event => setSelectedContactId(event.target.value)}
            >
              <option value="">
                {invitableContacts.length > 0 ? 'Choose a contact…' : 'All accepted contacts are already listed'}
              </option>
              {invitableContacts.map(c => (
                <option key={c.other.id} value={c.other.id}>
                  {c.other.display_name} (@{c.other.username})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-small btn-primary"
              disabled={!selectedContactId || inviteMember.isPending}
              onClick={() => void handleInvite()}
            >
              Add member
            </button>
          </div>
        </section>
      )}

      <section className="panel social-group-card">
        <div className="group-section-head">
          <h3>Active members ({activeMembers.length})</h3>
        </div>
        <ul className="group-member-list">
          {activeMembers.map(member => {
            const isSelf = member.user_id === currentUserId
            const canModTarget = isMod && !isSelf && (isAdmin || member.role === 'member')
            const isBusy = busyUserId === member.user_id
            return (
              <li key={member.user_id} className="group-member-row">
                <Link to={`/profile/${member.profile.username}`} className="group-member-identity">
                  <Avatar name={member.profile.display_name} src={member.profile.avatar_url} size="sm" />
                  <span className="group-member-copy">
                    <strong>
                      {member.profile.display_name}
                      {isSelf && <span className="group-self-tag">YOU</span>}
                    </strong>
                    <small>@{member.profile.username}</small>
                  </span>
                </Link>
                <div className="group-member-actions">
                  {member.role !== 'member' && (
                    <span className="group-role-badge">
                      {member.role === 'admin' ? <ShieldCheck size={11} /> : <Shield size={11} />}
                      {member.role.toUpperCase()}
                    </span>
                  )}
                  {isAdmin && !isSelf && (
                    <button
                      type="button"
                      className="group-member-action-btn"
                      disabled={isBusy}
                      title={member.role === 'moderator' ? 'Demote to member' : 'Make moderator'}
                      aria-label={member.role === 'moderator' ? `Demote ${member.profile.display_name}` : `Make ${member.profile.display_name} moderator`}
                      onClick={() => void handleAction(member, member.role === 'moderator' ? 'demote_member' : 'promote_moderator')}
                    >
                      <Shield size={14} strokeWidth={2.7} aria-hidden="true" />
                    </button>
                  )}
                  {isAdmin && !isSelf && member.role !== 'admin' && (
                    <button
                      type="button"
                      className="group-member-action-btn"
                      disabled={isBusy}
                      title="Make group admin"
                      aria-label={`Make ${member.profile.display_name} admin`}
                      onClick={() => void handleAction(member, 'promote_admin')}
                    >
                      <ShieldCheck size={14} strokeWidth={2.7} aria-hidden="true" />
                    </button>
                  )}
                  {canModTarget && (
                    <>
                      <button
                        type="button"
                        className="group-member-action-btn danger"
                        disabled={isBusy}
                        title="Remove from group"
                        aria-label={`Remove ${member.profile.display_name}`}
                        onClick={() => void handleAction(member, 'remove', `Remove ${member.profile.display_name} from ${groupName}?`)}
                      >
                        <UserMinus size={14} strokeWidth={2.7} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="group-member-action-btn danger"
                        disabled={isBusy}
                        title="Ban from group"
                        aria-label={`Ban ${member.profile.display_name}`}
                        onClick={() => void handleAction(member, 'ban', `Ban ${member.profile.display_name} from re-joining ${groupName}?`)}
                      >
                        <Ban size={14} strokeWidth={2.7} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {isMod && bannedMembers.length > 0 && (
        <section className="panel social-group-card">
          <div className="group-section-head">
            <h3>Banned accounts ({bannedMembers.length})</h3>
          </div>
          <ul className="group-member-list">
            {bannedMembers.map(member => (
              <li key={member.user_id} className="group-member-row">
                <div className="group-member-identity">
                  <Avatar name={member.profile.display_name} src={member.profile.avatar_url} size="sm" />
                  <span className="group-member-copy">
                    <strong>{member.profile.display_name}</strong>
                    <small>@{member.profile.username}</small>
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busyUserId === member.user_id}
                  onClick={() => void handleAction(member, 'unban')}
                >
                  <UserCheck size={13} strokeWidth={2.7} aria-hidden="true" /> Unban
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
