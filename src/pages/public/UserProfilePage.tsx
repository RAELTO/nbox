import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bookmark, Image, Lock, Settings2, UserMinus, UserPlus } from 'lucide-react'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import Avatar from '../../components/ui/Avatar'
import AdminBadge from '../../components/ui/AdminBadge'
import BoxCard from '../../components/feed/BoxCard'
import ProfileTabs, { type ProfileTabKey } from '../../components/profile/ProfileTabs'
import PinnedBoxBanner from '../../components/profile/PinnedBoxBanner'
import ProfileAboutPanel from '../../components/profile/ProfileAboutPanel'
import { useAuth } from '../../features/auth/AuthContext'
import { usePinBox, useProfileByUsername, usePublishedBoxCount } from '../../features/profile/useProfile'
import { useBoxesByAuthor, useDeleteBox } from '../../features/boxes/useBoxes'
import { useFollowCounts, useFollowingIds, useToggleFollow } from '../../features/follows/useFollows'
import { useSavedBoxes } from '../../features/saves/useBoxSaves'
import { useToast } from '../../components/ui/Toast'
import { sanitizeUrl } from '../../lib/sanitize'
import type { MediaPayload } from '../../types/database'

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { user } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('boxes')

  const { data: profile, isLoading: loadingProfile } = useProfileByUsername(username)
  const { data: boxes = [], isLoading: loadingBoxes } = useBoxesByAuthor(profile?.id)
  const { data: boxCount, isLoading: loadingBoxCount } = usePublishedBoxCount(profile?.id)
  const { data: followCounts, isLoading: loadingFollowCounts } = useFollowCounts(profile?.id)
  const { data: followingIds = [], isLoading: loadingFollowing } = useFollowingIds(user?.id)
  const isOwn = !!user && !!profile && user.id === profile.id
  const { data: savedItems = [], isLoading: loadingSaves } = useSavedBoxes(
    profile?.id,
    isOwn && activeTab === 'saves',
  )
  const deleteBox = useDeleteBox()
  const toggleFollow = useToggleFollow(user?.id)
  const pinBox = usePinBox(user?.id)

  const isFollowing = !!profile && followingIds.includes(profile.id)

  const pinnedBox = profile?.pinned_box_id
    ? boxes.find(b => b.id === profile.pinned_box_id) ?? null
    : null
  const regularBoxes = pinnedBox
    ? boxes.filter(b => b.id !== pinnedBox.id)
    : boxes
  const mediaBoxes = boxes.filter(b => b.type === 'media')

  function handleDelete(id: string) {
    deleteBox.mutate(id, {
      onSuccess: () => toast('Box deleted.'),
      onError: () => toast('Failed to delete.'),
    })
  }

  async function handleTogglePin(boxId: string | null) {
    try {
      await pinBox.mutateAsync(boxId)
      toast(boxId ? 'Box pinned to your profile.' : 'Box unpinned from your profile.')
    } catch {
      toast('Could not update pinned box.')
    }
  }

  async function handleFollow() {
    if (!profile) return
    try {
      const nextFollowing = await toggleFollow.mutateAsync({ profileId: profile.id, isFollowing })
      toast(nextFollowing ? `Following ${profile.display_name}.` : `Unfollowed ${profile.display_name}.`)
    } catch {
      toast('Could not update this follow.')
    }
  }

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      {loadingProfile ? (
        <div className="spinner">
          <div className="spinner-ring" />
          <span className="spinner-label">Loading profile…</span>
        </div>
      ) : !profile ? (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>
            User not found
          </div>
          <div className="text-mute text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
            @{username} does not exist on NBOX.
          </div>
        </div>
      ) : profile.is_banned ? (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>
            Account suspended
          </div>
          <div className="text-mute text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
            This profile is not available.
          </div>
        </div>
      ) : (
        <>
          <div className="profile-cover mb-4" />
          <div className="profile-header-row">
            <Avatar
              name={profile.display_name}
              src={profile.avatar_url}
              size="lg"
            />
            <div className="profile-identity-col">
              <div className="profile-display-heading">
                {profile.display_name}
                {profile.role === 'admin' && <AdminBadge />}
              </div>
              <div className="text-mute profile-username-line">
                @{profile.username}
              </div>
            </div>
            <div className="profile-primary-action">
              {isOwn ? (
                <Link to="/my-box" className="btn" style={{ gap: 6, textDecoration: 'none' }}>
                  <Settings2 size={15} strokeWidth={2.5} aria-hidden="true" /> Edit profile
                </Link>
              ) : (
                <button
                  type="button"
                  className={`profile-follow-btn${isFollowing ? ' is-following' : ''}`}
                  aria-pressed={isFollowing}
                  data-testid="profile-follow-button"
                  disabled={loadingFollowing || toggleFollow.isPending}
                  onClick={handleFollow}
                >
                  {isFollowing
                    ? <UserMinus size={17} strokeWidth={3} aria-hidden="true" />
                    : <UserPlus size={17} strokeWidth={3} aria-hidden="true" />
                  }
                  {toggleFollow.isPending ? 'Updating…' : isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          </div>

          <div className="profile-social-stats" aria-label="Profile statistics">
            <div className="profile-social-stat">
              <strong>{loadingBoxCount ? '—' : boxCount ?? 0}</strong>
              <span>Drops</span>
            </div>
            <div className="profile-social-stat">
              <strong>{loadingFollowCounts ? '—' : followCounts?.followers ?? 0}</strong>
              <span>Followers</span>
            </div>
            <div className="profile-social-stat">
              <strong>{loadingFollowCounts ? '—' : followCounts?.following ?? 0}</strong>
              <span>Following</span>
            </div>
          </div>

          {profile.bio && (
            <div className="panel profile-bio-panel">
              <div className="profile-bio-label">Bio</div>
              <p className="profile-bio-text">{profile.bio}</p>
            </div>
          )}

          <ProfileTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            counts={{
              boxes: boxes.length,
              media: mediaBoxes.length,
              saves: isOwn && activeTab === 'saves' ? savedItems.length : undefined,
              links: profile.links.length,
            }}
          />

          <div
            role="tabpanel"
            aria-labelledby={`profile-tab-${activeTab}`}
            tabIndex={0}
            className="profile-tabpanel"
          >
            {activeTab === 'boxes' && (
              <>
                {loadingBoxes && (
                  <div className="spinner">
                    <div className="spinner-ring" />
                    <span className="spinner-label">Loading drops…</span>
                  </div>
                )}

                {!loadingBoxes && boxes.length === 0 && (
                  <div className="panel profile-empty-panel">
                    <div className="profile-empty-title">No drops yet</div>
                    <div className="profile-empty-copy">
                      {isOwn ? 'Drop your first box from the feed.' : 'This user has not dropped anything yet.'}
                    </div>
                  </div>
                )}

                {!loadingBoxes && pinnedBox && (
                  <PinnedBoxBanner
                    box={pinnedBox}
                    isOwn={isOwn}
                    isPending={pinBox.isPending}
                    onUnpin={() => void handleTogglePin(null)}
                    onDelete={isOwn ? handleDelete : undefined}
                  />
                )}

                {regularBoxes.map(box => (
                  <BoxCard
                    key={box.id}
                    box={box}
                    isPinned={false}
                    onTogglePin={isOwn ? id => void handleTogglePin(id) : undefined}
                    onDelete={isOwn ? handleDelete : undefined}
                  />
                ))}
              </>
            )}

            {activeTab === 'media' && (
              <>
                {loadingBoxes ? (
                  <div className="spinner">
                    <div className="spinner-ring" />
                    <span className="spinner-label">Loading media…</span>
                  </div>
                ) : mediaBoxes.length === 0 ? (
                  <div className="panel profile-empty-panel">
                    <Image size={32} strokeWidth={2.3} aria-hidden="true" className="profile-empty-icon" />
                    <div className="profile-empty-title">No media drops yet</div>
                    <div className="profile-empty-copy">
                      {isOwn ? 'Image and video boxes you drop will appear here.' : 'No media drops have been posted yet.'}
                    </div>
                  </div>
                ) : (
                  <div className="profile-media-grid">
                    {mediaBoxes.map(box => {
                      const payload = box.payload as unknown as MediaPayload
                      const safeMediaUrl = payload?.url ? sanitizeUrl(payload.url) : ''
                      return (
                        <Link key={box.id} to={`/box/${box.id}`} className="panel profile-media-tile">
                          {payload?.kind === 'image' && safeMediaUrl ? (
                            <img src={safeMediaUrl} alt={payload.caption || box.content || 'Media drop'} loading="lazy" />
                          ) : (
                            <div className="profile-media-video-badge">
                              <Image size={24} strokeWidth={2.5} aria-hidden="true" />
                              <span>VIDEO DROP</span>
                            </div>
                          )}
                          <div className="profile-media-caption">
                            <span>{box.content || payload?.caption || 'View media drop'}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {activeTab === 'saves' && (
              !isOwn ? (
                <div className="panel profile-empty-panel">
                  <Lock size={32} strokeWidth={2.4} aria-hidden="true" className="profile-empty-icon" />
                  <div className="profile-empty-title">Saved drops are private</div>
                  <div className="profile-empty-copy">
                    Only @{profile.username} can view their saved collection.
                  </div>
                </div>
              ) : loadingSaves ? (
                <div className="spinner">
                  <div className="spinner-ring" />
                  <span className="spinner-label">Loading saved drops…</span>
                </div>
              ) : savedItems.length === 0 ? (
                <div className="panel profile-empty-panel">
                  <Bookmark size={32} strokeWidth={2.4} aria-hidden="true" className="profile-empty-icon" />
                  <div className="profile-empty-title">No saved drops yet</div>
                  <div className="profile-empty-copy">
                    Save boxes from your feed to keep them handy here and in Saved.
                  </div>
                  <Link to="/saves" className="btn btn-small btn-primary" style={{ marginTop: 14 }}>
                    Open Saved
                  </Link>
                </div>
              ) : (
                <div className="profile-saves-stack">
                  <div className="profile-saves-bar">
                    <span>{savedItems.length} saved {savedItems.length === 1 ? 'drop' : 'drops'}</span>
                    <Link to="/saves" className="btn btn-small">
                      Manage in Saved
                    </Link>
                  </div>
                  {savedItems.map(item => (
                    <BoxCard key={item.box.id} box={item.box} />
                  ))}
                </div>
              )
            )}

            {activeTab === 'about' && (
              <ProfileAboutPanel profile={profile} isOwn={isOwn} />
            )}
          </div>
        </>
      )}
    </AppShell>
  )
}
