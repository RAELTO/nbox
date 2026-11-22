import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

export interface ConversationRow {
  id: string
  type: 'direct'
  user_a: string
  user_b: string
  last_message_at: string | null
  last_message_text: string | null
  last_message_sender_id: string | null
  created_at: string
  profile_a: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  profile_b: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  other: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
  my_last_read_at: string | null
  has_unread: boolean
}

export function useConversations(userId: string | undefined) {
  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: async () => {
      if (!userId) return []

      const [convRes, partRes] = await Promise.all([
        supabase
          .from('conversations')
          .select(`
            *,
            profile_a:profiles!conversations_user_a_fkey(id, username, display_name, avatar_url),
            profile_b:profiles!conversations_user_b_fkey(id, username, display_name, avatar_url)
          `)
          .or(`user_a.eq.${userId},user_b.eq.${userId}`)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
        supabase
          .from('conversation_participants')
          .select('conversation_id, last_read_at')
          .eq('user_id', userId),
      ])

      if (convRes.error) throw convRes.error
      if (partRes.error) throw partRes.error

      const conversationIds = (convRes.data ?? []).map(row => row.id)
      const { data: latestMessages, error: latestMessagesError } = conversationIds.length
        ? await supabase
          .from('messages')
          .select('conversation_id, sender_id, created_at')
          .in('conversation_id', conversationIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        : { data: [], error: null }
      if (latestMessagesError) throw latestMessagesError

      const lastMessageSenderMap = new Map<string, string>()
      for (const message of latestMessages ?? []) {
        if (message.sender_id && !lastMessageSenderMap.has(message.conversation_id)) {
          lastMessageSenderMap.set(message.conversation_id, message.sender_id)
        }
      }

      const readMap = new Map<string, string | null>(
        (partRes.data ?? []).map(p => [p.conversation_id, p.last_read_at])
      )

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (convRes.data ?? []).map((row: any) => {
        const myLastRead = readMap.get(row.id) ?? null
        const lastMessageSenderId = lastMessageSenderMap.get(row.id) ?? null
        const hasUnread = !!row.last_message_at
          && lastMessageSenderId !== userId
          && (!myLastRead || row.last_message_at > myLastRead)
        return {
          ...row,
          other:          row.user_a === userId ? row.profile_b : row.profile_a,
          my_last_read_at: myLastRead,
          last_message_sender_id: lastMessageSenderId,
          has_unread:     hasUnread,
        } as ConversationRow
      })
    },
    enabled: !!userId,
    staleTime: 15_000,
  })
}
