import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../features/auth/AuthContext'
import { useConversations, type ConversationSummary } from '../../features/chat/useConversations'
import { useFloatingChat } from '../../features/chat/FloatingChatContext'
import { useToast } from '../ui/Toast'

/**
 * Listens for conversation changes through Realtime.
 * When a new message arrives from another user, it opens the floating chat.
 */
export default function MessageNotifier() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: convs = [] } = useConversations(user?.id)
  const { chats, openChat } = useFloatingChat()
  const toast = useToast()
  const prevRef = useRef<ConversationSummary[]>([])
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`msg-notifier:${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, () => {
        qc.invalidateQueries({ queryKey: ['conversations', user.id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, qc])

  useEffect(() => {
    if (!user || convs.length === 0) return

    if (!initializedRef.current) {
      prevRef.current = convs
      initializedRef.current = true
      return
    }

    const prev = prevRef.current
    const prevMap = new Map(prev.map(c => [c.id, c]))

    for (const conv of convs) {
      const prevConv = prevMap.get(conv.id)

      const isNewMessage = !prevConv
        ? conv.has_unread
        : conv.last_message_at !== prevConv.last_message_at && conv.has_unread

      if (isNewMessage && conv.last_message_sender_id !== user.id) {
        const displayTitle = conv.type === 'group' ? conv.name : conv.other.display_name
        toast(
          conv.type === 'group'
            ? `New activity in ${displayTitle}`
            : `New message from ${displayTitle}`,
          4000,
        )
        if (window.innerWidth > 820) {
          const alreadyOpen = chats.some(c => c.conversationId === conv.id)
          if (!alreadyOpen) {
            if (conv.type === 'group') {
              openChat({
                conversationId: conv.id,
                type: 'group',
                title: conv.name,
                otherId: '',
                otherName: conv.name,
                otherUsername: '',
                otherAvatar: null,
              })
            } else {
              const { other } = conv
              openChat({
                conversationId: conv.id,
                type: 'direct',
                title: other.display_name,
                otherId: other.id,
                otherName: other.display_name,
                otherUsername: other.username,
                otherAvatar: other.avatar_url,
              })
            }
          }
        }
      }
    }

    prevRef.current = convs
  }, [convs, user]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
