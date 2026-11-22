import { useId, useReducer, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Globe, Lock, ShieldCheck, Users, X } from 'lucide-react'
import {
  mapSocialGroupError,
  type SocialGroupAccent,
  type SocialGroupJoinPolicy,
  type SocialGroupPostPolicy,
  type SocialGroupVisibility,
  useCreateSocialGroup,
} from '../../features/groups/useSocialGroups'
import { socialGroupDescriptionSchema, socialGroupNameSchema } from '../../lib/validation'
import { useToast } from '../ui/Toast'
import { useDialogAccessibility } from '../ui/useDialogAccessibility'

const ACCENTS: Array<{ value: SocialGroupAccent; label: string; cssVar: string }> = [
  { value: 'accent-3', label: 'Sky', cssVar: 'var(--accent-3)' },
  { value: 'accent-2', label: 'Sun', cssVar: 'var(--accent-2)' },
  { value: 'accent-1', label: 'Coral', cssVar: 'var(--accent-1)' },
  { value: 'accent-4', label: 'Mint', cssVar: 'var(--accent-4)' },
  { value: 'accent-5', label: 'Lilac', cssVar: 'var(--accent-5)' },
]

interface FormState {
  name: string
  description: string
  visibility: SocialGroupVisibility
  joinPolicy: SocialGroupJoinPolicy
  postPolicy: SocialGroupPostPolicy
  accentColor: SocialGroupAccent
  error: string | null
}

type Action =
  | { type: 'field'; key: 'name' | 'description'; value: string }
  | { type: 'visibility'; value: SocialGroupVisibility }
  | { type: 'joinPolicy'; value: SocialGroupJoinPolicy }
  | { type: 'postPolicy'; value: SocialGroupPostPolicy }
  | { type: 'accent'; value: SocialGroupAccent }
  | { type: 'error'; value: string | null }

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.key]: action.value, error: null }
    case 'visibility':
      return {
        ...state,
        visibility: action.value,
        joinPolicy: action.value === 'private' ? 'approval' : state.joinPolicy,
        error: null,
      }
    case 'joinPolicy':
      return { ...state, joinPolicy: action.value, error: null }
    case 'postPolicy':
      return { ...state, postPolicy: action.value, error: null }
    case 'accent':
      return { ...state, accentColor: action.value }
    case 'error':
      return { ...state, error: action.value }
  }
}

interface CreateSocialGroupModalProps {
  onClose: () => void
  onCreated: (slug: string) => void
}

