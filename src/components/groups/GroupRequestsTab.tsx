import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import {
  mapSocialGroupError,
  type SocialGroupJoinRequestRow,
  useRespondGroupJoinRequest,
} from '../../features/groups/useSocialGroups'
import Avatar from '../ui/Avatar'
import { useToast } from '../ui/Toast'

interface GroupRequestsTabProps {
  groupId: string
  slug: string
  requests: SocialGroupJoinRequestRow[]
  isLoading: boolean
}

export default function GroupRequestsTab({
  groupId,
  slug,
  requests,
  isLoading,
}: GroupRequestsTabProps) {
  const toast = useToast()
  const respond = useRespondGroupJoinRequest(groupId, slug)

  async function handleRespond(requestId: string, approve: boolean, name: string) {
    try {
      await respond.mutateAsync({ requestId, approve })
      toast(approve ? `${name} approved and added to the group.` : `Declined request from ${name}.`)
    } catch (error) {
      toast(mapSocialGroupError(error))
    }
  }

  if (isLoading) {
    return <div className="panel social-group-panel-pad">Loading pending requests…</div>
  }

  if (requests.length === 0) {
    return (
      <div className="panel social-group-panel-pad">
        <div className="profile-empty-title">No pending join requests</div>
        <div className="profile-empty-copy">
          New requests from people wanting to join this group will show up here for approval.
        </div>
      </div>
    )
  }

  return (
    <section className="panel social-group-card">
      <div className="group-section-head">
        <h3>Pending requests ({requests.length})</h3>
      </div>
      <ul className="group-member-list">
        {requests.map(req => (
          <li key={req.id} className="group-member-row social-request-row">
            <Link to={`/profile/${req.user.username}`} className="group-member-identity">
              <Avatar name={req.user.display_name} src={req.user.avatar_url} size="sm" />
              <span className="group-member-copy">
                <strong>{req.user.display_name}</strong>
                <small>@{req.user.username}</small>
                {req.message && <em className="social-request-note">"{req.message}"</em>}
              </span>
            </Link>
            <div className="group-member-actions">
              <button
                type="button"
                className="btn btn-small btn-primary"
                disabled={respond.isPending}
                onClick={() => void handleRespond(req.id, true, req.user.display_name)}
              >
                <Check size={14} strokeWidth={2.8} aria-hidden="true" /> Approve
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={respond.isPending}
                onClick={() => void handleRespond(req.id, false, req.user.display_name)}
              >
                <X size={14} strokeWidth={2.8} aria-hidden="true" /> Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
