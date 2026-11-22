import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { MessageCircle, Send, X, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useProfile } from '../../features/profile/useProfile'
import { useComments, useCreateComment, useDeleteComment } from '../../features/comments/useComments'
import { useCommentVoteDetails } from '../../features/comments/useCommentVotes'
import { useCommentReactionDetails } from '../../features/comments/useCommentReactions'
import { useMyVote, useVoteCounts, useToggleVote } from '../../features/votes/useVotes'
import { useMyReaction, useReactionCounts, useToggleReaction } from '../../features/reactions/useReactions'
import Avatar from '../ui/Avatar'
import CommentItem from './CommentItem'
import ActivityModal, { type ActivityRow } from './ActivityModal'
import ReactionsDetailModal from './ReactionsDetailModal'
import type { BoxWithAuthor, LinkPayload, MediaPayload, MoodPayload, PollPayload, ThreadPayload, ReactionType, VoteType } from '../../types/database'
import { sanitizeUrl } from '../../lib/sanitize'
import { useDialogAccessibility } from '../ui/useDialogAccessibility'

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'loud',  emoji: '❤️', label: 'Love'  },
  { type: 'fire',  emoji: '😆', label: 'Haha'  },
  { type: 'sharp', emoji: '😮', label: 'Wow'   },
  { type: 'save',  emoji: '😢', label: 'Sad'   },
  { type: 'angry', emoji: '😠', label: 'Angry' },
]

function CommentActivityPanel({ commentId, onClose }: { commentId: string; onClose: () => void }) {
  const { data: votes = [],     isLoading: vl } = useCommentVoteDetails(commentId, true)
  const { data: reactions = [], isLoading: rl } = useCommentReactionDetails(commentId, true)

  const likeCount    = votes.filter(v => v.vote === 'like').length
  const dislikeCount = votes.filter(v => v.vote === 'dislike').length

  const mergedMap = new Map<string, ActivityRow>()
  for (const v of votes) mergedMap.set(v.user_id, { userId: v.user_id, displayName: v.profiles.display_name, username: v.profiles.username, avatarUrl: v.profiles.avatar_url, role: v.profiles.role, vote: v.vote as VoteType })
  for (const r of reactions) {
    const ex = mergedMap.get(r.user_id)
    if (ex) ex.reaction = r.reaction_type as ReactionType
    else mergedMap.set(r.user_id, { userId: r.user_id, displayName: r.profiles.display_name, username: r.profiles.username, avatarUrl: r.profiles.avatar_url, role: r.profiles.role, reaction: r.reaction_type as ReactionType })
  }

  return (
    <ActivityModal
      allRows={Array.from(mergedMap.values())}
      likeRows={votes.map(v => ({ userId: v.user_id, displayName: v.profiles.display_name, username: v.profiles.username, avatarUrl: v.profiles.avatar_url, role: v.profiles.role, vote: v.vote as VoteType }))}
      reactionRows={reactions.map(r => ({ userId: r.user_id, displayName: r.profiles.display_name, username: r.profiles.username, avatarUrl: r.profiles.avatar_url, role: r.profiles.role, reaction: r.reaction_type as ReactionType }))}
      likeCount={likeCount}
      dislikeCount={dislikeCount}
      isLoading={vl || rl}
      onClose={onClose}
    />
  )
}

