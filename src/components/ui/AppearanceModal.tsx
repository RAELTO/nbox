import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useIsMutating } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { useProfile, useSaveThemeConfig } from '../../features/profile/useProfile'
import {
  DEFAULT_THEME_CONFIG,
  getContrastingInk,
  loadLocalThemeConfig,
  PALETTE_PRESETS,
  resetPaletteOverrides,
  resolveEffectivePalette,
  saveLocalThemeConfig,
  subscribeToLocalTheme,
  THEME_ACCENT_SLOTS,
  THEME_SHADOW_LABELS,
  updatePaletteOverrideColor,
  type ThemeColorSlot,
  type ThemePaletteId,
  type UserThemeConfig,
} from '../../lib/theme'
import ColorPrismPicker from './ColorPrismPicker'
import { useDialogAccessibility } from './useDialogAccessibility'
import { useToast } from './Toast'

interface AppearanceModalProps {
  onClose: () => void
  anchorRef?: RefObject<HTMLElement | null>
}

const accentSlots = THEME_ACCENT_SLOTS.map((key, index) => ({ key, label: `Accent ${index + 1}` }))
const surfaceSlots = [
  { key: 'bg', label: 'Canvas' },
  { key: 'bg_alt', label: 'Alt Surface' },
  { key: 'bg_panel', label: 'Panel' },
  { key: 'ink', label: 'Text' },
  { key: 'line', label: 'Border' },
  { key: 'shadow_color', label: 'Shadow' },
] as const
const colorTabs = [
  { id: 'accents', label: 'Accents', slots: accentSlots },
  { id: 'surfaces', label: 'Surfaces', slots: surfaceSlots },
] as const
type ColorTab = typeof colorTabs[number]['id']

