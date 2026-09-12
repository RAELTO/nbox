import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Pause, Play } from 'lucide-react'
import { formatVoiceDuration } from '../../features/chat/voiceFormats'

interface VoiceAudioControlProps {
  durationMs: number
  src?: string
  requestSource?: () => Promise<string>
  label: string
}

const WAVE_HEIGHTS = [7, 13, 19, 10, 16, 22, 12, 18, 8, 15, 20, 11]

export default function VoiceAudioControl({ durationMs, src, requestSource, label }: VoiceAudioControlProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const playWhenReadyRef = useRef(false)
  const [requestedAudioUrl, setRequestedAudioUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audioUrl = src ?? requestedAudioUrl

  useEffect(() => {
    if (!audioUrl || !playWhenReadyRef.current) return
    playWhenReadyRef.current = false
    audioRef.current?.play().catch(() => setError('This voice note could not be played.'))
  }, [audioUrl])

  async function togglePlayback() {
    const audio = audioRef.current
    if (isLoading) return
    setError(null)
    if (audioUrl && audio) {
      if (audio.paused) await audio.play().catch(() => setError('This voice note could not be played.'))
      else audio.pause()
      return
    }
    if (!requestSource) return

    setIsLoading(true)
    try {
      playWhenReadyRef.current = true
      setRequestedAudioUrl(await requestSource())
    } catch {
      playWhenReadyRef.current = false
      setError('Could not load this voice note.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="voice-audio-control">
      <audio
        ref={audioRef}
        className="voice-native-audio"
        src={audioUrl || undefined}
        preload="none"
        aria-hidden="true"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        type="button"
        className="voice-play-btn"
        onClick={togglePlayback}
        disabled={isLoading}
        aria-label={`${isPlaying ? 'Pause' : 'Play'} ${label}, ${formatVoiceDuration(durationMs)}`}
      >
        {isLoading
          ? <LoaderCircle className="voice-spinner" size={17} aria-hidden="true" />
          : isPlaying
            ? <Pause size={17} fill="currentColor" aria-hidden="true" />
            : <Play size={17} fill="currentColor" aria-hidden="true" />}
      </button>
      <span className={`voice-wave${isPlaying ? ' playing' : ''}`} aria-hidden="true">
        {WAVE_HEIGHTS.map((height, index) => <i key={index} style={{ height }} />)}
      </span>
      <span className="voice-message-duration">{formatVoiceDuration(durationMs)}</span>
      {error && <div className="voice-message-error" role="alert">{error}</div>}
    </div>
  )
}
