import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import {
  mapSocialGroupError,
  type SocialGroupAccent,
  type SocialGroupJoinPolicy,
  type SocialGroupPostPolicy,
  type SocialGroupSummary,
  type SocialGroupVisibility,
  useDeleteSocialGroup,
  useUpdateSocialGroupSettings,
} from '../../features/groups/useSocialGroups'
import { socialGroupDescriptionSchema, socialGroupNameSchema } from '../../lib/validation'
import { useConfirm } from '../ui/ConfirmContext'
import { useToast } from '../ui/Toast'

interface GroupSettingsTabProps {
  group: SocialGroupSummary
  onDeleted: () => void
}

export default function GroupSettingsTab({ group, onDeleted }: GroupSettingsTabProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const updateSettings = useUpdateSocialGroupSettings(group.id, group.slug)
  const deleteGroup = useDeleteSocialGroup()

  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description)
  const [visibility, setVisibility] = useState<SocialGroupVisibility>(group.visibility)
  const [joinPolicy, setJoinPolicy] = useState<SocialGroupJoinPolicy>(group.join_policy)
  const [postPolicy, setPostPolicy] = useState<SocialGroupPostPolicy>(group.post_policy)
  const [accentColor, setAccentColor] = useState<SocialGroupAccent>(group.accent_color)

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const nameCheck = socialGroupNameSchema.safeParse(name)
    if (!nameCheck.success) {
      toast('Group name must be 2 to 80 characters without HTML brackets.')
      return
    }
    const descCheck = socialGroupDescriptionSchema.safeParse(description)
    if (!descCheck.success) {
      toast('Description must be 500 characters or fewer without HTML brackets.')
      return
    }

    try {
      await updateSettings.mutateAsync({
        name: nameCheck.data,
        description: descCheck.data,
        visibility,
        joinPolicy,
        postPolicy,
        accentColor,
      })
      toast('Community settings saved.')
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${group.name}?`,
      message: `All posts, memberships, and pending requests in ${group.name} will be permanently deleted.`,
      confirmLabel: 'Delete group',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteGroup.mutateAsync(group.id)
      toast(`${group.name} was deleted.`)
      onDeleted()
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  return (
    <form className="panel social-group-card social-group-stack" onSubmit={event => void handleSave(event)}>
      <div className="group-field">
        <label className="field-label" htmlFor="edit-sg-name">Group name</label>
        <input id="edit-sg-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
      </div>

      <div className="group-field">
        <label className="field-label" htmlFor="edit-sg-desc">Description</label>
        <textarea id="edit-sg-desc" rows={3} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} />
      </div>

      <div className="social-group-policy-grid">
        <div className="group-field">
          <label className="field-label" htmlFor="edit-sg-visibility">Visibility</label>
          <select id="edit-sg-visibility" value={visibility} onChange={event => setVisibility(event.target.value as SocialGroupVisibility)}>
            <option value="public">Public (open feed)</option>
            <option value="private">Private (members only)</option>
          </select>
        </div>

        <div className="group-field">
          <label className="field-label" htmlFor="edit-sg-join">Join policy</label>
          <select id="edit-sg-join" value={joinPolicy} onChange={event => setJoinPolicy(event.target.value as SocialGroupJoinPolicy)}>
            <option value="open">Auto-join (open)</option>
            <option value="approval">Require admin/mod approval</option>
          </select>
        </div>

        <div className="group-field">
          <label className="field-label" htmlFor="edit-sg-posts">Posting policy</label>
          <select id="edit-sg-posts" value={postPolicy} onChange={event => setPostPolicy(event.target.value as SocialGroupPostPolicy)}>
            <option value="members">All members can post</option>
            <option value="admins_only">Admins &amp; moderators only</option>
          </select>
        </div>

        <div className="group-field">
          <label className="field-label" htmlFor="edit-sg-color">Banner color</label>
          <select id="edit-sg-color" value={accentColor} onChange={event => setAccentColor(event.target.value as SocialGroupAccent)}>
            <option value="accent-3">Sky</option>
            <option value="accent-2">Sun</option>
            <option value="accent-1">Coral</option>
            <option value="accent-4">Mint</option>
            <option value="accent-5">Lilac</option>
          </select>
        </div>
      </div>

      <div className="social-group-settings-actions">
        <button type="submit" className="btn btn-primary btn-small" disabled={updateSettings.isPending}>
          <Check size={14} strokeWidth={2.8} aria-hidden="true" />
          {updateSettings.isPending ? 'Saving…' : 'Save settings'}
        </button>

        <button
          type="button"
          className="btn btn-small group-leave-btn"
          disabled={deleteGroup.isPending}
          onClick={() => void handleDelete()}
        >
          <Trash2 size={14} strokeWidth={2.7} aria-hidden="true" />
          {deleteGroup.isPending ? 'Deleting…' : 'Delete community'}
        </button>
      </div>
    </form>
  )
}
