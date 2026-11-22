import { lazy, Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { useBoxFeed, useDeleteBox, useSearchBoxes, type FeedMode } from '../../features/boxes/useBoxes'
import { useBoxEngagement } from '../../features/boxes/useBoxEngagement'
import { groupStoriesByAuthor, useActiveStories } from '../../features/stories/useStories'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import StoriesRail from '../../components/feed/StoriesRail'
import ComposerCard from '../../components/feed/ComposerCard'
import ModeSelector from '../../components/feed/ModeSelector'
import BoxCard from '../../components/feed/BoxCard'
import SearchPeopleResults from '../../components/search/SearchPeopleResults'
import { useToast } from '../../components/ui/Toast'
import type { BoxType } from '../../types/database'

const DropModal = lazy(() => import('../../components/feed/DropModal'))
const CreateStoryModal = lazy(() => import('../../components/feed/CreateStoryModal'))
const StoryViewerModal = lazy(() => import('../../components/feed/StoryViewerModal'))

function EmptyFeed({ mode }: { mode: FeedMode }) {
  return (
    <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
      <div className="mp mp-gif" style={{ height: 100, maxWidth: 200, margin: '0 auto 20px', borderBottom: 'none' }} />
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.02em', marginBottom: 8 }}>
        {mode === 'following' ? "You aren't following anyone yet" : 'No boxes yet'}
      </div>
      <div className="text-mute text-sm">
        {mode === 'following'
          ? 'Go to Explore to find people dropping interesting boxes.'
          : 'Be the first to drop something loud.'}
      </div>
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<FeedMode>('foryou')
  const [dropOpen, setDropOpen] = useState<BoxType | null>(null)
  const [createStoryOpen, setCreateStoryOpen] = useState(false)
  const [viewerGroupIndex, setViewerGroupIndex] = useState<number | null>(null)
  const toast = useToast()
  const searchQuery = (searchParams.get('q') ?? '').trim()
  const hasSearch = searchQuery.length >= 2

  const storiesQuery = useActiveStories(user?.id)
  const storyGroups = useMemo(
    () => groupStoriesByAuthor(storiesQuery.data ?? [], user?.id),
    [storiesQuery.data, user?.id],
  )
  const feedQuery = useBoxFeed(mode, user?.id)
  const searchBoxesQuery = useSearchBoxes(searchQuery)
  const boxes = hasSearch ? searchBoxesQuery.data : feedQuery.data
  const isLoading = hasSearch ? searchBoxesQuery.isLoading : feedQuery.isLoading
  const isError = hasSearch ? searchBoxesQuery.isError : feedQuery.isError
  const engagementQuery = useBoxEngagement((boxes ?? []).map((box) => box.id), user?.id)
  const deleteBox = useDeleteBox()

  function openDrop(type: BoxType = 'quick') {
    if (!user) { toast('Sign in to drop.'); return }
    setDropOpen(type)
  }

  function handleDelete(id: string) {
    deleteBox.mutate(id, {
      onSuccess: () => toast('Box deleted.'),
      onError:   () => toast('Failed to delete.'),
    })
  }

  return (
    <>
      <AppShell
        left={<LeftSidebar />}
        right={<RightSidebar />}
        onDropClick={() => openDrop('quick')}
      >
        {!hasSearch && (
          <>
            <StoriesRail
              groups={storyGroups}
              currentUserId={user?.id}
              isLoading={storiesQuery.isLoading}
              onCreateStory={() => {
                if (!user) { toast('Sign in to post a story.'); return }
                setCreateStoryOpen(true)
              }}
              onOpenGroup={index => setViewerGroupIndex(index)}
            />
            <ComposerCard onOpenModal={openDrop} />
            <ModeSelector value={mode} onChange={setMode} />
          </>
        )}

        {hasSearch && user?.id && (
          <>
            <div className="search-results-title panel">
              <div>
                <div className="search-results-label">Search results</div>
                <h1>{searchQuery}</h1>
              </div>
            </div>
            <SearchPeopleResults query={searchQuery} userId={user.id} />
            <h2 className="search-posts-title">Posts</h2>
          </>
        )}

        {isLoading && (
          <div className="spinner">
            <div className="spinner-ring" />
            <span className="spinner-label">▒ Loading boxes…</span>
          </div>
        )}

        {isError && (
          <div className="panel" style={{ padding: 40, textAlign: 'center', color: 'var(--accent-1)', fontWeight: 700 }}>
            ⚠ Failed to load the feed. Try again.
          </div>
        )}

        {!isLoading && !isError && (boxes ?? []).length === 0 && !hasSearch && (
          <EmptyFeed mode={mode} />
        )}

        {!isLoading && !isError && (boxes ?? []).length === 0 && hasSearch && (
          <div className="panel" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>NO POSTS FOUND</div>
            <div className="text-sm text-mute mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
              Try another name, username, tag, or keyword.
            </div>
          </div>
        )}

        {(boxes ?? []).map(box => (
          <BoxCard
            key={box.id}
            box={box}
            engagement={engagementQuery.data[box.id]}
            onDelete={user?.id === box.author_id ? handleDelete : undefined}
          />
        ))}
      </AppShell>

      {dropOpen && (
        <Suspense fallback={null}>
          <DropModal
            initialType={dropOpen}
            onClose={() => setDropOpen(null)}
          />
        </Suspense>
      )}

      {createStoryOpen && (
        <Suspense fallback={null}>
          <CreateStoryModal onClose={() => setCreateStoryOpen(false)} />
        </Suspense>
      )}

      {viewerGroupIndex !== null && storyGroups.length > 0 && (
        <Suspense fallback={null}>
          <StoryViewerModal
            groups={storyGroups}
            initialGroupIndex={viewerGroupIndex}
            currentUserId={user?.id}
            onClose={() => setViewerGroupIndex(null)}
          />
        </Suspense>
      )}
    </>
  )
}
