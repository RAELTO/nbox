import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, LoaderCircle, Pencil, Users, X } from 'lucide-react'
import {
  mapGroupChatError,
  type GroupConversationSummary,
  type GroupMember,
} from '../../../features/chat/conversationTypes'
import {
  useAddGroupMember,
  useDeleteGroup,
  useGroupMembers,
  useGroupVoiceState,
  useLeaveGroup,
  useRemoveGroupMember,
  useRenameGroup,
  useSetGroupMemberRole,
} from '../../../features/chat/useGroupChatMutations'
import { useContacts } from '../../../features/contacts/useContacts'
import { useConfirm } from '../../ui/ConfirmContext'
import { useToast } from '../../ui/Toast'
import { useDialogAccessibility } from '../../ui/useDialogAccessibility'
import { groupNameSchema } from '../../../lib/validation'
import GroupAvatar from './GroupAvatar'
import GroupDangerSection from './GroupDangerSection'
import GroupMembersSection from './GroupMembersSection'
import GroupVoiceAdminSection from './GroupVoiceAdminSection'
import PersonalVoicePreferenceSection from './PersonalVoicePreferenceSection'

interface GroupDetailsDialogProps {
  group: GroupConversationSummary
  userId: string
  anchorRef?: React.RefObject<HTMLElement | null>
  onClose: () => void
  onGroupExited: () => void
}

