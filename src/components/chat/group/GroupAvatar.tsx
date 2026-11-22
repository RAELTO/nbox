import { Users } from 'lucide-react'

const GROUP_PAIRS = [
  { background: 'var(--accent-2)', color: 'var(--on-accent-2)' },
  { background: 'var(--accent-3)', color: 'var(--on-accent-3)' },
  { background: 'var(--accent-4)', color: 'var(--on-accent-4)' },
  { background: 'var(--accent-5)', color: 'var(--on-accent-5)' },
  { background: 'var(--accent-1)', color: 'var(--on-accent-1)' },
]

function groupPair(name: string) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return GROUP_PAIRS[Math.abs(hash) % GROUP_PAIRS.length]
}

export default function GroupAvatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      className="sq-avatar group-avatar"
      style={{ width: size, height: size, ...groupPair(name) }}
      aria-hidden="true"
    >
      <Users size={Math.round(size * 0.45)} strokeWidth={2.6} />
    </div>
  )
}
