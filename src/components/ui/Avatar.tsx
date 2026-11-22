import { getInitials } from '../../lib/utils'

const ACCENT_PAIRS = [
  { background: 'var(--accent-1)', color: 'var(--on-accent-1)' },
  { background: 'var(--accent-3)', color: 'var(--on-accent-3)' },
  { background: 'var(--accent-4)', color: 'var(--on-accent-4)' },
  { background: 'var(--accent-5)', color: 'var(--on-accent-5)' },
  { background: 'var(--accent-2)', color: 'var(--on-accent-2)' },
]

function pairFor(name: string) {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return ACCENT_PAIRS[hash % ACCENT_PAIRS.length]
}

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  src?: string | null
}

export default function Avatar({ name, size = 'md', src }: AvatarProps) {
  return (
    <div
      className={`avatar ${size}`}
      style={src ? undefined : pairFor(name)}
    >
      {src
        ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : getInitials(name)
      }
    </div>
  )
}
