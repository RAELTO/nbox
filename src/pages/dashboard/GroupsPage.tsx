import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe, Lock, Plus, Search, ShieldCheck, UsersRound } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import {
  mapSocialGroupError,
  type SocialGroupSummary,
  useCancelGroupJoinRequest,
  useJoinOrRequestSocialGroup,
  useSocialGroups,
} from '../../features/groups/useSocialGroups'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import { useToast } from '../../components/ui/Toast'

const CreateSocialGroupModal = lazy(() => import('../../components/groups/CreateSocialGroupModal'))

type GroupsTab = 'all' | 'mine' | 'discover'

export default function GroupsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<GroupsTab>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const groupsQuery = useSocialGroups(user?.id)
  const joinOrRequest = useJoinOrRequestSocialGroup()
  const cancelRequest = useCancelGroupJoinRequest()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (groupsQuery.data ?? []).filter(group => {
      if (tab === 'mine' && !group.my_role) return false
      if (tab === 'discover' && group.my_role) return false
      if (!q) return true
      return group.name.toLowerCase().includes(q) || group.description.toLowerCase().includes(q)
    })
  }, [groupsQuery.data, search, tab])

  async function handleJoinAction(group: SocialGroupSummary) {
    try {
      if (group.has_pending_request) {
        await cancelRequest.mutateAsync(group.id)
        toast(`Cancelled request for ${group.name}.`)
        return
      }
      const res = await joinOrRequest.mutateAsync({ groupId: group.id })
      if (res.status === 'joined') {
        toast(`Joined ${group.name}.`)
      } else if (res.status === 'requested') {
        toast(`Join request sent to ${group.name}.`)
      }
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      <section className="social-groups-page">
        <header className="social-groups-head panel">
          <div>
            <h1>NBOX · GROUPS</h1>
            <p className="social-groups-sub">
              Community hubs with public or private feeds, moderators, and member approvals.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} strokeWidth={3} aria-hidden="true" />
            <span>Create group</span>
          </button>
        </header>

        <div className="social-groups-controls">
          <div className="social-groups-tabs" role="tablist" aria-label="Groups filter">
            {([
              ['all', 'All groups'],
              ['mine', 'My groups'],
              ['discover', 'Discover'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`profile-tab${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="group-search-input-wrap social-groups-search">
            <Search size={15} strokeWidth={2.6} aria-hidden="true" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search communities…"
              aria-label="Search community groups"
            />
          </div>
        </div>

        {groupsQuery.isLoading ? (
          <div className="spinner">
            <div className="spinner-ring" />
            <span className="spinner-label">Loading groups…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel profile-empty-panel">
            <UsersRound size={32} strokeWidth={2.4} aria-hidden="true" className="profile-empty-icon" />
            <div className="profile-empty-title">No community groups found</div>
            <div className="profile-empty-copy">
              {search ? 'Try another search term.' : 'Create the first NBOX community group.'}
            </div>
          </div>
        ) : (
          <div className="social-groups-grid">
            {filtered.map(group => (
              <article key={group.id} className="panel social-group-card-tile">
                <div className={`social-group-tile-banner story-bg-${group.accent_color}`}>
                  <span className="group-meta-chip">
                    {group.visibility === 'private' ? <Lock size={11} /> : <Globe size={11} />}
                    {group.visibility === 'private' ? 'PRIVATE' : 'PUBLIC'}
                  </span>
                  <span className="group-meta-chip">
                    <ShieldCheck size={11} />
                    {group.join_policy === 'approval' ? 'APPROVAL' : 'OPEN JOIN'}
                  </span>
                </div>

                <div className="social-group-tile-body">
                  <Link to={`/groups/${group.slug}`} className="social-group-tile-title">
                    {group.name}
                  </Link>
                  <p className="social-group-tile-desc">
                    {group.description || 'Community discussions and drops on NBOX.'}
                  </p>
                  <div className="social-group-tile-foot">
                    <span className="social-group-tile-count">
                      <UsersRound size={13} strokeWidth={2.5} aria-hidden="true" />
                      {group.active_member_count} {group.active_member_count === 1 ? 'member' : 'members'}
                    </span>

                    {group.my_status === 'banned' ? (
                      <span className="group-meta-chip danger">BANNED</span>
                    ) : group.my_role ? (
                      <Link to={`/groups/${group.slug}`} className="btn btn-small">
                        Open group
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={`btn btn-small${group.has_pending_request ? '' : ' btn-primary'}`}
                        disabled={joinOrRequest.isPending || cancelRequest.isPending}
                        onClick={() => void handleJoinAction(group)}
                      >
                        {group.has_pending_request
                          ? 'Cancel request'
                          : group.join_policy === 'approval'
                            ? 'Request to join'
                            : 'Join group'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {createOpen && (
        <Suspense fallback={null}>
          <CreateSocialGroupModal
            onClose={() => setCreateOpen(false)}
            onCreated={slug => {
              setCreateOpen(false)
              navigate(`/groups/${slug}`)
            }}
          />
        </Suspense>
      )}
    </AppShell>
  )
}
