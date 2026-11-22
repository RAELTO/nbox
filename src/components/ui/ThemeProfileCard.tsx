import { useId, useRef, useState, useSyncExternalStore } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Palette, RotateCcw } from 'lucide-react'
import { useSaveThemeConfig } from '../../features/profile/useProfile'
import {
  DEFAULT_THEME_CONFIG,
  loadLocalThemeConfig,
  PALETTE_PRESETS,
  resolveEffectivePalette,
  saveLocalThemeConfig,
  subscribeToLocalTheme,
  THEME_ACCENT_SLOTS,
  THEME_SHADOW_LABELS,
  type UserThemeConfig,
} from '../../lib/theme'
import AppearanceModal from './AppearanceModal'
import { useToast } from './Toast'

export default function ThemeProfileCard({ userId, themeConfig }: { userId: string; themeConfig: UserThemeConfig | null }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const toast = useToast()
  const saveTheme = useSaveThemeConfig(userId)
  const saving = useIsMutating({ mutationKey: ['profile', 'theme-config', userId] }) > 0
  const config = useSyncExternalStore(subscribeToLocalTheme, loadLocalThemeConfig, () => DEFAULT_THEME_CONFIG)
  const effective = resolveEffectivePalette(config)
  const synced = JSON.stringify(config) === JSON.stringify(themeConfig ?? DEFAULT_THEME_CONFIG)

  async function reset() {
    try {
      await saveTheme.mutateAsync(null)
      saveLocalThemeConfig(DEFAULT_THEME_CONFIG)
      toast('Theme reset to default.')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reset your theme. Try again.')
    }
  }

  return (
    <section className="panel voice-global-setting theme-profile-card" aria-labelledby={titleId}>
      <div className="voice-global-copy">
        <h2 id={titleId}>Appearance</h2>
        <p>
          {PALETTE_PRESETS[config.palette].label} · {config.mode === 'dark' ? 'Dark' : 'Light'} · {THEME_SHADOW_LABELS[config.shadow]} shadows
        </p>
        <p>{synced ? 'Synced to profile' : 'Previewing unsaved changes'}</p>
        <div className="theme-profile-swatches" aria-hidden="true">
          {THEME_ACCENT_SLOTS.map(slot => (
            <span className="theme-profile-swatch" style={{ background: effective[slot] }} key={slot} />
          ))}
        </div>
      </div>
      <div className="theme-profile-actions">
        <button
          type="button"
          className="btn btn-primary btn-small"
          ref={anchorRef}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={saving}
          onClick={() => setOpen(true)}
        >
          <Palette size={16} aria-hidden="true" />
          Customize theme
        </button>
        <button type="button" className="btn btn-small" disabled={saving} onClick={() => void reset()}>
          <RotateCcw size={16} aria-hidden="true" />
          {saveTheme.isPending ? 'Resetting…' : 'Reset default'}
        </button>
      </div>
      {open && <AppearanceModal onClose={() => setOpen(false)} anchorRef={anchorRef} />}
    </section>
  )
}
