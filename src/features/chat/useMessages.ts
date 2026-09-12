import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

export interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  kind: 'text' | 'image' | 'voice' | 'system'
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  sender: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
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

export function useMessages(conversationId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient()

  // Realtime: mensajes nuevos llegan instantáneamente
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
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

  // Marcar como leído al abrir la conversación
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
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as MessageRow[]
    },
    enabled: !!conversationId,
    staleTime: 0,
  })
}

export function useSendMessage(conversationId: string, userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: userId, body: body.trim() })
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