const MOOD_BG: Record<MoodPayload['color'], string> = {
  m1: '#ff5a5f',
  m2: '#4cc9f0',
  m3: '#c77dff',
  m4: '#6ee7b7',
  m5: '#ffd23f',
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function CompactSavedBox({ box }: { box: BoxWithAuthor }) {
  const payload = box.payload as unknown

  return (
    <div className="saved-modal-box">
      <div className="saved-modal-author">
        <Link to={`/profile/${box.author.username}`} className="saved-modal-author-link">
          <Avatar name={box.author.display_name} src={box.author.avatar_url} size="sm" />
          <span>
            <strong>{box.author.display_name}</strong>
            <small>@{box.author.username} · {timeAgo(box.published_at)}</small>
          </span>
        </Link>
      </div>

      {box.content && box.type !== 'mood' && (
        <p className="saved-modal-text">{box.content}</p>
      )}

      {box.type === 'mood' && (
        <div className="saved-modal-mood" style={{ background: MOOD_BG[((payload as MoodPayload)?.color ?? 'm1')] }}>
          {box.content}
        </div>
      )}

      {box.type === 'media' && (payload as MediaPayload)?.url && (
        <div className="saved-modal-media">
          {(payload as MediaPayload).kind === 'image'
            ? <img src={(payload as MediaPayload).url} alt={(payload as MediaPayload).caption ?? ''} width="720" height="480" loading="lazy" />
            : <iframe src={(payload as MediaPayload).url} title="Saved media" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" />
          }
        </div>
      )}

      {box.type === 'link' && (payload as LinkPayload)?.url && (
        <a className="saved-modal-link" href={sanitizeUrl((payload as LinkPayload).url) || '#'} target="_blank" rel="noopener noreferrer">
          {(payload as LinkPayload).thumbnail && <img src={sanitizeUrl((payload as LinkPayload).thumbnail ?? '') || undefined} alt="" width="160" height="120" loading="lazy" />}
          <span>
            <strong>{(payload as LinkPayload).title ?? (payload as LinkPayload).url}</strong>
            {(payload as LinkPayload).host && <small>{(payload as LinkPayload).host}</small>}
          </span>
        </a>
      )}

      {box.type === 'poll' && (payload as PollPayload)?.options && (
        <div className="saved-modal-list">
          {(payload as PollPayload).options.slice(0, 4).map((option) => (
            <span key={option.text}>{option.text}</span>
          ))}
        </div>
      )}

      {box.type === 'thread' && (payload as ThreadPayload)?.items && (
        <div className="saved-modal-list">
          {(payload as ThreadPayload).items.slice(0, 4).map((item, index) => (
            <span key={item || String(index)}>{index + 1}. {item}</span>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  box: BoxWithAuthor
  onClose: () => void
}

export default function SavedPostModal({ box, onClose }: Props) {
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const { data: comments = [], isLoading } = useComments(box.id)
  const createComment = useCreateComment(box.id)
  const deleteComment = useDeleteComment(box.id)
  const [text, setText] = useState('')
  const [activityCommentId, setActivityCommentId] = useState<string | null>(null)
  const [boxActivityOpen, setBoxActivityOpen] = useState(false)
  const [reactOpen, setReactOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const reactBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useDialogAccessibility({ dialogRef: panelRef, onClose })

  // Box vote + reaction hooks
  const { data: myVote }        = useMyVote(box.id, user?.id)
  const { data: voteCounts }    = useVoteCounts(box.id)
  const { data: myReaction }    = useMyReaction(box.id, user?.id)
  const { data: reactCounts }   = useReactionCounts(box.id)
  const toggleVote              = useToggleVote(box.id)
  const toggleReaction          = useToggleReaction(box.id)

  const likeCount     = voteCounts?.like    ?? 0
  const dislikeCount  = voteCounts?.dislike ?? 0
  const totalActivity = likeCount + dislikeCount + (reactCounts ? Object.values(reactCounts).reduce((s, n) => s + n, 0) : 0)
  const activeReaction = REACTIONS.find(r => r.type === myReaction)

  function handleVote(vote: VoteType) {
    if (!user) return
    toggleVote.mutate({ userId: user.id, vote, current: myVote ?? null })
  }
  function handleReact(type: ReactionType) {
    if (!user) return
    toggleReaction.mutate({ userId: user.id, type, current: myReaction ?? null })
    setReactOpen(false)
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleSend() {
    if (!user || !text.trim()) return
    await createComment.mutateAsync({ authorId: user.id, content: text.trim() })
    setText('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {createPortal(
        <div className="saved-post-modal-overlay" onClick={onClose}>
          <div
            ref={panelRef}
            className="saved-post-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="saved-post-modal-head">
              <h2 id={titleId}>Saved Post</h2>
              <button type="button" onClick={onClose} aria-label="Close">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <CompactSavedBox box={box} />

            <div className="saved-post-comments-head">
              <MessageCircle size={16} strokeWidth={2.5} />
              <span>Comments · {comments.length}</span>

              {/* ── Green area: box vote + reaction ── */}
              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
                  <button
                    type="button"
                    title="Like"
                    aria-pressed={myVote === 'like'}
                    onClick={() => handleVote('like')}
                    className="saved-vote-btn"
                    style={{
                      background: myVote === 'like' ? 'var(--accent-4)' : 'none',
                      color: myVote === 'like' ? 'var(--on-accent-4)' : 'var(--ink)',
                    }}
                  >
                    <ThumbsUp size={12} strokeWidth={2.5} style={{ color: myVote === 'like' ? 'var(--on-accent-4)' : 'var(--accent-4)' }} />
                    {likeCount > 0 && likeCount}
                  </button>
                  <button
                    type="button"
                    title="Dislike"
                    aria-pressed={myVote === 'dislike'}
                    onClick={() => handleVote('dislike')}
                    className="saved-vote-btn"
                    style={{
                      background: myVote === 'dislike' ? 'var(--accent-1)' : 'none',
                      color: myVote === 'dislike' ? 'var(--on-accent-1)' : 'var(--ink)',
                    }}
                  >
                    <ThumbsDown size={12} strokeWidth={2.5} style={{ color: myVote === 'dislike' ? 'var(--on-accent-1)' : 'var(--accent-1)' }} />
                    {dislikeCount > 0 && dislikeCount}
                  </button>
                  <div style={{ position: 'relative' }}>
                    <button
                      ref={reactBtnRef}
                      type="button"
                      onClick={() => setReactOpen(o => !o)}
                      aria-expanded={reactOpen}
                      aria-label={activeReaction ? `Reaction: ${activeReaction.label}` : 'Choose reaction'}
                      className="saved-react-trigger-btn"
                      style={{ fontSize: activeReaction ? 16 : 11 }}
                    >
                      {activeReaction ? activeReaction.emoji : 'React'}
                    </button>
                    {reactOpen && (
                      <div className="saved-react-popover" role="group" aria-label="Reactions">
                        {REACTIONS.map(r => (
                          <button
                            key={r.type}
                            type="button"
                            title={r.label}
                            aria-label={r.label}
                            aria-pressed={myReaction === r.type}
                            onClick={() => handleReact(r.type)}
                            className={`saved-react-option${myReaction === r.type ? ' active' : ''}`}
                          >
                            {r.emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Blue area: box activity ── */}
              <button
                type="button"
                onClick={() => setBoxActivityOpen(true)}
                className="saved-activity-btn"
              >
                Activity · {totalActivity}
              </button>
            </div>

            <div ref={listRef} className="saved-post-comments">
              {isLoading && <div className="saved-post-empty">Loading comments…</div>}
              {!isLoading && comments.length === 0 && <div className="saved-post-empty">No comments yet.</div>}
              {comments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onDelete={user?.id === comment.author_id ? (id) => deleteComment.mutate(id) : undefined}
                  onOpenActivity={(id) => setActivityCommentId(id)}
                />
              ))}
            </div>

            <div className="saved-post-composer">
              {user && <Avatar name={profile?.display_name ?? user.email ?? 'U'} src={profile?.avatar_url} size="sm" />}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!user}
                rows={1}
                placeholder={user ? 'Write a comment…' : 'Sign in to comment…'}
                aria-label="Comment"
              />
              <button type="button" onClick={handleSend} disabled={!user || !text.trim() || createComment.isPending} aria-label="Send comment">
                <Send size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {activityCommentId && (
        <CommentActivityPanel
          commentId={activityCommentId}
          onClose={() => setActivityCommentId(null)}
        />
      )}
      {boxActivityOpen && (
        <ReactionsDetailModal
          boxId={box.id}
          onClose={() => setBoxActivityOpen(false)}
        />
      )}
    </>
  )
}
