import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { groupTextMessageSchema } from '../../lib/validation'
import type { Profile } from '../../types/database'
import type { ConversationKind, SystemEventType } from './conversationTypes'

export interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string | null
  body: string
  kind: 'text' | 'image' | 'voice' | 'system'
  group_sequence: number | null
  client_request_id: string | null
  system_event_type: SystemEventType | null
  system_event_payload: Record<string, unknown> | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  sender: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null
  attachments: MessageAttachmentRow[]
  // local-only state for optimistic updates
  status?: 'sending' | 'sent' | 'failed'
}

export interface MessageAttachmentRow {
  id: string
  message_id: string
  kind: 'voice' | 'image' | 'video' | 'file'
  storage_path: string
  mime_type: string
  size_bytes: number
  duration_ms: number | null
  position: number
  created_at: string
}

export const MESSAGE_SELECT = `
  *,
  sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url),
  attachments:message_attachments(id, message_id, kind, storage_path, mime_type, size_bytes, duration_ms, position, created_at)
`

export function useMessages(
  conversationId: string | undefined,
  userId: string | undefined,
  limit = 50,
) {
  const qc = useQueryClient()

  // Realtime: incoming messages and system events arrive immediately
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['messages', conversationId] })
        qc.invalidateQueries({ queryKey: ['conversations', userId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, userId, qc])

  // Mark as read when opening the conversation
  useEffect(() => {
    if (!conversationId || !userId) return
    supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['conversations', userId] })
      })
  }, [conversationId, userId, qc])

  return useQuery({
    queryKey: ['messages', conversationId, limit],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('group_sequence', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (error) throw error
      const rows = (data ?? []) as unknown as MessageRow[]
      return rows.slice().reverse()
    },
    enabled: !!conversationId,
    staleTime: 0,
  })
}

export function useSendMessage(
  conversationId: string,
  userId: string,
  conversationType: ConversationKind = 'direct',
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const trimmed = body.trim()
      if (!trimmed) throw new Error('invalid_group_message')

      if (conversationType === 'group') {
        const parsed = groupTextMessageSchema.safeParse(body)
        if (!parsed.success) throw new Error('invalid_group_message')
        const { data, error } = await supabase.rpc('publish_group_text_message', {
          p_conversation_id: conversationId,
          p_body: parsed.data,
          p_client_request_id: crypto.randomUUID(),
        })
        if (error) throw error
        return data
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: userId, body: trimmed })
        .select(MESSAGE_SELECT)
        .single()
      if (error) throw error
      return data as unknown as MessageRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}
