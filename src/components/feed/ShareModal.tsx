import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Share2, Link, MessageCircle, Users, Smartphone, Check, ChevronDown } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useCreateBox } from '../../features/boxes/useBoxes'
import { useRecordShare } from '../../features/shares/useShares'
import { useToast } from '../ui/Toast'
import { useDialogAccessibility } from '../ui/useDialogAccessibility'

interface Props {
  boxId: string
  boxContent: string
  onClose: () => void
}

export default function ShareModal({ boxId, boxContent, onClose }: Props) {
  const { user } = useAuth()
  const toast = useToast()
  const createBox = useCreateBox()
  const recordShare = useRecordShare(boxId)

  const [feedOpen, setFeedOpen] = useState(false)
  const [feedText, setFeedText] = useState('')
  const [copied, setCopied] = useState(false)
  const [posting, setPosting] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogAccessibility({ dialogRef: panelRef, onClose })

  const shareUrl = `${window.location.origin}/box/${boxId}`

  async function handleFeedShare() {
    if (!user) { toast('Sign in to share.'); return }
    setPosting(true)
    try {
      await createBox.mutateAsync({
        author_id: user.id,
        type: 'quick',
        content: feedText.trim() || 'Shared a drop',
        payload: { shared_from_id: boxId },
      })
      await recordShare.mutateAsync({ userId: user.id, shareType: 'feed' })
      toast('Shared to your feed.')
      onClose()
    } catch { toast('Failed to share.') }
    finally { setPosting(false) }
  }

  async function handleWhatsApp() {
    const text = encodeURIComponent(`${boxContent.slice(0, 100)}…\n\n${shareUrl}`)
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
    if (user) await recordShare.mutateAsync({ userId: user.id, shareType: 'whatsapp' }).catch(() => {})
    onClose()
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    if (user) await recordShare.mutateAsync({ userId: user.id, shareType: 'link' }).catch(() => {})
    setTimeout(() => { setCopied(false); onClose() }, 1500)
  }

  function handleComingSoon(label: string) {
    toast(`${label}: coming soon`)
    onClose()
  }

  const options = [
    {
      id: 'feed',
      icon: <Share2 size={20} strokeWidth={2} />,
      label: 'Share to Feed',
      desc: 'Share this drop with a comment',
      accent: 'var(--accent-2)',
      action: () => setFeedOpen(o => !o),
    },
    {
      id: 'whatsapp',
      icon: <Smartphone size={20} strokeWidth={2} />,
      label: 'WhatsApp',
      desc: 'Send the link through WhatsApp',
      accent: '#25D366',
      action: handleWhatsApp,
    },
    {
      id: 'link',
      icon: copied ? <Check size={20} strokeWidth={2.5} /> : <Link size={20} strokeWidth={2} />,
      label: copied ? 'Link copied!' : 'Copy link',
      desc: shareUrl,
      accent: copied ? 'var(--accent-4)' : 'var(--accent-3)',
      action: handleCopyLink,
    },
    {
      id: 'contact',
      icon: <MessageCircle size={20} strokeWidth={2} />,
      label: 'Send to contact',
      desc: 'Send directly to a contact',
      accent: 'var(--accent-5)',
      action: () => handleComingSoon('Send to contact'),
    },
    {
      id: 'group',
      icon: <Users size={20} strokeWidth={2} />,
      label: 'Share to group',
      desc: 'Share to a group you belong to',
      accent: 'var(--accent-3)',
      action: () => handleComingSoon('Share to group'),
    },
  ]

  return createPortal(
    <div
      className="share-modal-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="share-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="share-header">
          <span id={titleId} className="share-title">SHARE</span>
          <button type="button" onClick={onClose} className="modal-close-btn" aria-label="Close share dialog">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {options.map((opt, i) => (
          <div key={opt.id}>
            <button type="button"
              onClick={opt.action}
              className="share-option-btn"
              style={{ borderBottom: i < options.length - 1 || feedOpen ? '2px solid var(--ink)' : 'none' }}
            >
              <div className="share-option-icon" style={{ background: opt.accent }}>
                {opt.icon}
              </div>
              <div className="share-option-body">
                <div className="share-option-label" aria-live={opt.id === 'link' ? 'polite' : undefined}>{opt.label}</div>
                <div className="share-option-desc">{opt.desc}</div>
              </div>
              {opt.id === 'feed' && (
                <span className="share-option-chevron" style={{ transform: feedOpen ? 'rotate(180deg)' : 'none' }}>
                  <ChevronDown size={15} strokeWidth={2.8} aria-hidden="true" />
                </span>
              )}
            </button>

            {opt.id === 'feed' && feedOpen && (
              <div className="share-compose-area">
                <textarea
                  value={feedText}
                  onChange={e => setFeedText(e.target.value)}
                  placeholder="Add a comment… (optional)"
                  aria-label="Comment for shared drop"
                  rows={3}
                  className="share-compose-textarea"
                />
                <div className="share-compose-footer">
                  <button type="button" onClick={handleFeedShare} disabled={posting} className="share-compose-submit">
                    {posting ? 'Posting…' : 'Drop'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}
