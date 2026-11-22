import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type {
  GroupMember,
  GroupMemberRole,
  GroupVoiceState,
  VoiceReceptionMode,
} from './conversationTypes'

export function useGroupMembers(conversationId?: string, enabled = true) {
  return useQuery({
    queryKey: ['group-members', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase.rpc('get_group_members', {
        p_conversation_id: conversationId,
      })
      if (error) throw error
      const rows = Array.isArray(data) ? data : []
      return rows as unknown as GroupMember[]
    },
    enabled: enabled && !!conversationId,
    staleTime: 15_000,
  })
}

export function useGroupVoiceState(conversationId?: string, enabled = true) {
  return useQuery({
    queryKey: ['group-voice-state', conversationId],
    queryFn: async () => {
      if (!conversationId) return null
      const { data, error } = await supabase.rpc('get_group_voice_state', {
        p_conversation_id: conversationId,
      })
      if (error) throw error
      return (Array.isArray(data) ? data[0] : data) as unknown as GroupVoiceState
    },
    enabled: enabled && !!conversationId,
    staleTime: 10_000,
  })
}

export function useCreateGroupConversation(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, memberIds }: { name: string; memberIds: string[] }) => {
      const { data, error } = await supabase.rpc('create_group_conversation', {
        p_name: name.trim(),
        p_member_ids: memberIds,
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return String(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useSetGroupVoicePublication(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('set_group_voice_publication', {
        p_conversation_id: conversationId,
        p_enabled: enabled,
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-voice-state', conversationId] })
      qc.invalidateQueries({ queryKey: ['voice-note-capability', conversationId] })
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useSetGroupVoiceReception(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mode: VoiceReceptionMode) => {
      const { data, error } = await supabase.rpc('set_group_voice_reception', {
        p_conversation_id: conversationId,
        p_mode: mode,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-voice-state', conversationId] })
      qc.invalidateQueries({ queryKey: ['voice-note-settings', userId, conversationId] })
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useAddGroupMember(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.rpc('add_group_member', {
        p_conversation_id: conversationId,
        p_user_id: targetUserId,
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-members', conversationId] })
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useRemoveGroupMember(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.rpc('remove_group_member', {
        p_conversation_id: conversationId,
        p_user_id: targetUserId,
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-members', conversationId] })
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useSetGroupMemberRole(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ targetUserId, role }: { targetUserId: string; role: GroupMemberRole }) => {
      const { data, error } = await supabase.rpc('set_group_member_role', {
        p_conversation_id: conversationId,
        p_user_id: targetUserId,
        p_role: role,
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-members', conversationId] })
      qc.invalidateQueries({ queryKey: ['group-voice-state', conversationId] })
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useRenameGroup(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('rename_group_conversation', {
        p_conversation_id: conversationId,
        p_name: name.trim(),
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useLeaveGroup(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('leave_group', {
        p_conversation_id: conversationId,
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['messages', conversationId] })
      qc.removeQueries({ queryKey: ['group-members', conversationId] })
      qc.removeQueries({ queryKey: ['group-voice-state', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}

export function useCloseGroup(conversationId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('close_group_conversation', {
        p_conversation_id: conversationId,
        p_client_request_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['messages', conversationId] })
      qc.removeQueries({ queryKey: ['group-members', conversationId] })
      qc.removeQueries({ queryKey: ['group-voice-state', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}
