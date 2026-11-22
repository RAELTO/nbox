import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, Type, X } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { type StoryBgColor, useCreateStory } from '../../features/stories/useStories'
import { uploadStoryImage, validateImage } from '../../lib/storage'
import { storyCaptionSchema } from '../../lib/validation'
import { useToast } from '../ui/Toast'
import { useDialogAccessibility } from '../ui/useDialogAccessibility'

const COLOR_SWATCHES: Array<{ value: StoryBgColor; label: string; cssVar: string }> = [
  { value: 'accent-1', label: 'Coral', cssVar: 'var(--accent-1)' },
  { value: 'accent-2', label: 'Sun', cssVar: 'var(--accent-2)' },
  { value: 'accent-3', label: 'Sky', cssVar: 'var(--accent-3)' },
  { value: 'accent-4', label: 'Mint', cssVar: 'var(--accent-4)' },
  { value: 'accent-5', label: 'Lilac', cssVar: 'var(--accent-5)' },
  { value: 'ink', label: 'Ink', cssVar: 'var(--ink)' },
]

interface CreateStoryModalProps {
  onClose: () => void
}

export default function CreateStoryModal({ onClose }: CreateStoryModalProps) {
  const { user } = useAuth()
  const toast = useToast()
  const createStory = useCreateStory(user?.id)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)
  useDialogAccessibility({ dialogRef: panelRef, onClose, initialFocusRef: captionRef })

  const [mode, setMode] = useState<'text' | 'photo'>('text')
  const [caption, setCaption] = useState('')
  const [bgColor, setBgColor] = useState<StoryBgColor>('accent-2')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    if (!picked) return
    const err = validateImage(picked, 'cover')
    if (err) {
      toast(err.message)
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(picked)
    setPreview(URL.createObjectURL(picked))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!user?.id || submitting) return

    const trimmedCaption = caption.trim()
    if (mode === 'text') {
      const check = storyCaptionSchema.safeParse(trimmedCaption)
      if (!check.success) {
        toast('Enter 1 to 280 characters without HTML brackets.')
        return
      }
    } else if (!file) {
      toast('Select an image to post a photo story.')
      return
    } else if (trimmedCaption && !storyCaptionSchema.safeParse(trimmedCaption).success) {
      toast('Caption must be 280 characters or fewer without HTML brackets.')
      return
    }

    setSubmitting(true)
    try {
      const mediaUrl = mode === 'photo' && file ? await uploadStoryImage(file, user.id) : null
      await createStory.mutateAsync({
        caption: trimmedCaption || null,
        mediaUrl,
        bgColor,
      })
      toast('Story posted for 24 hours.')
      onClose()
    } catch {
      toast('Could not publish your story. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="group-modal-overlay">
      <button
        type="button"
        className="group-modal-backdrop"
        aria-label="Close create story dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="group-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="group-modal-head">
          <h2 id={titleId}>Post a 24h story</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close create story dialog">
            <X size={18} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        <div className="group-mode-switch" role="tablist" aria-label="Story format">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'text'}
            className={`group-mode-tab${mode === 'text' ? ' active' : ''}`}
            onClick={() => setMode('text')}
          >
            <Type size={15} strokeWidth={2.7} aria-hidden="true" /> Text card
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'photo'}
            className={`group-mode-tab${mode === 'photo' ? ' active' : ''}`}
            onClick={() => setMode('photo')}
          >
            <ImagePlus size={15} strokeWidth={2.7} aria-hidden="true" /> Photo
          </button>
        </div>

        <form className="group-modal-form" onSubmit={event => void handleSubmit(event)}>
          <div className="group-modal-body">
            {mode === 'photo' && (
              <div className="story-upload-box">
                <label className="btn btn-small" htmlFor="story-image-input">
                  <ImagePlus size={15} strokeWidth={2.6} aria-hidden="true" />
                  {file ? 'Change photo' : 'Choose photo (max 1 MB)'}
                </label>
                <input
                  id="story-image-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={handleFileChange}
                />
                {preview && (
                  <img src={preview} alt="Story preview" className="story-upload-preview" />
                )}
              </div>
            )}

            <div className="group-field">
              <div className="group-field-row">
                <label className="field-label" htmlFor="story-caption-input">
                  {mode === 'text' ? 'Story text' : 'Caption (optional)'}
                </label>
                <span className="group-char-count">{caption.trim().length}/280</span>
              </div>
              <textarea
                ref={captionRef}
                id="story-caption-input"
                rows={3}
                maxLength={280}
                value={caption}
                onChange={event => setCaption(event.target.value)}
                placeholder={mode === 'text' ? 'Say something loud for 24 hours…' : 'Add a short caption…'}
              />
            </div>

            <div className="group-field">
              <span className="field-label">Card color</span>
              <div className="story-swatch-row" role="radiogroup" aria-label="Story background color">
                {COLOR_SWATCHES.map(swatch => (
                  <button
                    key={swatch.value}
                    type="button"
                    role="radio"
                    aria-checked={bgColor === swatch.value}
                    aria-label={swatch.label}
                    className={`story-swatch${bgColor === swatch.value ? ' active' : ''}`}
                    style={{ background: swatch.cssVar }}
                    onClick={() => setBgColor(swatch.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="group-modal-foot">
            <button type="button" className="btn btn-small" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-small btn-primary" disabled={submitting}>
              {submitting ? 'Posting…' : 'Publish story'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
