import type {
  BoxWithAuthor,
  LinkPayload,
  MediaPayload,
  MoodPayload,
  PollPayload,
  ThreadPayload,
} from '../../types/database'
import { sanitizeUrl } from '../../lib/sanitize'
import PollBoxContent from './PollBoxContent'

const MOOD_BACKGROUND: Record<MoodPayload['color'], string> = {
  m1: '#ff5a5f',
  m2: '#4cc9f0',
  m3: '#c77dff',
  m4: '#6ee7b7',
  m5: '#ffd23f',
}

interface BoxContentProps {
  box: BoxWithAuthor
  pollVoteCounts: Record<number, number>
  selectedPollOption: number | null
  isPollVotePending: boolean
  onPollSelect: (optionIndex: number) => void
}

export default function BoxContent({
  box,
  pollVoteCounts,
  selectedPollOption,
  isPollVotePending,
  onPollSelect,
}: BoxContentProps) {
  if (box.type === 'media') {
    const payload = box.payload as unknown as MediaPayload
    if (!payload?.url) return null

    if (payload.kind === 'video') {
      return (
        <div className="box-media-wrap">
          <iframe
            src={payload.url}
            title="Video player"
            className="box-media-iframe"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
          />
        </div>
      )
    }

    return (
      <div className="box-media-wrap">
        <img src={sanitizeUrl(payload.url) || undefined} alt={payload.caption ?? ''} className="box-media-img" />
      </div>
    )
  }

  if (box.type === 'mood') {
    const payload = box.payload as unknown as MoodPayload
    return (
      <div className="mood-block" style={{ background: MOOD_BACKGROUND[payload?.color ?? 'm1'] }}>
        <p>{box.content}</p>
      </div>
    )
  }

  if (box.type === 'poll') {
    const payload = box.payload as unknown as PollPayload
    if (!payload?.options?.length) return null

    return (
      <PollBoxContent
        poll={payload}
        counts={pollVoteCounts}
        selectedOption={selectedPollOption}
        isPending={isPollVotePending}
        onSelect={onPollSelect}
      />
    )
  }

  if (box.type === 'thread') {
    const payload = box.payload as unknown as ThreadPayload
    if (!payload?.items?.length) return null

    return (
      <div className="thread-wrap">
        {payload.items.map((item, index) => (
          <div key={item} className="thread-item">
            <div className="thread-num">{index + 1}</div>
            <span>{item}</span>
          </div>
        ))}
      </div>
    )
  }

  if (box.type === 'link') {
    const payload = box.payload as unknown as LinkPayload
    if (!payload?.url) return null

    return (
      <div className="link-card">
        {payload.thumbnail && <img src={sanitizeUrl(payload.thumbnail) || undefined} alt="" className="link-thumb" />}
        <div className="link-info">
          {payload.host && <div className="link-host">{payload.host}</div>}
          <a href={sanitizeUrl(payload.url) || '#'} target="_blank" rel="noopener noreferrer" className="link-title">
            {payload.title ?? payload.url}
          </a>
          {payload.description && <div className="box-link-desc">{payload.description}</div>}
        </div>
      </div>
    )
  }

  return null
}
