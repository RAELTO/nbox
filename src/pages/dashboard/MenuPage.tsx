import { Link, useNavigate } from 'react-router-dom'
import { Bookmark, ChevronRight, Search, UsersRound } from 'lucide-react'
import AppShell from '../../components/layout/AppShell'
import Avatar from '../../components/ui/Avatar'
import { useAuth } from '../../features/auth/AuthContext'
import { useProfile } from '../../features/profile/useProfile'

const MENU_ITEMS = [
  { to: '/groups',   label: 'Groups',        description: 'Communities, member approvals, and posts.', Icon: UsersRound },
  { to: '/saves',    label: 'Saved',        description: 'Posts you saved for later.',                Icon: Bookmark },
  { to: '/contacts', label: 'Find friends',  description: 'Requests, suggestions, and contacts.',     Icon: Search   },
] as const

export default function MenuPage() {
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const navigate = useNavigate()

  return (
    <AppShell>
      <section className="mobile-menu-page">
        <Link className="mobile-menu-profile panel" to="/my-box">
          <Avatar
            name={profile?.display_name ?? user?.email ?? 'U'}
            src={profile?.avatar_url}
            size="md"
          />
          <span>
            <strong>{profile?.display_name ?? user?.email}</strong>
            <small>@{profile?.username ?? 'profile'}</small>
          </span>
          <ChevronRight size={20} strokeWidth={2.5} />
        </Link>

        <div className="mobile-menu-list">
          {MENU_ITEMS.map(({ to, label, description, Icon }) => (
            <button
              key={to}
              type="button"
              className="mobile-menu-item panel"
              onClick={() => navigate(to)}
            >
              <Icon size={24} strokeWidth={2.5} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          ))}

        </div>
      </section>
    </AppShell>
  )
}
