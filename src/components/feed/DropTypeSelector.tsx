import type { BoxType } from '../../types/database'
import { DROP_TYPES } from './DropModalConfig'

interface DropTypeSelectorProps {
  value: BoxType
  onChange: (type: BoxType) => void
}

export default function DropTypeSelector({ value, onChange }: DropTypeSelectorProps) {
  return (
    <div>
      <div className="drop-field-label">Box type</div>
      <div className="drop-type-grid">
        {DROP_TYPES.map(({ id, label, Icon, bg }) => {
          const selected = value === id
          return (
            <button
              type="button"
              key={id}
              onClick={() => onChange(id)}
              className="drop-type-card"
              aria-pressed={selected}
              style={{
                background: selected ? 'var(--ink)' : bg,
                color: selected ? 'var(--bg-panel)' : 'var(--ink)',
                boxShadow: selected ? '6px 6px 0 var(--ink)' : '2px 2px 0 var(--ink)',
              }}
            >
              <Icon size={28} strokeWidth={2} />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