export default function GroupDetailsDialog({
  group,
  userId,
  anchorRef,
  onClose,
  onGroupExited,
}: GroupDetailsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const confirm = useConfirm()
  const toast = useToast()
  useDialogAccessibility({ dialogRef: panelRef, onClose, restoreFocusRef: anchorRef })

  const membersQuery = useGroupMembers(group.id, true)
  const voiceStateQuery = useGroupVoiceState(group.id, true)
  const contactsQuery = useContacts(group.my_role === 'admin' ? userId : undefined)

  const renameGroup = useRenameGroup(group.id, userId)
  const addMember = useAddGroupMember(group.id, userId)
  const removeMember = useRemoveGroupMember(group.id, userId)
  const setMemberRole = useSetGroupMemberRole(group.id, userId)
  const leaveGroup = useLeaveGroup(group.id, userId)
  const deleteGroup = useDeleteGroup(group.id, userId)

  const [editingName, setEditingName] = useState<string | null>(null)
  const [selectedNewMemberId, setSelectedNewMemberId] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const draftName = editingName ?? group.name
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const voiceState = voiceStateQuery.data
  const myRole = voiceState?.my_role ?? group.my_role
  const isAdmin = myRole === 'admin'
  const isClosed = (voiceState?.status ?? group.status) === 'closed'
  const adminCount = members.filter(m => m.role === 'admin').length
  const isLastAdminWithOthers = isAdmin && adminCount <= 1 && members.length > 1

  const addableContacts = useMemo(() => {
    const memberIds = new Set(members.map(m => m.user_id))
    return (contactsQuery.data ?? []).filter(c => !memberIds.has(c.other.id))
  }, [contactsQuery.data, members])

  async function handleRename(event: React.FormEvent) {
    event.preventDefault()
    if (renameGroup.isPending) return
    const parsed = groupNameSchema.safeParse(draftName)
    if (!parsed.success) {
      setActionError('Group name must be between 1 and 80 characters without HTML brackets.')
      return
    }
    const trimmed = parsed.data
    if (trimmed === group.name) return
    setActionError(null)
    try {
      await renameGroup.mutateAsync(trimmed)
      setEditingName(null)
      toast('Group name updated.')
    } catch (error) {
      setActionError(mapGroupChatError(error))
    }
  }

  async function handleAddMember() {
    if (!selectedNewMemberId || addMember.isPending) return
    setActionError(null)
    try {
      await addMember.mutateAsync(selectedNewMemberId)
      setSelectedNewMemberId('')
      toast('Member added to group.')
    } catch (error) {
      setActionError(mapGroupChatError(error))
    }
  }

  async function handleToggleRole(member: GroupMember) {
    const nextRole = member.role === 'admin' ? 'member' : 'admin'
    if (nextRole === 'member') {
      const ok = await confirm({
        title: `Demote ${member.display_name}?`,
        message: `${member.display_name} will lose admin permissions in ${group.name}.`,
        confirmLabel: 'Remove admin role',
        danger: true,
      })
      if (!ok) return
    }
    setActionError(null)
    setPendingUserId(member.user_id)
    try {
      await setMemberRole.mutateAsync({ targetUserId: member.user_id, role: nextRole })
      toast(
        nextRole === 'admin'
          ? `${member.display_name} is now a group admin.`
          : `${member.display_name} is now a regular member.`,
      )
    } catch (error) {
      setActionError(mapGroupChatError(error))
    } finally {
      setPendingUserId(null)
    }
  }

  async function handleRemoveMember(member: GroupMember) {
    const ok = await confirm({
      title: `Remove ${member.display_name}?`,
      message: `${member.display_name} will immediately lose access to ${group.name}.`,
      confirmLabel: 'Remove member',
      danger: true,
    })
    if (!ok) return
    setActionError(null)
    setPendingUserId(member.user_id)
    try {
      await removeMember.mutateAsync(member.user_id)
      toast(`${member.display_name} was removed.`)
    } catch (error) {
      setActionError(mapGroupChatError(error))
    } finally {
      setPendingUserId(null)
    }
  }

  async function handleLeaveGroup() {
    const ok = await confirm({
      title: `Leave ${group.name}?`,
      message: 'You will stop receiving messages from this group immediately.',
      confirmLabel: 'Leave group',
      danger: true,
    })
    if (!ok) return
    setActionError(null)
    try {
      await leaveGroup.mutateAsync()
      toast(`You left ${group.name}.`)
      onGroupExited()
    } catch (error) {
      setActionError(mapGroupChatError(error))
    }
  }

  async function handleDeleteGroup() {
    const ok = await confirm({
      title: `Delete ${group.name}?`,
      message: `Deleting ${group.name} permanently ends this group and removes access for all members.`,
      confirmLabel: 'Delete group',
      danger: true,
    })
    if (!ok) return
    setActionError(null)
    try {
      await deleteGroup.mutateAsync()
      toast(`${group.name} has been deleted.`)
      onGroupExited()
    } catch (error) {
      setActionError(mapGroupChatError(error))
    }
  }

  return createPortal(
    <div className="group-modal-overlay">
      <button
        type="button"
        className="group-modal-backdrop"
        aria-label="Close group details"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="group-modal-panel group-details-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-details-title"
        tabIndex={-1}
      >
        <div className="group-modal-head">
          <button
            type="button"
            className="group-details-mobile-back"
            onClick={onClose}
            aria-label="Back to thread"
          >
            <ArrowLeft size={17} strokeWidth={2.8} aria-hidden="true" />
            <span>Back</span>
          </button>
          <h2 id="group-details-title">Group details</h2>
          <button
            type="button"
            className="modal-close-btn group-details-desktop-close"
            onClick={onClose}
            aria-label="Close group details"
          >
            <X size={18} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        <div className="group-modal-body group-details-scroll">
          <div className="group-details-hero">
            <GroupAvatar name={group.name} size={52} />
            <div className="group-details-hero-copy">
              <strong>{group.name}</strong>
              <div className="group-details-badges">
                <span className="group-meta-chip">
                  <Users size={11} strokeWidth={2.8} aria-hidden="true" /> {members.length || group.member_count}/50
                </span>
                <span className="group-meta-chip">
                  {isAdmin ? 'YOUR ROLE: ADMIN' : 'YOUR ROLE: MEMBER'}
                </span>
                {isClosed && <span className="group-meta-chip danger">CLOSED</span>}
              </div>
            </div>
          </div>

          {actionError && <div className="voice-policy-error" role="alert">{actionError}</div>}

          {isAdmin && !isClosed && (
            <form className="group-details-section" onSubmit={event => void handleRename(event)}>
              <label className="field-label" htmlFor="rename-group-input">
                <Pencil size={13} strokeWidth={2.7} aria-hidden="true" /> Rename group
              </label>
              <div className="group-inline-row">
                <input
                  id="rename-group-input"
                  value={draftName}
                  maxLength={80}
                  onChange={event => setEditingName(event.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-small btn-primary"
                  disabled={!draftName.trim() || draftName.trim() === group.name || renameGroup.isPending}
                >
                  <Check size={14} strokeWidth={2.8} aria-hidden="true" /> Save
                </button>
              </div>
            </form>
          )}

          {voiceStateQuery.isLoading ? (
            <div className="voice-policy-loading" role="status">
              <LoaderCircle className="voice-spinner" size={16} aria-hidden="true" /> Loading voice controls…
            </div>
          ) : voiceState ? (
            <>
              <PersonalVoicePreferenceSection
                conversationId={group.id}
                userId={userId}
                personalMode={voiceState.personal_mode}
                globalEnabled={voiceState.global_enabled}
                effectiveCanReceive={voiceState.effective_can_receive}
              />

              {isAdmin && (
                <GroupVoiceAdminSection
                  conversationId={group.id}
                  userId={userId}
                  voiceNotesAllowed={voiceState.voice_notes_allowed}
                  isClosed={isClosed}
                />
              )}
            </>
          ) : null}

          <GroupMembersSection
            members={members}
            currentUserId={userId}
            isAdmin={isAdmin}
            isClosed={isClosed}
            isLoading={membersQuery.isLoading}
            addPending={addMember.isPending}
            pendingUserId={pendingUserId}
            selectedNewMemberId={selectedNewMemberId}
            addableContacts={addableContacts}
            onSelectNewMember={setSelectedNewMemberId}
            onAddMember={() => void handleAddMember()}
            onToggleRole={member => void handleToggleRole(member)}
            onRemoveMember={member => void handleRemoveMember(member)}
          />

          <GroupDangerSection
            memberCount={members.length}
            isAdmin={isAdmin}
            isClosed={isClosed}
            isLastAdminWithOthers={isLastAdminWithOthers}
            leaving={leaveGroup.isPending}
            deleting={deleteGroup.isPending}
            onLeave={() => void handleLeaveGroup()}
            onDeleteGroup={() => void handleDeleteGroup()}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
