import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useMyCommentVote, useCommentVoteCounts, useToggleCommentVote } from '../../features/comments/useCommentVotes'
import { useMyCommentReaction, useCommentReactionCounts, useToggleCommentReaction } from '../../features/comments/useCommentReactions'
import { useCommentActivityUserCount } from '../../features/comments/useCommentActivity'
import Avatar from '../ui/Avatar'
import AdminBadge from '../ui/AdminBadge'
import { useConfirm } from '../ui/ConfirmContext'
import type { CommentWithAuthor } from '../../features/comments/useComments'
import type { ReactionType, VoteType } from '../../types/database'

// ─── Config ──────────────────────────────────────────────────────────────────────
const CUSTOM_REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'loud',  emoji: '❤️', label: 'Love it' },
  { type: 'fire',  emoji: '😆', label: 'Haha'       },
  { type: 'sharp', emoji: '😮', label: 'Wow'        },
  { type: 'save',  emoji: '😢', label: 'Sad'        },
  { type: 'angry', emoji: '😠', label: 'Angry'      },
]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ─── Props ────────────────────────────────────────────────────────────────────────
interface Props {
  comment: CommentWithAuthor
  onDelete?: (id: string) => void
  onOpenActivity?: (commentId: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────────
export default function CommentItem({ comment, onDelete, onOpenActivity }: Props) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const [popPos, setPopPos]   = useState<{ top: number; left: number } | null>(null)
  const triggerRef            = useRef<HTMLDivElement>(null)
  const closeTimer            = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const { data: myVote }      = useMyCommentVote(comment.id, user?.id)
  const { data: myReaction }  = useMyCommentReaction(comment.id, user?.id)
  const { data: voteCounts }  = useCommentVoteCounts(comment.id)
  const { data: reactCounts } = useCommentReactionCounts(comment.id)
  const { data: activityUserCount } = useCommentActivityUserCount(comment.id)
  const toggleVote            = useToggleCommentVote(comment.id)
  const toggleReaction        = useToggleCommentReaction(comment.id)

  const likeCount    = voteCounts?.like    ?? 0
  const dislikeCount = voteCounts?.dislike ?? 0
  const topReactions = CUSTOM_REACTIONS
    .reduce<Array<(typeof CUSTOM_REACTIONS[number]) & { n: number }>>(
      (acc, r) => { const n = reactCounts?.[r.type] ?? 0; if (n > 0) acc.push({ ...r, n }); return acc },
      []
    )
    .sort((a, b) => b.n - a.n)
  const totalReactions = topReactions.reduce((s, r) => s + r.n, 0)
  const totalActivity = likeCount + dislikeCount + totalReactions
  const activityCount = activityUserCount ?? totalActivity

  const hasActivity = likeCount > 0 || dislikeCount > 0 || totalReactions > 0

  function handleVote(vote: VoteType) {
    if (!user) return
    toggleVote.mutate({ userId: user.id, vote, current: myVote ?? null })
  }

  function handleReact(type: ReactionType) {
    if (!user) return
    toggleReaction.mutate({ userId: user.id, type, current: myReaction ?? null })
    setPopPos(null)
  }

  function openPopover() {
    clearTimeout(closeTimer.current)
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      // popup: 2 votes(36px) + divider + 5 emojis(36px) + gaps + padding ≈ 312px
      const POPUP_W = 312
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_W - 8))
      setPopPos({ top: rect.top - 60, left })
    }
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setPopPos(null), 120)
  }

  const isOwner = user?.id === comment.author_id

  return (
    <>
      <div className="comment-row">
        {/* Avatar */}
        <Link to={`/profile/${comment.author.username}`} style={{ display: 'flex', textDecoration: 'none' }}>
          <Avatar name={comment.author.display_name} src={comment.author.avatar_url} size="sm" />
        </Link>

        {/* Bubble */}
        <div className="comment-body">
          <div className="comment-bubble">
            <div className="comment-bubble-head">
              <Link to={`/profile/${comment.author.username}`} className="comment-author">
                {comment.author.display_name}
                {comment.author.role === 'admin' && <AdminBadge />}
              </Link>
              {isOwner && onDelete && (
                <button type="button"
                  onClick={async () => {
                    const ok = await confirm({ title: 'Delete comment?', message: 'This action is permanent and cannot be undone.', confirmLabel: 'Delete', danger: true })
                    if (ok) onDelete(comment.id)
                  }}
                  className="comment-delete-btn"
                  title="Delete comment"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              )}
            </div>
            <p className="comment-content">{comment.content}</p>
          </div>

          {/* Action row */}
          <div className="comment-actions">
            <span className="comment-time">{timeAgo(comment.created_at)}</span>

            {/* Vote buttons */}
            <button type="button"
              onClick={() => handleVote('like')}
              className="comment-vote-btn"
              style={{
                background: myVote === 'like' ? 'var(--accent-4)' : 'none',
                color: myVote === 'like' ? 'var(--on-accent-4)' : 'var(--ink)',
              }}
              title="Like"
            >
              <ThumbsUp size={11} strokeWidth={2.5} style={{ color: myVote === 'like' ? 'var(--on-accent-4)' : 'var(--accent-4)' }} />
              {likeCount > 0 && likeCount}
            </button>

            <button type="button"
              onClick={() => handleVote('dislike')}
              className="comment-vote-btn"
              style={{
                background: myVote === 'dislike' ? 'var(--accent-1)' : 'none',
                color: myVote === 'dislike' ? 'var(--on-accent-1)' : 'var(--ink)',
              }}
              title="Dislike"
            >
              <ThumbsDown size={11} strokeWidth={2.5} style={{ color: myVote === 'dislike' ? 'var(--on-accent-1)' : 'var(--accent-1)' }} />
              {dislikeCount > 0 && dislikeCount}
            </button>

            {/* Reaction hover trigger */}
            <div
              ref={triggerRef}
              onMouseEnter={openPopover}
              onMouseLeave={scheduleClose}
              className="comment-react-trigger"
            >
              {myReaction
                ? <span style={{ fontSize: 13 }}>{CUSTOM_REACTIONS.find(r => r.type === myReaction)?.emoji ?? '😀'}</span>
                : <span className="comment-react-label">React</span>
              }
            </div>

            {/* Reaction summary (clickable) */}
            {hasActivity && (
              <button type="button" onClick={() => onOpenActivity?.(comment.id)} className="comment-activity-btn">
                <span>Activity · {activityCount}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reaction popover — portal so it's never clipped by overflow */}
      {popPos && createPortal(
        <div
          className="comment-react-popover"
          style={{ position: 'fixed', top: popPos.top, left: popPos.left }}
          onMouseEnter={() => clearTimeout(closeTimer.current)}
          onMouseLeave={scheduleClose}
        >
          {CUSTOM_REACTIONS.map(r => (
            <button type="button"
              key={r.type}
              onClick={() => handleReact(r.type)}
              title={r.label}
              className={`comment-react-btn${myReaction === r.type ? ' active' : ''}`}
            >
              {r.emoji}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
