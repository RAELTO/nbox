import { Users } from 'lucide-react'

const GROUP_COLORS = [
  'var(--accent-2)',
  'var(--accent-3)',
  'var(--accent-4)',
  'var(--accent-5)',
  'var(--accent-1)',
]

function groupBg(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]
}

export default function GroupAvatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      className="sq-avatar group-avatar"
      style={{ width: size, height: size, background: groupBg(name) }}
      aria-hidden="true"
    >
      <Users size={Math.round(size * 0.45)} strokeWidth={2.6} />
    </div>
  )
}
