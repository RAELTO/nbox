import { Plus } from 'lucide-react'
import { type StoryAuthorGroup } from '../../features/stories/useStories'
import Avatar from '../ui/Avatar'

interface StoriesRailProps {
  groups: StoryAuthorGroup[]
  currentUserId?: string
  isLoading?: boolean
  onCreateStory: () => void
  onOpenGroup: (groupIndex: number) => void
}

export default function StoriesRail({
  groups,
  currentUserId,
  isLoading = false,
  onCreateStory,
  onOpenGroup,
}: StoriesRailProps) {
  return (
    <section className="stories-strip" aria-label="Stories">
      <button
        type="button"
        className="story story-create"
        onClick={onCreateStory}
        title="Post a 24h story"
      >
        <div className="story-create-plus" aria-hidden="true">
          <Plus size={19} strokeWidth={3} />
        </div>
        <div className="story-name">New</div>
      </button>

      {isLoading && (
        <div className="story story-empty-hint" aria-live="polite">
          <div className="story-empty-copy">Loading stories…</div>
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="story story-empty-hint">
          <div className="story-empty-badge">24H</div>
          <div className="story-empty-copy">No active stories yet. Be the first to post!</div>
        </div>
      )}

      {groups.map((group, index) => {
        const latest = group.stories[group.stories.length - 1]
        const isOwn = group.author.id === currentUserId
        const label = isOwn ? 'Your story' : group.author.display_name
        return (
          <button
            key={group.author.id}
            type="button"
            className={`story story-item story-bg-${latest.bg_color}${group.hasUnviewed ? ' unviewed' : ' viewed'}`}
            onClick={() => onOpenGroup(index)}
            aria-label={`View ${label} (${group.stories.length} ${group.stories.length === 1 ? 'story' : 'stories'})`}
          >
            {latest.media_url ? (
              <img
                src={latest.media_url}
                alt={latest.caption ?? `${group.author.display_name}'s story`}
                className="story-thumb-img"
                loading="lazy"
              />
            ) : (
              <div className="story-caption-preview">{latest.caption}</div>
            )}
            <div className="story-avatar-badge">
              <Avatar name={group.author.display_name} src={group.author.avatar_url} size="sm" />
            </div>
            {group.stories.length > 1 && (
              <span className="story-count-badge">{group.stories.length}</span>
            )}
            <div className="story-name">{label}</div>
          </button>
        )
      })}
    </section>
  )
}
