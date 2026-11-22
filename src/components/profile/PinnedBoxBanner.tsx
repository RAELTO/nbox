import { Pin, PinOff } from 'lucide-react'
import type { BoxWithAuthor } from '../../types/database'
import BoxCard from '../feed/BoxCard'

interface PinnedBoxBannerProps {
  box: BoxWithAuthor
  isOwn: boolean
  isPending?: boolean
  onUnpin?: () => void
  onDelete?: (id: string) => void
}

export default function PinnedBoxBanner({
  box,
  isOwn,
  isPending = false,
  onUnpin,
  onDelete,
}: PinnedBoxBannerProps) {
  return (
    <section className="pinned-box-wrap" aria-label="Pinned drop">
      <div className="pinned-box-header">
        <span className="pinned-box-badge">
          <Pin size={14} strokeWidth={2.8} aria-hidden="true" />
          PINNED BOX
        </span>
        {isOwn && onUnpin && (
          <button
            type="button"
            className="pinned-box-unpin"
            disabled={isPending}
            onClick={onUnpin}
          >
            <PinOff size={13} strokeWidth={2.7} aria-hidden="true" />
            <span>Unpin</span>
          </button>
        )}
      </div>
      <BoxCard
        box={box}
        isPinned
        onTogglePin={isOwn && onUnpin ? () => onUnpin() : undefined}
        onDelete={onDelete}
      />
    </section>
  )
}
