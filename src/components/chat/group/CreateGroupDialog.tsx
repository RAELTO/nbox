import { useMemo, useReducer, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, MessageSquare, Search, Users, X } from 'lucide-react'
import { useContacts } from '../../../features/contacts/useContacts'
import { useCreateGroupConversation } from '../../../features/chat/useGroupChatMutations'
import { useGetOrCreateConversation } from '../../../features/chat/useGetOrCreateConversation'
import { mapGroupChatError } from '../../../features/chat/conversationTypes'
import Avatar from '../../ui/Avatar'
import { useDialogAccessibility } from '../../ui/useDialogAccessibility'

interface CreateGroupDialogProps {
  userId: string
  anchorRef?: React.RefObject<HTMLElement | null>
  onClose: () => void
  onOpenedConversation: (conversationId: string) => void
}

interface DialogState {
  mode: 'group' | 'direct'
  groupName: string
  contactSearch: string
  selectedIds: string[]
  errorMessage: string | null
}

type DialogAction =
  | { type: 'setMode'; mode: 'group' | 'direct' }
  | { type: 'setName'; groupName: string }
  | { type: 'setSearch'; contactSearch: string }
  | { type: 'toggleMember'; memberId: string }
  | { type: 'setError'; errorMessage: string | null }

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'setMode':
      return { ...state, mode: action.mode, errorMessage: null }
    case 'setName':
      return { ...state, groupName: action.groupName, errorMessage: null }
    case 'setSearch':
      return { ...state, contactSearch: action.contactSearch }
    case 'toggleMember': {
      const exists = state.selectedIds.includes(action.memberId)
      if (exists) {
        return {
          ...state,
          selectedIds: state.selectedIds.filter(id => id !== action.memberId),
          errorMessage: null,
        }
      }
      if (state.selectedIds.length >= 49) {
        return {
          ...state,
          errorMessage: 'Groups can include up to 49 contacts (50 members including you).',
        }
      }
      return {
        ...state,
        selectedIds: [...state.selectedIds, action.memberId],
        errorMessage: null,
      }
    }
    case 'setError':
      return { ...state, errorMessage: action.errorMessage }
  }
}

