import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, Smile, X } from 'lucide-react'
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

interface EmojiPickerPopoverProps {
  anchorRef: RefObject<HTMLButtonElement | null>
  onSelect: (emoji: string) => void
  onClose: (restoreFocus: boolean) => void
}

function getPopoverStyle(anchor: HTMLButtonElement | null): CSSProperties {
  const margin = 10
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const anchorRect = anchor?.getBoundingClientRect()
  const isMobile = viewportWidth <= 600
  const horizontalInset = isMobile ? 12 : 8
  const width = Math.min(352, viewportWidth - (horizontalInset * 2))
  const availableAbove = Math.max(260, (anchorRect?.top ?? viewportHeight) - margin - 8)
  const height = Math.min(410, availableAbove)
  const anchoredLeft = Math.max(horizontalInset, Math.min(
    (anchorRect?.right ?? viewportWidth - horizontalInset) - width,
    viewportWidth - width - horizontalInset,
  ))
  const left = isMobile
    ? Math.round((viewportWidth - width) / 2)
    : anchoredLeft
  const top = Math.max(8, (anchorRect?.top ?? viewportHeight) - height - margin)

  return { width, height, left, top }
}

export default function EmojiPickerPopover({ anchorRef, onSelect, onClose }: EmojiPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    const reposition = () => setStyle(getPopoverStyle(anchorRef.current))
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [anchorRef])

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose(true)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorRef, onClose])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const normalizeSearchAria = () => {
      const search = panel.querySelector<HTMLInputElement>('input[aria-controls="epr-search-id"]')
      if (search && !panel.querySelector('#epr-search-id')) search.removeAttribute('aria-controls')

      panel.querySelectorAll<HTMLButtonElement>('.epr-tone[aria-label]').forEach((button) => {
        button.title = button.getAttribute('aria-label') ?? ''
      })
    }
    const observer = new MutationObserver(normalizeSearchAria)
    observer.observe(panel, { childList: true, subtree: true })
    normalizeSearchAria()
    return () => observer.disconnect()
  }, [])

  return createPortal(
    <div
      ref={panelRef}
      className="emoji-picker-popover"
      style={style}
      role="dialog"
      aria-label="Emoji picker"
    >
      <div className="emoji-picker-head">
        <span><Smile size={15} aria-hidden="true" /> PICK AN EMOJI</span>
        <button ref={closeRef} type="button" onClick={() => onClose(true)} aria-label="Close emoji picker">
          <X size={16} strokeWidth={3} aria-hidden="true" />
        </button>
      </div>
      <div className="emoji-picker-body">
        <Suspense fallback={(
          <div className="emoji-picker-loading" role="status">
            <LoaderCircle className="voice-spinner" size={20} aria-hidden="true" /> Loading emojis
          </div>
        )}>
          <EmojiPicker
            width="100%"
            height="100%"
            theme={'auto' as Theme}
            emojiStyle={'native' as EmojiStyle}
            lazyLoadEmojis
            autoFocusSearch={false}
            previewConfig={{ showPreview: false }}
            searchPlaceHolder="Search emoji"
            onEmojiClick={(emoji: EmojiClickData) => onSelect(emoji.emoji)}
          />
        </Suspense>
      </div>
    </div>,
    document.body,
  )
}
