import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useCreateBox } from '../../features/boxes/useBoxes'
import { sanitizeUrl } from '../../lib/sanitize'
import { uploadCoverImage } from '../../lib/storage'
import { getVideoEmbedUrl } from '../../lib/videoEmbed'
import type { BoxType, MoodPayload } from '../../types/database'
import { useToast } from '../ui/Toast'
import { useDialogAccessibility } from '../ui/useDialogAccessibility'
import DropMediaFields from './DropMediaFields'
import {
  newPollOption,
  newThreadItem,
  type DropPollOption,
  type DropThreadItem,
} from './DropModalConfig'
import DropMoodFields from './DropMoodFields'
import DropPollFields from './DropPollFields'
import DropTagsField from './DropTagsField'
import DropThreadFields from './DropThreadFields'
import DropTypeSelector from './DropTypeSelector'

interface DropModalProps {
  initialType?: BoxType
  groupId?: string | null
  groupName?: string
  onClose: () => void
}

export default function DropModal({ initialType = 'quick', groupId = null, groupName, onClose }: DropModalProps) {
  const { user } = useAuth()
  const createBox = useCreateBox()
  const toast = useToast()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogAccessibility({ dialogRef: panelRef, onClose })

  const [type, setType] = useState<BoxType>(initialType)
  const [text, setText] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [mood, setMood] = useState<MoodPayload['color']>('m1')
  const [mediaMode, setMediaMode] = useState<'image' | 'video'>('image')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [pollOpts, setPollOpts] = useState<DropPollOption[]>(() => ['', '', ''].map(newPollOption))
  const [threadItems, setThreadItems] = useState<DropThreadItem[]>(() => ['', ''].map(newThreadItem))
  const [uploading, setUploading] = useState(false)

  const embedUrl = getVideoEmbedUrl(videoUrl)
  const parsedTags = tagsInput.split(/[\s,]+/).flatMap(tag => {
    const trimmed = tag.trim()
    return trimmed ? [trimmed.startsWith('#') ? trimmed.slice(1) : trimmed] : []
  })

  useEffect(() => () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
  }, [mediaPreview])

  function handleMediaFile(file: File | null, preview: string | null) {
    setMediaFile(file)
    setMediaPreview(preview)
  }

  async function handlePublish() {
    if (!user) return
    let content = text.trim()
    // The payload shape is narrowed by the selected box type below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: Record<string, any> = {}

    try {
      setUploading(true)
      if (type === 'quick' && !content) {
        toast('Write something before dropping.')
        return
      }
      if (type === 'media') {
        if (mediaMode === 'image') {
          if (!mediaFile) {
            toast('Upload an image first.')
            return
          }
          payload = { url: await uploadCoverImage(mediaFile, user.id), kind: 'image' }
        } else {
          if (!embedUrl) {
            toast('Invalid YouTube or Vimeo URL.')
            return
          }
          payload = { url: embedUrl, kind: 'video' }
        }
      }
      if (type === 'mood') {
        if (!content) {
          toast('Write the mood.')
          return
        }
        payload = { color: mood }
      }
      if (type === 'poll') {
        const options = pollOpts.flatMap(option => option.text.trim() ? [option.text.trim()] : [])
        if (options.length < 2) {
          toast('You need at least 2 options.')
          return
        }
        content ||= 'Which one do you choose?'
        payload = { question: content, options: options.map(option => ({ text: option })) }
      }
      if (type === 'thread') {
        const items = threadItems.flatMap(item => item.text.trim() ? [item.text.trim()] : [])
        if (!content) {
          toast('Write a thread title.')
          return
        }
        if (items.length < 1) {
          toast('Add at least one item.')
          return
        }
        payload = { items }
      }
      if (type === 'link') {
        const safeUrl = sanitizeUrl(linkUrl)
        if (!safeUrl) {
          toast('Invalid URL. Only http/https URLs are allowed.')
          return
        }
        try {
          payload = { url: safeUrl, host: new URL(safeUrl).hostname }
        } catch {
          toast('Invalid URL.')
          return
        }
        content ||= safeUrl
      }

      await createBox.mutateAsync({ author_id: user.id, type, content, payload, tags: parsedTags, group_id: groupId })
      toast('Drop published.')
      onClose()
    } catch {
      toast('Failed to publish. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const isPublishing = uploading || createBox.isPending

  return (
    <div onClick={onClose} className="drop-overlay" style={{ zIndex: 'var(--z-drop-modal)' as unknown as number }}>
      <div
        ref={panelRef}
        onClick={event => event.stopPropagation()}
        className="drop-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="drop-header">
          <h2 id={titleId} className="drop-title">{groupName ? `NEW DROP · ${groupName}` : 'NEW DROP'}</h2>
          <button type="button" onClick={onClose} className="drop-close-btn">
            <X size={13} strokeWidth={2.5} /> Close
          </button>
        </div>

        <div className="drop-body">
          <DropTypeSelector value={type} onChange={setType} />

          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={
              type === 'mood' ? 'What is the mood?' :
              type === 'thread' ? 'Thread title…' :
              type === 'poll' ? 'Poll question…' :
              'What do you want to drop?'
            }
            className="drop-textarea"
            aria-label="Drop content"
          />

          {type === 'media' && (
            <DropMediaFields
              mode={mediaMode}
              preview={mediaPreview}
              videoUrl={videoUrl}
              embedUrl={embedUrl}
              onModeChange={setMediaMode}
              onFileChange={handleMediaFile}
              onVideoUrlChange={setVideoUrl}
            />
          )}

          {type === 'mood' && <DropMoodFields value={mood} onChange={setMood} />}
          {type === 'poll' && <DropPollFields options={pollOpts} onChange={setPollOpts} />}
          {type === 'thread' && <DropThreadFields items={threadItems} onChange={setThreadItems} />}

          {type === 'link' && (
            <input
              value={linkUrl}
              onChange={event => setLinkUrl(event.target.value)}
              placeholder="https://…"
              className="drop-input"
              aria-label="Link URL"
            />
          )}

          <DropTagsField value={tagsInput} tags={parsedTags} onChange={setTagsInput} />
        </div>

        <div className="drop-footer">
          <button type="button" onClick={onClose} className="drop-cancel-btn">Cancel</button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            className="drop-submit-btn"
            style={{ cursor: isPublishing ? 'not-allowed' : 'pointer', opacity: isPublishing ? 0.7 : 1 }}
          >
            {isPublishing ? 'Dropping…' : 'DROP'}
          </button>
        </div>
      </div>
    </div>
  )
}