export default function AppearanceModal({ onClose, anchorRef }: AppearanceModalProps) {
  const { user } = useAuth()
  const userId = user?.id
  const { data: profile } = useProfile(userId)
  const saveTheme = useSaveThemeConfig(userId)
  const saving = useIsMutating({ mutationKey: ['profile', 'theme-config', userId] }) > 0
  const toast = useToast()
  const config = useSyncExternalStore(subscribeToLocalTheme, loadLocalThemeConfig, () => DEFAULT_THEME_CONFIG)
  const [customizing, setCustomizing] = useState(true)
  const [tab, setTab] = useState<ColorTab>('accents')
  const [activeSlot, setActiveSlot] = useState<ThemeColorSlot>('accent_1')
  const [status, setStatus] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const customizerId = useId()
  useDialogAccessibility({ dialogRef: modalRef, onClose, restoreFocusRef: anchorRef })

  const slots = tab === 'accents' ? accentSlots : surfaceSlots
  const slotLabel = slots.find(slot => slot.key === activeSlot)?.label ?? slots[0].label
  const effective = resolveEffectivePalette(config)
  const contrastTarget = activeSlot.startsWith('accent_')
    ? getContrastingInk(effective[activeSlot])
    : activeSlot === 'bg' || activeSlot === 'bg_alt' || activeSlot === 'bg_panel' ? effective.ink : effective.bg_panel
  const dirty = Boolean(userId && profile && JSON.stringify(config) !== JSON.stringify(profile.theme_config ?? DEFAULT_THEME_CONFIG))

  function preview(next: UserThemeConfig) {
    setStatus('')
    saveLocalThemeConfig(next)
  }

  function choosePalette(palette: ThemePaletteId) {
    if (palette === 'custom') setCustomizing(true)
    if (config.palette === palette) return
    preview({ ...config, palette, mode: palette === 'custom' ? config.mode : PALETTE_PRESETS[palette].defaultMode })
  }

  function chooseTab(next: ColorTab) {
    if (next === tab) return
    setTab(next)
    setActiveSlot(next === 'accents' ? 'accent_1' : 'bg')
  }

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    let next: ColorTab
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        next = tab === 'accents' ? 'surfaces' : 'accents'
        break
      case 'Home': next = 'accents'; break
      case 'End': next = 'surfaces'; break
      default: return
    }
    event.preventDefault()
    chooseTab(next)
    document.getElementById(`${customizerId}-${next}-tab`)?.focus()
  }

  async function save() {
    if (!userId) {
      saveLocalThemeConfig(config)
      toast('Theme saved on this device.')
      return
    }
    setStatus('')
    try {
      await saveTheme.mutateAsync(config)
      toast('Theme saved to your profile.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save your theme. Try again.')
    }
  }

  return createPortal(
    <div className="appearance-overlay">
      <div className="appearance-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        className="appearance-dialog"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appearance-dialog-title"
        tabIndex={-1}
      >
        <header className="appearance-head">
          <h2 className="appearance-title" id="appearance-dialog-title">Appearance</h2>
          {dirty && <span className="appearance-dirty-badge">Unsaved</span>}
          <button type="button" className="modal-close-btn" aria-label="Close appearance dialog" onClick={onClose}>
            <X size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </header>

        <div className="appearance-body" inert={saving}>
          <section className="appearance-section" aria-label="Palettes">
            <div className="field-label">Palette</div>
            <div className="swatch-row">
              {Object.values(PALETTE_PRESETS).map(preset => {
                const selected = config.palette === preset.id
                const mode = selected || preset.id === 'custom' ? config.mode : preset.defaultMode
                const colors = resolveEffectivePalette({ ...config, palette: preset.id, mode })
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`swatch${selected ? ' active' : ''}`}
                    aria-label={`Use ${preset.label} palette`}
                    aria-pressed={selected}
                    title={preset.label}
                    onClick={() => choosePalette(preset.id)}
                  >
                    <span style={{ background: colors.bg_panel }} />
                    {THEME_ACCENT_SLOTS.map(slot => <span key={slot} style={{ background: colors[slot] }} />)}
                  </button>
                )
              })}
            </div>
            <div className="text-xs text-mute mt-2">{PALETTE_PRESETS[config.palette].label}</div>
          </section>

          <div className="appearance-mode-row">
            <div>
              <div className="field-label">Mode</div>
              <div className="seg" role="group" aria-label="Mode">
                {(['light', 'dark'] as const).map(mode => (
                  <button
                    type="button"
                    key={mode}
                    className={mode === config.mode ? 'active' : ''}
                    aria-pressed={mode === config.mode}
                    onClick={() => preview({ ...config, mode })}
                  >
                    {mode === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="field-label">Shadows</div>
              <div className="seg" role="group" aria-label="Shadows">
                {(['low', 'medium', 'high'] as const).map(shadow => (
                  <button
                    type="button"
                    key={shadow}
                    className={shadow === config.shadow ? 'active' : ''}
                    aria-pressed={shadow === config.shadow}
                    onClick={() => preview({ ...config, shadow })}
                  >
                    {THEME_SHADOW_LABELS[shadow]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="appearance-preview-strip" role="group" aria-label="Live theme preview">
            <strong>Preview</strong>
            {accentSlots.map(({ key, label }, index) => (
              <span
                key={key}
                className="appearance-preview-chip"
                style={{ backgroundColor: `var(--accent-${index + 1})`, color: `var(--on-accent-${index + 1})` }}
              >
                {label}
              </span>
            ))}
          </div>

          <section className="appearance-section" aria-label="Customize palette">
            <button
              type="button"
              className="btn btn-small"
              aria-expanded={customizing}
              aria-controls={customizerId}
              onClick={() => setCustomizing(open => !open)}
            >
              Customize palette
            </button>
            <div id={customizerId} hidden={!customizing}>
              {customizing && (
                <>
                  <div className="appearance-token-tabs" role="tablist" aria-label="Color categories" onKeyDown={navigateTabs}>
                    {colorTabs.map(category => (
                      <button
                        type="button"
                        role="tab"
                        key={category.id}
                        id={`${customizerId}-${category.id}-tab`}
                        aria-controls={`${customizerId}-${category.id}-panel`}
                        aria-selected={tab === category.id}
                        tabIndex={tab === category.id ? 0 : -1}
                        onClick={() => chooseTab(category.id)}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                  {colorTabs.map(category => (
                    <div
                      role="tabpanel"
                      key={category.id}
                      id={`${customizerId}-${category.id}-panel`}
                      aria-labelledby={`${customizerId}-${category.id}-tab`}
                      hidden={tab !== category.id}
                    >
                      {tab === category.id && (
                        <div className="appearance-section">
                          <div className="appearance-slot-grid" role="group" aria-label="Theme colors">
                            {slots.map(slot => (
                              <button
                                type="button"
                                key={slot.key}
                                className={`appearance-slot-btn${activeSlot === slot.key ? ' active' : ''}`}
                                aria-pressed={activeSlot === slot.key}
                                onClick={() => setActiveSlot(slot.key)}
                              >
                                <span className="appearance-slot-dot" style={{ background: effective[slot.key] }} aria-hidden="true" />
                                {slot.label}
                              </button>
                            ))}
                          </div>
                          <ColorPrismPicker
                            key={`${config.palette}-${activeSlot}`}
                            label={slotLabel}
                            value={effective[activeSlot]}
                            contrastAgainst={contrastTarget}
                            onChange={hex => preview(updatePaletteOverrideColor(loadLocalThemeConfig(), activeSlot, hex))}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>

        <footer className="appearance-foot">
          {status && <p className="appearance-status-note" role="alert">{status}</p>}
          <button
            type="button"
            className="btn btn-small"
            disabled={saving}
            onClick={() => preview({
              ...resetPaletteOverrides(config, config.palette), mode: PALETTE_PRESETS[config.palette].defaultMode,
            })}
          >
            Reset palette
          </button>
          <button type="button" className="btn btn-primary btn-small" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : userId ? 'Save to profile' : 'Save locally'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
