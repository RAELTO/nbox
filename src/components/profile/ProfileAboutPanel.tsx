import { Link } from 'react-router-dom'
import { AtSign, Calendar, ExternalLink, Link2, Settings2 } from 'lucide-react'
import type { Profile } from '../../features/profile/useProfile'
import { sanitizeUrl } from '../../lib/sanitize'
import AdminBadge from '../ui/AdminBadge'

const JOINED_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

interface ProfileAboutPanelProps {
  profile: Profile
  isOwn: boolean
}

function formatJoinedDate(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return JOINED_DATE_FORMAT.format(parsed)
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function ProfileAboutPanel({ profile, isOwn }: ProfileAboutPanelProps) {
  const validLinks = profile.links.reduce<Array<{ label: string; href: string }>>((acc, link) => {
    const href = sanitizeUrl(link.url)
    if (href) acc.push({ label: link.label, href })
    return acc
  }, [])

  return (
    <div className="profile-about-grid">
      <section className="panel profile-about-card">
        <div className="profile-about-head">
          <h2 className="profile-about-title">▸ About @{profile.username}</h2>
          {isOwn && (
            <Link to="/my-box" className="btn btn-small">
              <Settings2 size={14} strokeWidth={2.5} aria-hidden="true" />
              Edit details
            </Link>
          )}
        </div>

        <p className="profile-about-bio">
          {profile.bio?.trim()
            ? profile.bio
            : isOwn
              ? 'No bio added yet. Share who you are from My Box.'
              : 'No bio added yet.'}
        </p>

        <dl className="profile-about-meta">
          <div className="profile-about-meta-item">
            <dt>
              <Calendar size={14} strokeWidth={2.6} aria-hidden="true" />
              Joined
            </dt>
            <dd>{formatJoinedDate(profile.created_at)}</dd>
          </div>
          <div className="profile-about-meta-item">
            <dt>
              <AtSign size={14} strokeWidth={2.6} aria-hidden="true" />
              Handle
            </dt>
            <dd className="profile-about-handle">
              @{profile.username}
              {profile.role === 'admin' && <AdminBadge />}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel profile-about-card">
        <div className="profile-about-head">
          <h3 className="profile-about-title">
            <Link2 size={16} strokeWidth={2.6} aria-hidden="true" />
            Links
          </h3>
          <span className="profile-about-count">{validLinks.length}/5</span>
        </div>

        {validLinks.length === 0 ? (
          <div className="profile-about-empty">
            {isOwn
              ? 'Add up to 5 external links in My Box so people can find your projects.'
              : 'No links shared yet.'}
          </div>
        ) : (
          <ul className="profile-links-list">
            {validLinks.map(link => (
              <li key={`${link.label}:${link.href}`}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-link-item"
                >
                  <span className="profile-link-copy">
                    <strong>{link.label}</strong>
                    <small>{safeDomain(link.href)}</small>
                  </span>
                  <ExternalLink size={16} strokeWidth={2.6} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