export default function CreateGroupDialog({
  userId,
  anchorRef,
  onClose,
  onOpenedConversation,
}: CreateGroupDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLInputElement>(null)
  useDialogAccessibility({
    dialogRef: panelRef,
    onClose,
    initialFocusRef,
    restoreFocusRef: anchorRef,
  })

  const [state, dispatch] = useReducer(dialogReducer, {
    mode: 'group',
    groupName: '',
    contactSearch: '',
    selectedIds: [],
    errorMessage: null,
  })

  const { data: contacts = [], isLoading: loadingContacts } = useContacts(userId)
  const createGroup = useCreateGroupConversation(userId)
  const getOrCreateDirect = useGetOrCreateConversation(userId)

  const filteredContacts = useMemo(() => {
    const q = state.contactSearch.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      c =>
        c.other.display_name.toLowerCase().includes(q)
        || c.other.username.toLowerCase().includes(q),
    )
  }, [contacts, state.contactSearch])

  const trimmedName = state.groupName.trim()
  const isNameValid = trimmedName.length >= 1 && trimmedName.length <= 80
  const isMembersValid = state.selectedIds.length >= 2 && state.selectedIds.length <= 49
  const canSubmitGroup = isNameValid && isMembersValid && !createGroup.isPending

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmitGroup) return
    dispatch({ type: 'setError', errorMessage: null })
    try {
      const conversationId = await createGroup.mutateAsync({
        name: trimmedName,
        memberIds: state.selectedIds,
      })
      onOpenedConversation(conversationId)
    } catch (error) {
      dispatch({
        type: 'setError',
        errorMessage: mapGroupChatError(error, 'Could not create the group. Please check your selection.'),
      })
    }
  }

  async function handleOpenDirect(otherId: string) {
    dispatch({ type: 'setError', errorMessage: null })
    try {
      const conversationId = await getOrCreateDirect.mutateAsync(otherId)
      onOpenedConversation(conversationId)
    } catch {
      dispatch({ type: 'setError', errorMessage: 'Could not start a direct conversation.' })
    }
  }

  return createPortal(
    <div className="group-modal-overlay">
      <button
        type="button"
        className="group-modal-backdrop"
        aria-label="Close new chat dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="group-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-dialog-title"
        tabIndex={-1}
      >
        <div className="group-modal-head">
          <h2 id="new-chat-dialog-title">New chat</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close new chat dialog"
          >
            <X size={18} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        <div className="group-mode-switch" role="tablist" aria-label="Chat type">
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === 'group'}
            className={`group-mode-tab${state.mode === 'group' ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'setMode', mode: 'group' })}
          >
            <Users size={15} strokeWidth={2.7} aria-hidden="true" />
            Group chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === 'direct'}
            className={`group-mode-tab${state.mode === 'direct' ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'setMode', mode: 'direct' })}
          >
            <MessageSquare size={15} strokeWidth={2.7} aria-hidden="true" />
            Direct message
          </button>
        </div>

        {state.mode === 'group' ? (
          <form className="group-modal-form" onSubmit={event => void handleCreateGroup(event)}>
            <div className="group-modal-body">
              <div className="group-field">
                <div className="group-field-row">
                  <label className="field-label" htmlFor="group-name-input">Group name</label>
                  <span className="group-char-count">{trimmedName.length}/80</span>
                </div>
                <input
                  ref={initialFocusRef}
                  id="group-name-input"
                  value={state.groupName}
                  onChange={event => dispatch({ type: 'setName', groupName: event.target.value })}
                  maxLength={80}
                  placeholder="e.g. Weekend Skate Crew"
                />
              </div>

              <div className="group-field">
                <div className="group-field-row">
                  <label className="field-label" htmlFor="group-contact-search">Select accepted contacts</label>
                  <span className="group-selected-pill" role="status">
                    {state.selectedIds.length} selected (min 2)
                  </span>
                </div>
                <div className="group-search-input-wrap">
                  <Search size={15} strokeWidth={2.6} aria-hidden="true" />
                  <input
                    id="group-contact-search"
                    value={state.contactSearch}
                    onChange={event => dispatch({ type: 'setSearch', contactSearch: event.target.value })}
                    placeholder="Filter contacts by name or @username…"
                  />
                </div>
              </div>

              <div className="group-contact-picker" role="group" aria-label="Accepted contacts">
                {loadingContacts ? (
                  <div className="group-picker-empty">
                    <LoaderCircle className="voice-spinner" size={16} aria-hidden="true" /> Loading contacts…
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="group-picker-empty">
                    You need at least 2 accepted contacts to create a private group.
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="group-picker-empty">No contacts match "{state.contactSearch.trim()}".</div>
                ) : (
                  filteredContacts.map(contact => {
                    const checked = state.selectedIds.includes(contact.other.id)
                    return (
                      <label key={contact.other.id} className={`group-contact-option${checked ? ' checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => dispatch({ type: 'toggleMember', memberId: contact.other.id })}
                        />
                        <Avatar name={contact.other.display_name} src={contact.other.avatar_url} size="sm" />
                        <span className="group-contact-copy">
                          <strong>{contact.other.display_name}</strong>
                          <small>@{contact.other.username}</small>
                        </span>
                      </label>
                    )
                  })
                )}
              </div>

              {state.errorMessage && (
                <div className="voice-policy-error" role="alert">
                  {state.errorMessage}
                </div>
              )}
            </div>

            <div className="group-modal-foot">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmitGroup}
              >
                {createGroup.isPending ? 'Creating…' : 'Create group'}
              </button>
            </div>
          </form>
        ) : (
          <div className="group-modal-body">
            <div className="group-field">
              <label className="field-label" htmlFor="direct-contact-search">Start a direct chat</label>
              <div className="group-search-input-wrap">
                <Search size={15} strokeWidth={2.6} aria-hidden="true" />
                <input
                  id="direct-contact-search"
                  value={state.contactSearch}
                  onChange={event => dispatch({ type: 'setSearch', contactSearch: event.target.value })}
                  placeholder="Search accepted contacts…"
                />
              </div>
            </div>

            <div className="group-contact-picker">
              {loadingContacts ? (
                <div className="group-picker-empty">
                  <LoaderCircle className="voice-spinner" size={16} aria-hidden="true" /> Loading contacts…
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="group-picker-empty">No contacts found.</div>
              ) : (
                filteredContacts.map(contact => (
                  <button
                    key={contact.other.id}
                    type="button"
                    className="group-direct-option"
                    disabled={getOrCreateDirect.isPending}
                    onClick={() => void handleOpenDirect(contact.other.id)}
                  >
                    <Avatar name={contact.other.display_name} src={contact.other.avatar_url} size="sm" />
                    <span className="group-contact-copy">
                      <strong>{contact.other.display_name}</strong>
                      <small>@{contact.other.username}</small>
                    </span>
                    <span className="group-direct-go">Chat</span>
                  </button>
                ))
              )}
            </div>

            {state.errorMessage && (
              <div className="voice-policy-error" role="alert">
                {state.errorMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
