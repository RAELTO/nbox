import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Globe, Lock, LogOut, PinOff, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useDeleteBox } from '../../features/boxes/useBoxes'
import { useBoxEngagement } from '../../features/boxes/useBoxEngagement'
import {
  mapSocialGroupError,
  useCancelGroupJoinRequest,
  useJoinOrRequestSocialGroup,
  useLeaveSocialGroup,
  usePinSocialGroupBox,
  useSocialGroupBoxes,
  useSocialGroupDetail,
  useSocialGroupMembers,
  useSocialGroupRequests,
} from '../../features/groups/useSocialGroups'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import ComposerCard from '../../components/feed/ComposerCard'
import BoxCard from '../../components/feed/BoxCard'
import GroupMembersTab from '../../components/groups/GroupMembersTab'
import GroupRequestsTab from '../../components/groups/GroupRequestsTab'
import GroupSettingsTab from '../../components/groups/GroupSettingsTab'
import { useToast } from '../../components/ui/Toast'
import type { BoxType } from '../../types/database'

const DropModal = lazy(() => import('../../components/feed/DropModal'))

type DetailTab = 'posts' | 'members' | 'requests' | 'settings'

export default function GroupDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState<DetailTab>('posts')
  const [dropOpen, setDropOpen] = useState<BoxType | null>(null)
  const [joinMessage, setJoinMessage] = useState('')

  const groupQuery = useSocialGroupDetail(slug, user?.id)
  const group = groupQuery.data
  const canReadFeed = Boolean(group && (group.visibility === 'public' || group.my_role))
  const isAdmin = group?.my_role === 'admin'
  const isMod = group?.my_role === 'moderator' || isAdmin
  const canPost = Boolean(
    group && group.my_role && (group.post_policy === 'members' || isMod),
  )

  const boxesQuery = useSocialGroupBoxes(group?.id, canReadFeed && activeTab === 'posts')
  const membersQuery = useSocialGroupMembers(group?.id, canReadFeed && activeTab === 'members')
  const requestsQuery = useSocialGroupRequests(group?.id, Boolean(group && isMod && activeTab === 'requests'))
  const engagementQuery = useBoxEngagement((boxesQuery.data ?? []).map(b => b.id), user?.id)

  const joinOrRequest = useJoinOrRequestSocialGroup(slug)
  const cancelRequest = useCancelGroupJoinRequest(slug)
  const leaveGroup = useLeaveSocialGroup(slug)
  const pinBox = usePinSocialGroupBox(group?.id ?? '', slug)
  const deleteBox = useDeleteBox()

  async function handleJoin() {
    if (!group) return
    try {
      const res = await joinOrRequest.mutateAsync({ groupId: group.id, message: joinMessage })
      setJoinMessage('')
      toast(res.status === 'joined' ? `Joined ${group.name}.` : 'Join request submitted.')
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  async function handleLeave() {
    if (!group) return
    try {
      await leaveGroup.mutateAsync(group.id)
      toast(`You left ${group.name}.`)
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  async function handlePin(boxId: string | null) {
    try {
      await pinBox.mutateAsync(boxId)
      toast(boxId ? 'Post pinned in this group.' : 'Post unpinned.')
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  function handleDeleteBox(boxId: string) {
    deleteBox.mutate(boxId, {
      onSuccess: () => toast('Post removed from group.'),
      onError: () => toast('Could not remove post.'),
    })
  }

  if (groupQuery.isLoading) {
    return (
      <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
        <div className="spinner"><div className="spinner-ring" /><span className="spinner-label">Loading community…</span></div>
      </AppShell>
    )
  }

  if (!group) {
    return (
      <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
        <div className="panel social-group-panel-pad">
          <div className="profile-empty-title">Group not found</div>
          <Link to="/groups" className="btn btn-small mt-3"><ArrowLeft size={14} /> Back to groups</Link>
        </div>
      </AppShell>
    )
  }

  const boxes = boxesQuery.data ?? []
  const pinnedBox = group.pinned_box_id ? boxes.find(b => b.id === group.pinned_box_id) ?? null : null
  const regularBoxes = pinnedBox ? boxes.filter(b => b.id !== pinnedBox.id) : boxes

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      <section className="social-groups-page">
        <div className="panel social-group-hero">
          <div className={`social-group-hero-banner story-bg-${group.accent_color}`}>
            <Link to="/groups" className="btn btn-small"><ArrowLeft size={14} strokeWidth={2.7} /> All groups</Link>
            <div className="group-details-badges">
              <span className="group-meta-chip">
                {group.visibility === 'private' ? <Lock size={11} /> : <Globe size={11} />}
                {group.visibility === 'private' ? 'PRIVATE GROUP' : 'PUBLIC GROUP'}
              </span>
              <span className="group-meta-chip">
                <ShieldCheck size={11} />
                {group.join_policy === 'approval' ? 'APPROVAL REQUIRED' : 'OPEN JOIN'}
              </span>
            </div>
          </div>

          <div className="social-group-hero-body">
            <div className="social-group-hero-top">
              <div>
                <h1>{group.name}</h1>
                {group.description && <p className="social-group-hero-desc">{group.description}</p>}
                <div className="social-group-hero-meta">
                  <span><Users size={13} strokeWidth={2.6} /> {group.active_member_count} members</span>
                  <span>{group.post_policy === 'admins_only' ? 'Admins & mods post' : 'Members can post'}</span>
                </div>
              </div>

              <div className="social-group-hero-actions">
                {group.my_status === 'banned' ? (
                  <span className="group-meta-chip danger">BANNED FROM GROUP</span>
                ) : group.my_role ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={leaveGroup.isPending}
                    onClick={() => void handleLeave()}
                  >
                    <LogOut size={14} strokeWidth={2.7} aria-hidden="true" /> Leave
                  </button>
                ) : group.has_pending_request ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={cancelRequest.isPending}
                    onClick={() => void cancelRequest.mutateAsync(group.id)}
                  >
                    Cancel request
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    disabled={joinOrRequest.isPending}
                    onClick={() => void handleJoin()}
                  >
                    {group.join_policy === 'approval' ? 'Request to join' : 'Join group'}
                  </button>
                )}
              </div>
            </div>

            {!group.my_role && group.my_status !== 'banned' && group.join_policy === 'approval' && !group.has_pending_request && (
              <div className="social-join-note-row">
                <input
                  value={joinMessage}
                  maxLength={240}
                  onChange={event => setJoinMessage(event.target.value)}
                  placeholder="Optional note to group admins…"
                  aria-label="Optional note to group admins"
                />
              </div>
            )}
          </div>
        </div>

        {!canReadFeed ? (
          <div className="panel social-group-panel-pad">
            <Lock size={28} strokeWidth={2.5} aria-hidden="true" className="profile-empty-icon" />
            <div className="profile-empty-title">Private community</div>
            <div className="profile-empty-copy">
              {group.has_pending_request
                ? 'Your join request is waiting for an admin or moderator.'
                : 'Request membership above to see posts and members in this group.'}
            </div>
          </div>
        ) : (
          <>
            <div className="profile-tabs-wrap">
              <div className="profile-tabs" role="tablist" aria-label="Group sections">
                <button type="button" role="tab" aria-selected={activeTab === 'posts'} className="profile-tab" onClick={() => setActiveTab('posts')}>
                  Posts <span className="profile-tab-count">{boxes.length}</span>
                </button>
                <button type="button" role="tab" aria-selected={activeTab === 'members'} className="profile-tab" onClick={() => setActiveTab('members')}>
                  Members <span className="profile-tab-count">{group.active_member_count}</span>
                </button>
                {isMod && (
                  <button type="button" role="tab" aria-selected={activeTab === 'requests'} className="profile-tab" onClick={() => setActiveTab('requests')}>
                    Requests
                  </button>
                )}
                {isAdmin && (
                  <button type="button" role="tab" aria-selected={activeTab === 'settings'} className="profile-tab" onClick={() => setActiveTab('settings')}>
                    Settings
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'posts' && (
              <>
                {canPost && <ComposerCard onOpenModal={type => setDropOpen(type)} />}

                {pinnedBox && (
                  <div className="pinned-box-wrap">
                    <div className="pinned-box-header">
                      <span className="pinned-box-badge">PINNED IN {group.name.toUpperCase()}</span>
                      {isMod && (
                        <button type="button" className="pinned-box-unpin" onClick={() => void handlePin(null)}>
                          <PinOff size={13} strokeWidth={2.7} aria-hidden="true" /> Unpin
                        </button>
                      )}
                    </div>
                    <BoxCard
                      box={pinnedBox}
                      engagement={engagementQuery.data[pinnedBox.id]}
                      isPinned
                      onTogglePin={isMod ? () => void handlePin(null) : undefined}
                      onDelete={isMod || user?.id === pinnedBox.author_id ? handleDeleteBox : undefined}
                    />
                  </div>
                )}

                {regularBoxes.length === 0 && !pinnedBox ? (
                  <div className="panel social-group-panel-pad">
                    <div className="profile-empty-title">No group posts yet</div>
                    <div className="profile-empty-copy">
                      {canPost ? 'Drop the first post in this community.' : 'Admins will post updates here soon.'}
                    </div>
                  </div>
                ) : (
                  regularBoxes.map(box => (
                    <BoxCard
                      key={box.id}
                      box={box}
                      engagement={engagementQuery.data[box.id]}
                      isPinned={false}
                      onTogglePin={isMod ? id => void handlePin(id) : undefined}
                      onDelete={isMod || user?.id === box.author_id ? handleDeleteBox : undefined}
                    />
                  ))
                )}
              </>
            )}

            {activeTab === 'members' && (
              <GroupMembersTab
                groupId={group.id}
                slug={group.slug}
                groupName={group.name}
                currentUserId={user?.id ?? ''}
                myRole={group.my_role}
                members={membersQuery.data ?? []}
                isLoading={membersQuery.isLoading}
              />
            )}

            {activeTab === 'requests' && isMod && (
              <GroupRequestsTab
                groupId={group.id}
                slug={group.slug}
                requests={requestsQuery.data ?? []}
                isLoading={requestsQuery.isLoading}
              />
            )}

            {activeTab === 'settings' && isAdmin && (
              <GroupSettingsTab
                key={group.id + group.updated_at}
                group={group}
                onDeleted={() => navigate('/groups')}
              />
            )}
          </>
        )}
      </section>

      {dropOpen && (
        <Suspense fallback={null}>
          <DropModal
            initialType={dropOpen}
            groupId={group.id}
            groupName={group.name}
            onClose={() => setDropOpen(null)}
          />
        </Suspense>
      )}
    </AppShell>
  )
}
