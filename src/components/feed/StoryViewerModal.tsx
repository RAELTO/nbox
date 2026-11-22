import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Eye, Pause, Play, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  type StoryAuthorGroup,
  useDeleteStory,
  useMarkStoryViewed,
  useStoryViewers,
} from '../../features/stories/useStories'
import { useIsAdmin } from '../../features/auth/useIsAdmin'
import { useConfirm } from '../ui/ConfirmContext'
import { useToast } from '../ui/Toast'
import { useDialogAccessibility } from '../ui/useDialogAccessibility'
import Avatar from '../ui/Avatar'

interface StoryViewerModalProps {
  groups: StoryAuthorGroup[]
  initialGroupIndex: number
  currentUserId?: string
  onClose: () => void
}

function relativeTime(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export default function StoryViewerModal({
  groups,
  initialGroupIndex,
  currentUserId,
  onClose,
}: StoryViewerModalProps) {
  const safeInitialGroup = Math.min(Math.max(initialGroupIndex, 0), Math.max(groups.length - 1, 0))
  const [groupIndex, setGroupIndex] = useState(safeInitialGroup)
  const [storyIndex, setStoryIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showViewers, setShowViewers] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useDialogAccessibility({ dialogRef: panelRef, onClose })

  const isSiteAdmin = useIsAdmin()
  const confirm = useConfirm()
  const toast = useToast()
  const markViewed = useMarkStoryViewed(currentUserId)
  const deleteStory = useDeleteStory()
  const markViewedRef = useRef(markViewed.mutate)
  useEffect(() => { markViewedRef.current = markViewed.mutate }, [markViewed.mutate])

  const group = groups[groupIndex] ?? groups[0]
  const story = group?.stories[storyIndex] ?? group?.stories[0]
  const isOwner = Boolean(currentUserId && story && story.author_id === currentUserId)
  const canDelete = isOwner || isSiteAdmin
  const viewersQuery = useStoryViewers(story?.id, Boolean(story && isOwner && showViewers))

  useEffect(() => {
    if (!story) {
      onCloseRef.current()
      return
    }
    if (!story.viewed_by_me && story.author_id !== currentUserId) {
      markViewedRef.current(story.id)
    }
  }, [currentUserId, story])

  useEffect(() => {
    if (!group || !story || paused || showViewers) return
    const timer = window.setTimeout(() => {
      if (storyIndex + 1 < group.stories.length) {
        setStoryIndex(i => i + 1)
      } else if (groupIndex + 1 < groups.length) {
        setGroupIndex(g => g + 1)
        setStoryIndex(0)
      } else {
        onCloseRef.current()
      }
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [group, groupIndex, groups.length, paused, showViewers, story, storyIndex])

  if (!group || !story) return null

  function goNext() {
    if (storyIndex + 1 < group.stories.length) {
      setStoryIndex(i => i + 1)
    } else if (groupIndex + 1 < groups.length) {
      setGroupIndex(g => g + 1)
      setStoryIndex(0)
    } else {
      onClose()
    }
  }

  function goPrev() {
    if (storyIndex > 0) {
      setStoryIndex(i => i - 1)
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1]
      setGroupIndex(g => g - 1)
      setStoryIndex(Math.max(prevGroup.stories.length - 1, 0))
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete this story?',
      message: 'This story will be removed immediately.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteStory.mutateAsync(story.id)
      toast('Story deleted.')
      if (group.stories.length <= 1 && groups.length <= 1) {
        onClose()
      } else {
        setStoryIndex(0)
      }
    } catch {
      toast('Could not delete story.')
    }
  }

  return createPortal(
    <div className="story-viewer-overlay">
      <button
        type="button"
        className="group-modal-backdrop"
        aria-label="Close story viewer"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="story-viewer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') goNext()
          if (event.key === 'ArrowLeft') goPrev()
        }}
      >
        <div className="story-viewer-bars" aria-hidden="true">
          {group.stories.map((item, idx) => (
            <div key={item.id} className="story-viewer-bar-track">
              <div className={`story-viewer-bar-fill${idx < storyIndex ? ' done' : idx === storyIndex ? ' active' : ''}`} />
            </div>
          ))}
        </div>

        <div className="story-viewer-head">
          <Link to={`/profile/${group.author.username}`} className="story-viewer-author" onClick={onClose}>
            <Avatar name={group.author.display_name} src={group.author.avatar_url} size="sm" />
            <div>
              <strong id={titleId}>{group.author.display_name}</strong>
              <small>@{group.author.username} · {relativeTime(story.created_at)}</small>
            </div>
          </Link>
          <div className="story-viewer-head-actions">
            <button
              type="button"
              className="story-ctrl-btn"
              onClick={() => setPaused(p => !p)}
              aria-label={paused ? 'Resume story' : 'Pause story'}
            >
              {paused ? <Play size={14} strokeWidth={2.7} aria-hidden="true" /> : <Pause size={14} strokeWidth={2.7} aria-hidden="true" />}
            </button>
            {canDelete && (
              <button
                type="button"
                className="story-ctrl-btn danger"
                onClick={() => void handleDelete()}
                aria-label="Delete story"
              >
                <Trash2 size={14} strokeWidth={2.7} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close story viewer">
              <X size={16} strokeWidth={3} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={`story-viewer-stage story-bg-${story.bg_color}`}>
          {story.media_url && (
            <img src={story.media_url} alt={story.caption ?? 'Story image'} className="story-viewer-img" />
          )}
          {story.caption && (
            <div className={story.media_url ? 'story-viewer-caption-bar' : 'story-viewer-text-card'}>
              {story.caption}
            </div>
          )}

          <button type="button" className="story-nav-btn prev" onClick={goPrev} aria-label="Previous story" disabled={groupIndex === 0 && storyIndex === 0}>
            <ChevronLeft size={20} strokeWidth={3} aria-hidden="true" />
          </button>
          <button type="button" className="story-nav-btn next" onClick={goNext} aria-label="Next story">
            <ChevronRight size={20} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        {isOwner && (
          <div className="story-viewer-foot">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setShowViewers(v => !v)}
              aria-expanded={showViewers}
            >
              <Eye size={14} strokeWidth={2.6} aria-hidden="true" />
              {showViewers ? 'Hide viewers' : 'Viewers'}
            </button>
            {showViewers && (
              <div className="story-viewers-list">
                {viewersQuery.isLoading ? (
                  <small>Loading viewers…</small>
                ) : (viewersQuery.data ?? []).length === 0 ? (
                  <small>No viewers yet.</small>
                ) : (
                  (viewersQuery.data ?? []).map(row => (
                    <span key={row.viewer_id} className="story-viewer-chip">
                      {row.viewer.display_name} (@{row.viewer.username})
                    </span>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
