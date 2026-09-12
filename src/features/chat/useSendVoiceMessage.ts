import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { VoiceDraft } from './useVoiceRecorder'
import { CHAT_MEDIA_BUCKET } from './voiceFormats'
import { assertVoiceNoteAllowed, VoiceNotesBlockedError } from './useVoiceNotePolicies'

interface SendVoiceInput {
  draft: VoiceDraft
}

export function useSendVoiceMessage(conversationId: string, userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ draft }: SendVoiceInput) => {
      // Preflight avoids uploading audio the recipient has chosen not to receive.
      // The publishing RPC repeats this check to close the race between preflight
      // and the final write.
      await assertVoiceNoteAllowed(conversationId)

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

      const { error: messageError } = await supabase.rpc('create_voice_message', {
        p_message_id: messageId,
        p_attachment_id: attachmentId,
        p_conversation_id: conversationId,
        p_storage_path: storagePath,
        p_mime_type: draft.mimeType,
        p_size_bytes: draft.sizeBytes,
        p_duration_ms: Math.round(draft.durationMs),
      })

      if (messageError) {
        await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([storagePath])
        throw messageError
      }
      return messageId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
    },
  })
}
