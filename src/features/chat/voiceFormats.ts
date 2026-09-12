export const CHAT_MEDIA_BUCKET = 'chat-media'
export const MAX_VOICE_DURATION_MS = 5 * 60 * 1000
export const MAX_VOICE_SIZE_BYTES = 10 * 1024 * 1024

export interface VoiceFormat {
  recorderMimeType: string
  storageMimeType: 'audio/webm' | 'audio/mp4' | 'audio/ogg'
  extension: 'webm' | 'm4a' | 'ogg'
}

const VOICE_FORMATS: VoiceFormat[] = [
  {
    recorderMimeType: 'audio/webm;codecs=opus',
    storageMimeType: 'audio/webm',
    extension: 'webm',
  },
  {
    recorderMimeType: 'audio/mp4',
    storageMimeType: 'audio/mp4',
    extension: 'm4a',
  },
  {
    recorderMimeType: 'audio/ogg;codecs=opus',
    storageMimeType: 'audio/ogg',
    extension: 'ogg',
  },
]

export function selectVoiceFormat(): VoiceFormat | null {
  if (typeof MediaRecorder === 'undefined') return null
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null
  return VOICE_FORMATS.find(format => MediaRecorder.isTypeSupported(format.recorderMimeType)) ?? null
}

export function voiceFormatFromMime(mimeType: string): VoiceFormat | null {
  const base = mimeType.toLowerCase().split(';', 1)[0].trim()
  return VOICE_FORMATS.find(format => format.storageMimeType === base) ?? null
}

export function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
