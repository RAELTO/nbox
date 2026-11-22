import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Bookmark, Trash2, MoreHorizontal, Pin, PinOff } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/ConfirmContext'
import { useToggleReaction, useMyReaction, useReactionCounts } from '../../features/reactions/useReactions'
import { useToggleVote, useMyVote, useVoteCounts } from '../../features/votes/useVotes'
import Avatar from '../ui/Avatar'
import AdminBadge from '../ui/AdminBadge'
import { useShareCount } from '../../features/shares/useShares'
import { useIsBoxSaved, useToggleBoxSave } from '../../features/saves/useBoxSaves'
import { usePollVotes, useSelectPollOption } from '../../features/polls/usePollVotes'
import type { BoxEngagement } from '../../features/boxes/useBoxEngagement'
import type { BoxWithAuthor, ReactionType, VoteType } from '../../types/database'
import BoxContent from './BoxContent'
import BoxEngagementBar from './BoxEngagementBar'

const ReactionsDetailModal = lazy(() => import('./ReactionsDetailModal'))
const CommentsModal = lazy(() => import('./CommentsModal'))
const ShareModal = lazy(() => import('./ShareModal'))

// ─── Helpers ────────────────────────────────────────────────────────────────────
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

// ─── Content renderers per box type ────────────────────────────────────────────
// ─── Main component ─────────────────────────────────────────────────────────────
interface BoxCardProps {
  box: BoxWithAuthor
  engagement?: BoxEngagement
  isPinned?: boolean
  onTogglePin?: (boxId: string | null) => void
  onDelete?: (id: string) => void
}

