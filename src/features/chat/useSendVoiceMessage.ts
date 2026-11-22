import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { ConversationKind } from './conversationTypes'
import type { VoiceDraft } from './useVoiceRecorder'
import { CHAT_MEDIA_BUCKET } from './voiceFormats'
import { assertVoiceNoteAllowed, VoiceNotesBlockedError } from './useVoiceNotePolicies'

interface SendVoiceInput {
  draft: VoiceDraft
  expectedPolicyVersion?: number
}

export function useSendVoiceMessage(
  conversationId: string,
  userId: string,
  conversationType: ConversationKind = 'direct',
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ draft, expectedPolicyVersion }: SendVoiceInput) => {
      // Preflight avoids uploading audio when blocked by recipient or group policy.
      // The publishing RPC repeats this check under transaction lock.
      const capability = await assertVoiceNoteAllowed(conversationId)

      const messageId = crypto.randomUUID()
      const attachmentId = crypto.randomUUID()
      const storagePath = `${conversationId}/${userId}/${messageId}/${attachmentId}.${draft.extension}`

      const { error: uploadError } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .upload(storagePath, draft.blob, {
          cacheControl: '3600',
          contentType: draft.mimeType,
          upsert: false,
        })
      if (uploadError) {
        const latestPermission = await assertVoiceNoteAllowed(conversationId).catch(error => error)
        if (latestPermission instanceof VoiceNotesBlockedError) throw latestPermission
        throw uploadError
      }

      const publishResult = conversationType === 'group'
        ? await supabase.rpc('publish_group_voice_message', {
            p_message_id: messageId,
            p_attachment_id: attachmentId,
            p_conversation_id: conversationId,
            p_storage_path: storagePath,
            p_mime_type: draft.mimeType,
            p_size_bytes: draft.sizeBytes,
            p_duration_ms: Math.round(draft.durationMs),
            p_client_request_id: crypto.randomUUID(),
            p_expected_policy_version: expectedPolicyVersion ?? capability.policyVersion ?? 1,
          })
        : await supabase.rpc('create_voice_message', {
            p_message_id: messageId,
            p_attachment_id: attachmentId,
            p_conversation_id: conversationId,
            p_storage_path: storagePath,
            p_mime_type: draft.mimeType,
            p_size_bytes: draft.sizeBytes,
            p_duration_ms: Math.round(draft.durationMs),
          })

      if (publishResult.error) {
        await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([storagePath])
        throw publishResult.error
      }
      return messageId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
      queryClient.invalidateQueries({ queryKey: ['group-voice-state', conversationId] })
    },
  })
}
