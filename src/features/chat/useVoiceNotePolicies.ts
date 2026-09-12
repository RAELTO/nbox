import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export type GlobalVoiceNotePolicy = 'allow' | 'block'
export type ConversationVoiceNotePolicy = 'inherit' | 'allow' | 'block'

export interface VoiceNoteCapability {
  allowed: boolean
  reason: string
}

export interface VoiceNoteSettings {
  globalPolicy: GlobalVoiceNotePolicy
  conversationPolicy: ConversationVoiceNotePolicy
}

export const VOICE_NOTES_BLOCKED_MESSAGE = 'This person is not accepting voice notes in this chat.'

export class VoiceNotesBlockedError extends Error {
  readonly code = 'VOICE_NOTES_BLOCKED_BY_RECIPIENT'

  constructor(message = VOICE_NOTES_BLOCKED_MESSAGE) {
    super(message)
    this.name = 'VoiceNotesBlockedError'
  }
}

function normalizeCapability(data: unknown): VoiceNoteCapability {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') {
    throw new Error('Voice-note permission returned no result.')
  }

  const row = value as { allowed?: unknown; reason?: unknown }
  return {
    allowed: row.allowed === true,
    reason: typeof row.reason === 'string' ? row.reason : 'unknown',
  }
}

export async function fetchVoiceNoteCapability(conversationId: string) {
  const { data, error } = await supabase.rpc('get_voice_note_permission', {
    p_conversation_id: conversationId,
  })

  if (error) throw error
  return normalizeCapability(data)
}

export async function assertVoiceNoteAllowed(conversationId: string) {
  const capability = await fetchVoiceNoteCapability(conversationId)
  if (!capability.allowed) throw new VoiceNotesBlockedError()
  return capability
}

export function isVoiceNotesBlockedError(error: unknown) {
  if (error instanceof VoiceNotesBlockedError) return true
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: unknown; message?: unknown; details?: unknown }
  return candidate.code === 'VOICE_NOTES_BLOCKED_BY_RECIPIENT'
    || candidate.message === 'VOICE_NOTES_BLOCKED_BY_RECIPIENT'
    || candidate.details === 'VOICE_NOTES_BLOCKED_BY_RECIPIENT'
    || (typeof candidate.message === 'string' && candidate.message.includes('VOICE_NOTES_BLOCKED_BY_RECIPIENT'))
}

export function useVoiceNoteCapability(conversationId: string) {
  return useQuery({
    queryKey: ['voice-note-capability', conversationId],
    queryFn: () => fetchVoiceNoteCapability(conversationId),
    enabled: !!conversationId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useVoiceNoteSettings(conversationId: string, userId: string) {
  return useQuery({
    queryKey: ['voice-note-settings', userId, conversationId],
    queryFn: async (): Promise<VoiceNoteSettings> => {
      const [globalResult, conversationResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('voice_notes_enabled')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('conversation_participants')
          .select('voice_notes_mode')
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .maybeSingle(),
      ])

      if (globalResult.error) throw globalResult.error
      if (conversationResult.error) throw conversationResult.error

      return {
        globalPolicy: globalResult.data?.voice_notes_enabled === false ? 'block' : 'allow',
        conversationPolicy: conversationResult.data?.voice_notes_mode ?? 'inherit',
      }
    },
    enabled: !!conversationId && !!userId,
  })
}

export function useSetGlobalVoiceNotePolicy(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (policy: GlobalVoiceNotePolicy) => {
      const { error } = await supabase
        .from('profiles')
        .update({ voice_notes_enabled: policy === 'allow' })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-note-settings', userId] })
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}

export function useSetConversationVoiceNotePolicy(conversationId: string, userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (policy: ConversationVoiceNotePolicy) => {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ voice_notes_mode: policy })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-note-settings', userId, conversationId] })
    },
  })
}
