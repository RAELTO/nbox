import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ConversationSummary } from '../../features/chat/conversationTypes'
import { useMessages } from '../../features/chat/useMessages'
import { useGroupVoiceState } from '../../features/chat/useGroupChatMutations'
import { usePresence } from '../../features/presence/usePresence'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ui/Toast'
import ChatComposer from './ChatComposer'
import ChatMessageBubble from './ChatMessageBubble'
import ConversationThreadHeader from './ConversationThreadHeader'
import VoiceNoteConversationSettings from './VoiceNoteConversationSettings'
import { lazy, Suspense } from 'react'

const GroupDetailsDialog = lazy(() => import('./group/GroupDetailsDialog'))

function msgTime(iso: string, compact: boolean) {
  return new Date(iso).toLocaleTimeString(compact ? 'en-US' : 'en', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'TODAY'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY'
  return d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()
}

interface ConversationThreadProps {
  conversation: ConversationSummary
  userId: string
  variant?: 'inbox' | 'floating'
  onBack?: () => void
  onMinimize?: () => void
  onClose?: () => void
  onRevoked?: () => void
}

export default function ConversationThread({
  conversation,
  userId,
  variant = 'inbox',
  onBack,
  onMinimize,
  onClose,
  onRevoked,
}: ConversationThreadProps) {
  const isGroup = conversation.type === 'group'
  const compact = variant === 'floating'
  const qc = useQueryClient()
  const toast = useToast()

  const [messageLimit, setMessageLimit] = useState(50)
  const { data: messages = [] } = useMessages(conversation.id, userId, messageLimit)
  const groupVoiceState = useGroupVoiceState(conversation.id, isGroup)
  const presence = usePresence(!isGroup ? conversation.other.id : '')

  const bottomRef = useRef<HTMLDivElement>(null)
  const voiceSettingsButtonRef = useRef<HTMLButtonElement>(null)
  const groupDetailsButtonRef = useRef<HTMLButtonElement>(null)
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false)
  const onRevokedRef = useRef(onRevoked)

  useEffect(() => {
    onRevokedRef.current = onRevoked
  }, [onRevoked])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (!isGroup || !userId) return

    function handleAccessEnded(reasonMessage: string) {
      setGroupDetailsOpen(false)
      setVoiceSettingsOpen(false)
      qc.removeQueries({ queryKey: ['messages', conversation.id] })
      qc.removeQueries({ queryKey: ['group-members', conversation.id] })
      qc.removeQueries({ queryKey: ['group-voice-state', conversation.id] })
      qc.removeQueries({ queryKey: ['voice-note-capability', conversation.id] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
      toast(reasonMessage)
      onRevokedRef.current?.()
    }

    const channel = supabase
      .channel(`group-access:${conversation.id}:${userId}:${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_participants',
        filter: `conversation_id=eq.${conversation.id}`,
      }, payload => {
        const nextRow = payload.new as { user_id?: string; deleted_at?: string | null } | null
        if (nextRow?.user_id === userId && nextRow.deleted_at) {
          handleAccessEnded('Your access to this group has ended.')
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversation.id}`,
      }, payload => {
        const nextConv = payload.new as { status?: string } | null
        if (nextConv?.status === 'closed') {
          handleAccessEnded('This group was closed.')
          return
        }
        qc.invalidateQueries({ queryKey: ['group-voice-state', conversation.id] })
        qc.invalidateQueries({ queryKey: ['voice-note-capability', conversation.id] })
        qc.invalidateQueries({ queryKey: ['conversations', userId] })
      })
      .subscribe()

    return () => {
      void channel.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [conversation.id, isGroup, qc, toast, userId])

  const effectiveGroupAllowed = isGroup
    ? (groupVoiceState.data?.voice_notes_allowed ?? conversation.voice_notes_allowed)
    : true
  const groupPolicyVersion = isGroup
    ? (groupVoiceState.data?.voice_policy_version ?? conversation.voice_policy_version)
    : undefined
  const isGroupClosed = isGroup
    && ((groupVoiceState.data?.status ?? conversation.status) === 'closed')

  const voiceReceptionBlocked = isGroup
    ? groupVoiceState.isLoading || groupVoiceState.data?.effective_can_receive !== true
    : false

  const bodyContent = (
    <>
      <ConversationThreadHeader
        conversation={conversation}
        compact={compact}
        presence={presence}
        voiceSettingsOpen={voiceSettingsOpen}
        groupDetailsOpen={groupDetailsOpen}
        voiceSettingsButtonRef={voiceSettingsButtonRef}
        groupDetailsButtonRef={groupDetailsButtonRef}
        onBack={onBack}
        onMinimize={onMinimize}
        onClose={onClose}
        onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
        onOpenGroupDetails={() => setGroupDetailsOpen(true)}
        onStubAction={toast}
      />

      <div className={compact ? 'fc-msgs' : 'chat-msgs'}>
        {messages.length >= messageLimit && (
          <button
            type="button"
            className="chat-load-older-btn"
            onClick={() => setMessageLimit(limit => limit + 50)}
          >
            Load earlier messages
          </button>
        )}
        {messages.length === 0 && (
          <div className={compact ? 'chat-first-msg-compact' : 'chat-first-msg'}>
            {isGroup ? 'No messages in this group yet. Say hello!' : 'Be the first to write'}
          </div>
        )}
        {messages.map((m, index) => {
          const day = dayLabel(m.created_at)
          const prevDay = index > 0 ? dayLabel(messages[index - 1].created_at) : ''
          const showSep = !compact && day !== prevDay
          const isMe = m.sender_id === userId
          return (
            <div key={m.id} className="chat-msg-row">
              {showSep && <div className="chat-day-sep">{day}</div>}
              <ChatMessageBubble
                message={m}
                isMine={isMe}
                time={msgTime(m.created_at, compact)}
                sentLabel={compact ? ' sent' : ' ✓✓'}
                compact={compact}
                isGroup={isGroup}
                voiceReceptionBlocked={voiceReceptionBlocked}
                onOpenVoiceSettings={isGroup ? () => setGroupDetailsOpen(true) : () => setVoiceSettingsOpen(true)}
              />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <ChatComposer
        conversationId={conversation.id}
        userId={userId}
        conversationType={conversation.type}
        groupVoiceDisabled={isGroup && !effectiveGroupAllowed}
        groupPolicyVersion={groupPolicyVersion}
        disabledReason={isGroupClosed ? 'This group is closed.' : null}
        compact={compact}
        onAttach={() => toast('Attachments coming soon')}
      />

      {!isGroup && voiceSettingsOpen && (
        <VoiceNoteConversationSettings
          conversationId={conversation.id}
          userId={userId}
          otherName={conversation.other.display_name}
          onClose={() => setVoiceSettingsOpen(false)}
          anchorRef={voiceSettingsButtonRef}
        />
      )}
      {isGroup && groupDetailsOpen && (
        <Suspense fallback={null}>
          <GroupDetailsDialog
            group={{
              ...conversation,
              voice_notes_allowed: effectiveGroupAllowed,
              voice_policy_version: groupPolicyVersion ?? conversation.voice_policy_version,
              my_role: groupVoiceState.data?.my_role ?? conversation.my_role,
              status: isGroupClosed ? 'closed' : 'active',
            }}
            userId={userId}
            anchorRef={groupDetailsButtonRef}
            onClose={() => setGroupDetailsOpen(false)}
            onGroupExited={() => {
              setGroupDetailsOpen(false)
              onRevoked?.()
              onClose?.()
            }}
          />
        </Suspense>
      )}
    </>
  )

  if (compact) return bodyContent
  return <main className="chat-thread">{bodyContent}</main>
}
