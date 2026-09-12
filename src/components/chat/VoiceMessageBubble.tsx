import { supabase } from '../../lib/supabase'
import type { MessageAttachmentRow } from '../../features/chat/useMessages'
import { CHAT_MEDIA_BUCKET } from '../../features/chat/voiceFormats'
import VoiceAudioControl from './VoiceAudioControl'

export default function VoiceMessageBubble({ attachment }: { attachment?: MessageAttachmentRow }) {
  if (!attachment) {
    return <div className="voice-message-error" role="alert">Voice note unavailable</div>
  }
  const voiceAttachment = attachment

  async function requestSource() {
    const { data, error: signedUrlError } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrl(voiceAttachment.storage_path, 5 * 60)
    if (signedUrlError || !data?.signedUrl) {
      throw signedUrlError ?? new Error('Missing signed URL')
    }
    return data.signedUrl
  }

  return (
    <VoiceAudioControl
      durationMs={voiceAttachment.duration_ms ?? 0}
      requestSource={requestSource}
      label="voice note"
    />
  )
}