export default function BoxCard({ box, engagement, isPinned = false, onTogglePin, onDelete }: BoxCardProps) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [menuOpen, setMenuOpen]             = useState(false)
  const [reactionDetailOpen, setReactionDetailOpen] = useState(false)
  const [commentsOpen, setCommentsOpen]     = useState(false)
  const [shareOpen, setShareOpen]           = useState(false)
  const useCardQueries = engagement === undefined
  const { data: queriedShareCount = 0 } = useShareCount(box.id, useCardQueries)
  const { data: queriedMyReaction } = useMyReaction(box.id, user?.id, useCardQueries)
  const { data: queriedMyVote } = useMyVote(box.id, user?.id, useCardQueries)
  const { data: queriedIsSaved = false } = useIsBoxSaved(box.id, user?.id, useCardQueries)
  const toggleReaction = useToggleReaction(box.id)
  const toggleVote     = useToggleVote(box.id)
  const toggleSave     = useToggleBoxSave(box.id, user?.id)
  const { data: queriedReactionCounts } = useReactionCounts(box.id, useCardQueries)
  const { data: queriedVoteCounts } = useVoteCounts(box.id, useCardQueries)
  const { data: queriedPollVotes } = usePollVotes(
    box.id,
    user?.id,
    useCardQueries && box.type === 'poll',
  )
  const selectPollOption = useSelectPollOption(box.id)

  const myReaction = engagement?.myReaction ?? queriedMyReaction
  const myVote = engagement?.myVote ?? queriedMyVote
  const isSaved = engagement?.isSaved ?? queriedIsSaved
  const reactionCounts = engagement?.reactionCounts ?? queriedReactionCounts
  const voteCounts = engagement?.voteCounts ?? queriedVoteCounts
  const pollVoteCounts = engagement?.pollVoteCounts ?? queriedPollVotes?.counts ?? {}
  const selectedPollOption = engagement
    ? engagement.myPollVote
    : (queriedPollVotes?.selectedOption ?? null)
  const shareCount = engagement?.shareCount ?? queriedShareCount

  const INTERACTION_TOAST_MESSAGE = 'Sign in to interact with this drop.'

  function handleReact(type: ReactionType) {
    if (!user) { toast(INTERACTION_TOAST_MESSAGE, 5000); return }
    toggleReaction.mutate({ userId: user.id, type, current: myReaction ?? null })
  }

  function handleVote(vote: VoteType) {
    if (!user) { toast(INTERACTION_TOAST_MESSAGE, 5000); return }
    toggleVote.mutate({ userId: user.id, vote, current: myVote ?? null })
  }

  async function handlePollSelect(optionIndex: number) {
    if (!user) {
      toast(INTERACTION_TOAST_MESSAGE, 5000)
      return
    }

    try {
      await selectPollOption.mutateAsync({
        userId: user.id,
        optionIndex,
        current: selectedPollOption,
      })
    } catch {
      toast('Could not update your poll selection.')
    }
  }

  function openComments() {
    if (!user) { toast(INTERACTION_TOAST_MESSAGE, 5000); return }
    setCommentsOpen(true)
  }

  function openShare() {
    if (!user) { toast(INTERACTION_TOAST_MESSAGE, 5000); return }
    setShareOpen(true)
  }

  async function handleSaveAction() {
    if (!user) { toast(INTERACTION_TOAST_MESSAGE, 5000); setMenuOpen(false); return }
    try {
      const saved = await toggleSave.mutateAsync(isSaved)
      toast(saved ? 'Post saved.' : 'Post removed from saved.')
    } catch {
      toast('Could not update saved post.')
    } finally {
      setMenuOpen(false)
    }
  }

  function handlePostNotifications() {
    if (!user) { toast(INTERACTION_TOAST_MESSAGE, 5000); setMenuOpen(false); return }
    toast('Post notifications coming soon.')
    setMenuOpen(false)
  }

  const totalComments = box.comment_count ?? 0
  const isOwner = user?.id === box.author_id

  return (
    <>
      <div className="panel box-card">
        {/* Head */}
        <div className="box-head">
          <Link to={`/profile/${box.author.username}`} className="box-avatar-link">
            <Avatar name={box.author.display_name} src={box.author.avatar_url} size="md" />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="box-head-name">
              {box.author.display_name}
              {box.author.role === 'admin' && <AdminBadge />}
            </div>
            <div className="box-head-meta">@{box.author.username} · {timeAgo(box.published_at)}</div>
          </div>
          <div className="box-options-wrap">
            <button type="button"
              className="box-options-trigger"
              aria-label="Post options"
              onClick={() => setMenuOpen(o => !o)}
            >
              <MoreHorizontal size={18} strokeWidth={2.5} />
            </button>
            {menuOpen && (
              <div className="box-options-menu panel">
                <button
                  type="button"
                  className="box-options-item"
                  onClick={handleSaveAction}
                  disabled={toggleSave.isPending}
                >
                  <Bookmark size={17} strokeWidth={2.5} />
                  <span>
                    <strong>{isSaved ? 'Remove from saved' : 'Save post'}</strong>
                    <small>{isSaved ? 'Remove this post from your saved drops.' : 'Add this post to your saved drops.'}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="box-options-item"
                  onClick={handlePostNotifications}
                >
                  <Bell size={17} strokeWidth={2.5} />
                  <span>
                    <strong>Turn on notifications</strong>
                    <small>Get updates from this post.</small>
                  </span>
                </button>
                {isOwner && onTogglePin && (
                  <button
                    type="button"
                    className="box-options-item"
                    onClick={() => {
                      setMenuOpen(false)
                      onTogglePin(isPinned ? null : box.id)
                    }}
                  >
                    {isPinned
                      ? <PinOff size={17} strokeWidth={2.5} />
                      : <Pin size={17} strokeWidth={2.5} />}
                    <span>
                      <strong>{isPinned ? 'Unpin from profile' : 'Pin to profile'}</strong>
                      <small>{isPinned ? 'Remove this drop from the top of your profile.' : 'Highlight this drop at the top of your profile.'}</small>
                    </span>
                  </button>
                )}
                {isOwner && onDelete && (
                  <button
                    type="button"
                    className="box-options-item danger"
                    onClick={async () => {
                      setMenuOpen(false)
                      const ok = await confirm({ title: 'Delete drop?', message: 'This action is permanent and cannot be undone.', confirmLabel: 'Delete', danger: true })
                      if (ok) onDelete(box.id)
                    }}
                  >
                    <Trash2 size={17} strokeWidth={2.5} />
                    <span>
                      <strong>Delete</strong>
                      <small>This action cannot be undone.</small>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="box-options-cancel"
                  onClick={() => setMenuOpen(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Text body — shown for all types except mood (mood shows text inside block) */}
        {box.type !== 'mood' && box.content && (
          <div className="box-body">
            <Link to={`/box/${box.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <p className="box-text">{box.content}</p>
            </Link>
          </div>
        )}

        {/* Type-specific content */}
        <BoxContent
          box={box}
          pollVoteCounts={pollVoteCounts}
          selectedPollOption={selectedPollOption}
          isPollVotePending={selectPollOption.isPending}
          onPollSelect={handlePollSelect}
        />

        {/* Tags */}
        {(box.tags ?? []).length > 0 && (
          <div className="box-tags-row">
            {(box.tags ?? []).map((t: { id: string; name: string; slug: string }) => (
              <Link key={t.id} to={`/tag/${t.slug}`} className="chip">
                #{t.name}
              </Link>
            ))}
          </div>
        )}

        <BoxEngagementBar
          boxId={box.id}
          isAuthenticated={Boolean(user)}
          myReaction={myReaction}
          myVote={myVote}
          reactionCounts={reactionCounts}
          voteCounts={voteCounts}
          commentCount={totalComments}
          shareCount={shareCount}
          onReact={handleReact}
          onVote={handleVote}
          onRequireAuth={() => toast(INTERACTION_TOAST_MESSAGE, 5000)}
          onOpenReactionDetails={() => setReactionDetailOpen(true)}
          onOpenCommentStats={() => setCommentsOpen(true)}
          onComment={openComments}
          onShare={openShare}
        />
      </div>

      <Suspense fallback={null}>
        {reactionDetailOpen && (
          <ReactionsDetailModal boxId={box.id} onClose={() => setReactionDetailOpen(false)} />
        )}

        {commentsOpen && (
          <CommentsModal boxId={box.id} onClose={() => setCommentsOpen(false)} />
        )}

        {shareOpen && (
          <ShareModal
            boxId={box.id}
            boxContent={box.content}
            onClose={() => setShareOpen(false)}
          />
        )}
      </Suspense>
    </>
  )
}
