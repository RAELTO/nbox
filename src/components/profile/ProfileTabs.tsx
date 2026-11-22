import { useRef } from 'react'
import { Bookmark, Image, Info, LayoutGrid } from 'lucide-react'

export type ProfileTabKey = 'boxes' | 'media' | 'saves' | 'about'

interface TabSpec {
  key: ProfileTabKey
  label: string
  Icon: typeof LayoutGrid
  count?: number
}

interface ProfileTabsProps {
  activeTab: ProfileTabKey
  onChange: (tab: ProfileTabKey) => void
  counts: {
    boxes: number
    media: number
    saves?: number
    links?: number
  }
}

export default function ProfileTabs({ activeTab, onChange, counts }: ProfileTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const tabs: TabSpec[] = [
    { key: 'boxes', label: 'Boxes', Icon: LayoutGrid, count: counts.boxes },
    { key: 'media', label: 'Media', Icon: Image, count: counts.media },
    { key: 'saves', label: 'Saves', Icon: Bookmark, count: counts.saves },
    { key: 'about', label: 'About', Icon: Info, count: counts.links },
  ]

  function selectByIndex(index: number) {
    const target = tabs[index]
    if (!target) return
    onChange(target.key)
    const el = tabRefs.current[index]
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      selectByIndex((index + 1) % tabs.length)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      selectByIndex((index - 1 + tabs.length) % tabs.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectByIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectByIndex(tabs.length - 1)
    }
  }

  return (
    <div className="profile-tabs-wrap">
      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {tabs.map((tab, index) => {
          const selected = activeTab === tab.key
          const Icon = tab.Icon
          return (
            <button
              key={tab.key}
              ref={el => { tabRefs.current[index] = el }}
              id={`profile-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className="profile-tab"
              onClick={() => {
                onChange(tab.key)
                tabRefs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
              onKeyDown={event => handleKeyDown(event, index)}
            >
              <Icon size={15} strokeWidth={2.7} aria-hidden="true" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className="profile-tab-count">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
