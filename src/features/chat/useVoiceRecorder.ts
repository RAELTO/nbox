import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_VOICE_DURATION_MS,
  MAX_VOICE_SIZE_BYTES,
  selectVoiceFormat,
  voiceFormatFromMime,
} from './voiceFormats'

export type VoiceRecorderPhase = 'idle' | 'requesting' | 'recording' | 'preview' | 'error'

export interface VoiceDraft {
  blob: Blob
  previewUrl: string
  mimeType: 'audio/webm' | 'audio/mp4' | 'audio/ogg'
  extension: 'webm' | 'm4a' | 'ogg'
  durationMs: number
  sizeBytes: number
}

let activeRecorderOwner: symbol | null = null

function microphoneError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Microphone access was denied. Allow it in your browser settings and try again.'
    }
    if (error.name === 'NotFoundError') return 'No microphone was found on this device.'
    if (error.name === 'NotReadableError') return 'The microphone is already in use by another app.'
  }
  return 'The microphone could not be started. Please try again.'
}

export function useVoiceRecorder() {
  const ownerRef = useRef(Symbol('voice-recorder'))
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const startPendingRef = useRef(false)

  const [phase, setPhase] = useState<VoiceRecorderPhase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [draft, setDraft] = useState<VoiceDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isSupported = typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (activeRecorderOwner === ownerRef.current) activeRecorderOwner = null
  }, [])

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
  }, [])

  const discard = useCallback(() => {
    requestIdRef.current += 1
    startPendingRef.current = false
    cancelledRef.current = true
    clearTimer()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorderRef.current = null
    releaseStream()
    chunksRef.current = []
    revokePreview()
    setDraft(null)
    setElapsedMs(0)
    setError(null)
    setPhase('idle')
  }, [clearTimer, releaseStream, revokePreview])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    clearTimer()
    setElapsedMs(Math.min(Date.now() - startedAtRef.current, MAX_VOICE_DURATION_MS))
    recorder.stop()
  }, [clearTimer])

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Voice recording is not supported by this browser.')
      setPhase('error')
      return
    }
    if (startPendingRef.current || activeRecorderOwner === ownerRef.current) return
    if (activeRecorderOwner) {
      setError('Finish or cancel the voice note open in another chat first.')
      setPhase('error')
      return
    }

    discard()
    const requestId = ++requestIdRef.current
    startPendingRef.current = true
    setPhase('requesting')
    activeRecorderOwner = ownerRef.current

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      const preferred = selectVoiceFormat()
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, {
          ...(preferred ? { mimeType: preferred.recorderMimeType } : {}),
          audioBitsPerSecond: 48_000,
        })
      } catch {
        recorder = new MediaRecorder(stream)
      }

      recorderRef.current = recorder
      chunksRef.current = []
      cancelledRef.current = false
      startedAtRef.current = Date.now()

      recorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      })

      recorder.addEventListener('stop', () => {
        clearTimer()
        releaseStream()
        recorderRef.current = null
        if (cancelledRef.current) return

        const durationMs = Math.max(1, Math.min(Date.now() - startedAtRef.current, MAX_VOICE_DURATION_MS))
        const reportedMime = recorder.mimeType || chunksRef.current[0]?.type || preferred?.recorderMimeType || ''
        const format = voiceFormatFromMime(reportedMime)
        if (!format) {
          chunksRef.current = []
          setError('This browser recorded an unsupported audio format.')
          setPhase('error')
          return
        }

        const blob = new Blob(chunksRef.current, { type: format.storageMimeType })
        chunksRef.current = []
        if (blob.size === 0) {
          setError('The recording was empty. Please try again.')
          setPhase('error')
          return
        }
        if (blob.size > MAX_VOICE_SIZE_BYTES) {
          setError('The recording is too large. Voice notes can be up to 10 MB.')
          setPhase('error')
          return
        }

        revokePreview()
        const previewUrl = URL.createObjectURL(blob)
        previewUrlRef.current = previewUrl
        setElapsedMs(durationMs)
        setDraft({
          blob,
          previewUrl,
          mimeType: format.storageMimeType,
          extension: format.extension,
          durationMs,
          sizeBytes: blob.size,
        })
        setPhase('preview')
      }, { once: true })

      recorder.start(1_000)
      setElapsedMs(0)
      setPhase('recording')
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current
        setElapsedMs(Math.min(elapsed, MAX_VOICE_DURATION_MS))
        if (elapsed >= MAX_VOICE_DURATION_MS && recorder.state !== 'inactive') recorder.stop()
      }, 250)
    } catch (cause) {
      if (requestId !== requestIdRef.current) return
      clearTimer()
      releaseStream()
      setError(microphoneError(cause))
      setPhase('error')
    } finally {
      if (requestId === requestIdRef.current) startPendingRef.current = false
    }
  }, [clearTimer, discard, isSupported, releaseStream, revokePreview])

  const clearError = useCallback(() => {
    setError(null)
    setPhase(draft ? 'preview' : 'idle')
  }, [draft])

  useEffect(() => () => {
    requestIdRef.current += 1
    startPendingRef.current = false
    cancelledRef.current = true
    clearTimer()
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    releaseStream()
    revokePreview()
  }, [clearTimer, releaseStream, revokePreview])

  return {
    phase,
    elapsedMs,
    draft,
    error,
    isSupported,
    start,
    stop,
    discard,
    clearError,
  }
}