export default function CreateSocialGroupModal({ onClose, onCreated }: CreateSocialGroupModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  useDialogAccessibility({ dialogRef: panelRef, onClose, initialFocusRef: nameRef })

  const toast = useToast()
  const createGroup = useCreateSocialGroup()
  const [state, dispatch] = useReducer(reducer, {
    name: '',
    description: '',
    visibility: 'public',
    joinPolicy: 'open',
    postPolicy: 'members',
    accentColor: 'accent-3',
    error: null,
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (createGroup.isPending) return
    const nameCheck = socialGroupNameSchema.safeParse(state.name)
    if (!nameCheck.success) {
      dispatch({ type: 'error', value: 'Group name must be 2 to 80 characters without HTML brackets.' })
      return
    }
    const descCheck = socialGroupDescriptionSchema.safeParse(state.description)
    if (!descCheck.success) {
      dispatch({ type: 'error', value: 'Description must be 500 characters or fewer without HTML brackets.' })
      return
    }

    try {
      const created = await createGroup.mutateAsync({
        name: nameCheck.data,
        description: descCheck.data,
        visibility: state.visibility,
        joinPolicy: state.joinPolicy,
        postPolicy: state.postPolicy,
        accentColor: state.accentColor,
      })
      toast(`Community "${nameCheck.data}" created.`)
      onCreated(created.slug)
    } catch (error) {
      dispatch({ type: 'error', value: mapSocialGroupError(error, 'Could not create this community group.') })
    }
  }

  return createPortal(
    <div className="group-modal-overlay">
      <button
        type="button"
        className="group-modal-backdrop"
        aria-label="Close create group dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="group-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="group-modal-head">
          <h2 id={titleId}>Create community group</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close create group dialog">
            <X size={18} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        <form className="group-modal-form" onSubmit={event => void handleSubmit(event)}>
          <div className="group-modal-body">
            <div className="group-field">
              <div className="group-field-row">
                <label className="field-label" htmlFor="social-group-name">Group name</label>
                <span className="group-char-count">{state.name.trim().length}/80</span>
              </div>
              <input
                ref={nameRef}
                id="social-group-name"
                value={state.name}
                maxLength={80}
                onChange={event => dispatch({ type: 'field', key: 'name', value: event.target.value })}
                placeholder="e.g. Street Zine Makers"
              />
            </div>

            <div className="group-field">
              <label className="field-label" htmlFor="social-group-desc">Description</label>
              <textarea
                id="social-group-desc"
                rows={3}
                maxLength={500}
                value={state.description}
                onChange={event => dispatch({ type: 'field', key: 'description', value: event.target.value })}
                placeholder="What is this group about? Rules, topics, vibe…"
              />
            </div>

            <div className="social-group-policy-grid">
              <div className="group-field">
                <label className="field-label" htmlFor="social-group-visibility">
                  <Globe size={13} strokeWidth={2.6} aria-hidden="true" /> Visibility
                </label>
                <select
                  id="social-group-visibility"
                  value={state.visibility}
                  onChange={event => dispatch({ type: 'visibility', value: event.target.value as SocialGroupVisibility })}
                >
                  <option value="public">Public — anyone can read posts</option>
                  <option value="private">Private — only approved members</option>
                </select>
              </div>

              <div className="group-field">
                <label className="field-label" htmlFor="social-group-join">
                  <ShieldCheck size={13} strokeWidth={2.6} aria-hidden="true" /> Who can join
                </label>
                <select
                  id="social-group-join"
                  value={state.joinPolicy}
                  onChange={event => dispatch({ type: 'joinPolicy', value: event.target.value as SocialGroupJoinPolicy })}
                >
                  <option value="open">Instant — anyone joins right away</option>
                  <option value="approval">Approval required by admin/mod</option>
                </select>
              </div>

              <div className="group-field">
                <label className="field-label" htmlFor="social-group-posts">
                  <Users size={13} strokeWidth={2.6} aria-hidden="true" /> Who can post boxes
                </label>
                <select
                  id="social-group-posts"
                  value={state.postPolicy}
                  onChange={event => dispatch({ type: 'postPolicy', value: event.target.value as SocialGroupPostPolicy })}
                >
                  <option value="members">All active members</option>
                  <option value="admins_only">Admins &amp; moderators only</option>
                </select>
              </div>
            </div>

            <div className="group-field">
              <span className="field-label">Banner color</span>
              <div className="story-swatch-row" role="radiogroup" aria-label="Group accent color">
                {ACCENTS.map(swatch => (
                  <button
                    key={swatch.value}
                    type="button"
                    role="radio"
                    aria-checked={state.accentColor === swatch.value}
                    aria-label={swatch.label}
                    className={`story-swatch${state.accentColor === swatch.value ? ' active' : ''}`}
                    style={{ background: swatch.cssVar }}
                    onClick={() => dispatch({ type: 'accent', value: swatch.value })}
                  />
                ))}
              </div>
            </div>

            {state.error && (
              <div className="voice-policy-error" role="alert">
                <Lock size={14} strokeWidth={2.7} aria-hidden="true" /> {state.error}
              </div>
            )}
          </div>

          <div className="group-modal-foot">
            <button type="button" className="btn btn-small" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-small btn-primary" disabled={createGroup.isPending}>
              {createGroup.isPending ? 'Creating…' : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
