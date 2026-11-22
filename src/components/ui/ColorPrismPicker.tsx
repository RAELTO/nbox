import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { getContrastRatio, hexToHsv, hsvToHex } from '../../lib/theme'
import { hexColorSchema } from '../../lib/validation'

interface ColorPrismPickerProps {
  label: string
  value: string
  contrastAgainst?: string
  onChange: (nextHex: string) => void
  idPrefix?: string
}

type Hsv = ReturnType<typeof hexToHsv>

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

function fromHex(hex: string, previous?: Hsv): Hsv {
  const hsv = hexToHsv(hex)
  return {
    h: hsv.s > 0 && hsv.v > 0 ? hsv.h : previous?.h ?? hsv.h,
    s: hsv.v > 0 ? hsv.s : previous?.s ?? hsv.s,
    v: hsv.v,
  }
}

export default function ColorPrismPicker({ label, value, contrastAgainst, onChange, idPrefix }: ColorPrismPickerProps) {
  const uid = useId()
  const titleId = `${idPrefix ?? uid}-title`
  const normalizedHex = hexColorSchema.safeParse(value).data ?? '#111111'
  const [selection, setSelection] = useState(() => ({ hex: normalizedHex, hsv: fromHex(normalizedHex) }))
  const [hexDraft, setHexDraft] = useState<string | null>(null)

  if (selection.hex !== normalizedHex) {
    setSelection({ hex: normalizedHex, hsv: fromHex(normalizedHex, selection.hsv) })
    setHexDraft(null)
  }

  const { hsv } = selection

  function chooseHsv(next: Hsv) {
    const hex = hsvToHex(next.h, next.s, next.v)
    setSelection({ hex, hsv: next })
    setHexDraft(null)
    if (hex !== normalizedHex) onChange(hex)
  }

  function chooseHex(hex: string) {
    setSelection({ hex, hsv: fromHex(hex, hsv) })
    if (hex !== normalizedHex) onChange(hex)
  }

  function choosePoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    chooseHsv({
      ...hsv,
      s: clampPercent((event.clientX - rect.left) / rect.width * 100),
      v: clampPercent((rect.bottom - event.clientY) / rect.height * 100),
    })
  }

  function handleArrows(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2
    const next = { ...hsv }
    switch (event.key) {
      case 'ArrowLeft': next.s -= step; break
      case 'ArrowRight': next.s += step; break
      case 'ArrowDown': next.v -= step; break
      case 'ArrowUp': next.v += step; break
      default: return
    }
    event.preventDefault()
    chooseHsv({ ...next, s: clampPercent(next.s), v: clampPercent(next.v) })
  }

  const contrast = hexColorSchema.safeParse(contrastAgainst)
  const ratio = contrast.success ? getContrastRatio(normalizedHex, contrast.data) : null
  const ContrastIcon = ratio !== null && ratio < 3 ? AlertTriangle : Check

  return (
    <div className="prism-picker" role="group" aria-labelledby={titleId}>
      <div id={titleId} className="field-label">{label}</div>
      <div
        className="prism-sv-area"
        role="slider"
        tabIndex={0}
        aria-label={`${label} saturation and brightness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s)}
        aria-valuetext={`Saturation ${Math.round(hsv.s)}%, Brightness ${Math.round(hsv.v)}%`}
        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)`, touchAction: 'none' }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          choosePoint(event)
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) choosePoint(event)
        }}
        onKeyDown={handleArrows}
      >
        <span className="prism-sv-thumb" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} aria-hidden="true" />
      </div>
      <div className="prism-hue-wrap">
        <input
          type="range"
          min={0}
          max={360}
          value={Math.round(hsv.h)}
          aria-label={`${label} hue`}
          className="prism-hue-slider"
          onChange={event => chooseHsv({ ...hsv, h: event.currentTarget.valueAsNumber })}
        />
      </div>
      <div className="prism-controls-row">
        <input
          type="color"
          className="prism-native-color"
          value={normalizedHex}
          aria-label={`${label} native color picker`}
          onChange={event => {
            setHexDraft(null)
            chooseHex(event.currentTarget.value)
          }}
        />
        <input
          type="text"
          className="prism-hex-input"
          maxLength={7}
          aria-label={`${label} hex value`}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={hexDraft ?? normalizedHex}
          onFocus={event => event.currentTarget.select()}
          onChange={event => {
            const text = event.currentTarget.value
            setHexDraft(text)
            const parsed = hexColorSchema.safeParse(text.startsWith('#') ? text : `#${text}`)
            if (parsed.success) chooseHex(parsed.data)
          }}
          onBlur={() => setHexDraft(null)}
          onKeyDown={event => {
            if (event.key === 'Enter') setHexDraft(null)
          }}
        />
        {ratio !== null && (
          <span className={`prism-contrast-badge${ratio < 3 ? ' is-warn' : ''}`}>
            <ContrastIcon size={14} aria-hidden="true" />
            {`${ratio.toFixed(1)}:1${ratio >= 4.5 ? ' AA' : ratio >= 3 ? ' UI' : ' Low'}`}
          </span>
        )}
      </div>
    </div>
  )
}
