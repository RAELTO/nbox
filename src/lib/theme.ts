import {
  hexColorSchema,
  themeModeSchema,
  themePaletteIdSchema,
  themeShadowSchema,
  userThemeConfigSchema,
} from './validation'

export type ThemePaletteId = 'coral' | 'electric' | 'lime' | 'dusk' | 'dark' | 'custom'
type ThemeMode = 'light' | 'dark'
type ThemeShadow = 'low' | 'medium' | 'high'
export type ThemeColorSlot = 'bg' | 'bg_alt' | 'bg_panel' | 'ink' | 'line' | 'shadow_color'
  | 'accent_1' | 'accent_2' | 'accent_3' | 'accent_4' | 'accent_5'

type ThemeCustomColors = Partial<Record<ThemeColorSlot, string>>

export interface UserThemeConfig {
  version: 1
  palette: ThemePaletteId
  mode: ThemeMode
  shadow: ThemeShadow
  overrides?: Partial<Record<ThemePaletteId, ThemeCustomColors>>
}

export const DEFAULT_THEME_CONFIG: UserThemeConfig = {
  version: 1, palette: 'coral', mode: 'light', shadow: 'medium',
}

export const THEME_ACCENT_SLOTS = ['accent_1', 'accent_2', 'accent_3', 'accent_4', 'accent_5'] as const
export const THEME_SHADOW_LABELS: Record<ThemeShadow, string> = {
  low: 'Soft', medium: 'Normal', high: 'Brutal',
}

const lightSurfaces = {
  bg: '#f5f0e6', bg_alt: '#ffe8c8', bg_panel: '#ffffff',
  ink: '#111111', line: '#111111', shadow_color: '#111111',
}
const darkSurfaces = {
  bg: '#121316', bg_alt: '#191b20', bg_panel: '#1d2026',
  ink: '#e5e7eb', line: '#737885', shadow_color: '#3a3e49',
}
const coralColors = {
  ...lightSurfaces,
  accent_1: '#ff5a5f', accent_2: '#ffd23f', accent_3: '#4cc9f0', accent_4: '#6ee7b7', accent_5: '#c77dff',
}

interface PalettePreset {
  id: ThemePaletteId
  label: string
  defaultMode: ThemeMode
  colors: Record<ThemeColorSlot, string>
}

export const PALETTE_PRESETS: Record<ThemePaletteId, PalettePreset> = {
  coral: { id: 'coral', label: 'Coral', defaultMode: 'light', colors: coralColors },
  electric: {
    id: 'electric', label: 'Electric', defaultMode: 'light',
    colors: {
      ...lightSurfaces, bg_alt: '#e8f6ff',
      accent_1: '#ff4dd2', accent_2: '#00e5ff', accent_3: '#ffde59', accent_4: '#00ffb3', accent_5: '#ff79c6',
    },
  },
  lime: {
    id: 'lime', label: 'Lime', defaultMode: 'light',
    colors: {
      ...lightSurfaces, bg_alt: '#e9ffc8',
      accent_1: '#a6ff00', accent_2: '#ff00aa', accent_3: '#00e5ff', accent_4: '#ccff00', accent_5: '#ff00ff',
    },
  },
  dusk: {
    id: 'dusk', label: 'Dusk', defaultMode: 'light',
    colors: {
      ...lightSurfaces, bg_alt: '#ffe0d0',
      accent_1: '#c77dff', accent_2: '#ffb400', accent_3: '#4cc9f0', accent_4: '#ff9966', accent_5: '#e040fb',
    },
  },
  dark: {
    id: 'dark', label: 'Dark', defaultMode: 'dark',
    colors: {
      ...darkSurfaces,
      accent_1: '#ff6b70', accent_2: '#f5ca4b', accent_3: '#56c4e8', accent_4: '#5ce08a', accent_5: '#c49bff',
    },
  },
  custom: { id: 'custom', label: 'Custom', defaultMode: 'light', colors: coralColors },
}

type AccentInkVariable = `--on-accent-${1 | 2 | 3 | 4 | 5}`
type EffectivePalette = Record<ThemeColorSlot | AccentInkVariable | '--ink-dim' | '--ink-mute', string>

const cssVariables = {
  bg: '--bg', bg_alt: '--bg-alt', bg_panel: '--bg-panel',
  ink: '--ink', line: '--line', shadow_color: '--shadow-color',
  accent_1: '--accent-1', accent_2: '--accent-2', accent_3: '--accent-3',
  accent_4: '--accent-4', accent_5: '--accent-5',
  '--ink-dim': '--ink-dim', '--ink-mute': '--ink-mute',
  '--on-accent-1': '--on-accent-1', '--on-accent-2': '--on-accent-2',
  '--on-accent-3': '--on-accent-3', '--on-accent-4': '--on-accent-4', '--on-accent-5': '--on-accent-5',
} satisfies Record<keyof EffectivePalette, string>

function clamp(value: number, max: number) {
  return Math.min(max, Math.max(0, value))
}

function hexToRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(channel => Math.round(clamp(channel, 255)).toString(16).padStart(2, '0')).join('')
}

function mixHex(a: string, b: string, weightA: number) {
  const first = hexToRgb(a)
  const second = hexToRgb(b)
  const weight = clamp(weightA, 1)
  return rgbToHex(
    first.r * weight + second.r * (1 - weight),
    first.g * weight + second.g * (1 - weight),
    first.b * weight + second.b * (1 - weight),
  )
}

export function hexToHsv(hex: string) {
  const rgb = hexToRgb(hex)
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255]
  const max = Math.max(r, g, b)
  const range = max - Math.min(r, g, b)
  let hue = 0

  if (range > 0) {
    if (max === r) hue = (g - b) / range
    else if (max === g) hue = 2 + (b - r) / range
    else hue = 4 + (r - g) / range
  }

  return { h: (hue * 60 + 360) % 360, s: max === 0 ? 0 : range / max * 100, v: max * 100 }
}

export function hsvToHex(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360 / 60
  const brightness = clamp(v, 100) / 100
  const chroma = brightness * clamp(s, 100) / 100
  const intermediate = chroma * (1 - Math.abs(hue % 2 - 1))
  const offset = brightness - chroma
  const [r, g, b] = [
    [chroma, intermediate, 0],
    [intermediate, chroma, 0],
    [0, chroma, intermediate],
    [0, intermediate, chroma],
    [intermediate, 0, chroma],
    [chroma, 0, intermediate],
  ][Math.floor(hue)]
  return rgbToHex((r + offset) * 255, (g + offset) * 255, (b + offset) * 255)
}

function getRelativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const linearize = (channel: number) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function getContrastRatio(hexA: string, hexB: string) {
  const a = getRelativeLuminance(hexA)
  const b = getRelativeLuminance(hexB)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function pickAccessibleMute(ink: string, panel: string) {
  for (const weight of [0.64, 0.72, 0.8, 0.88, 1]) {
    const candidate = mixHex(ink, panel, weight)
    if (getContrastRatio(candidate, panel) >= 4.7) return candidate
  }
  return ink
}

export function getContrastingInk(bgHex: string) {
  return getContrastRatio(bgHex, '#111111') >= getContrastRatio(bgHex, '#f5f5f7') ? '#111111' : '#f5f5f7'
}

function ownField(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function sanitizeThemeConfig(raw: unknown): UserThemeConfig {
  const parsed = userThemeConfigSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  const palette = themePaletteIdSchema.safeParse(ownField(raw, 'palette')).data ?? DEFAULT_THEME_CONFIG.palette
  const mode = themeModeSchema.safeParse(ownField(raw, 'mode')).data ?? PALETTE_PRESETS[palette].defaultMode
  const shadow = themeShadowSchema.safeParse(ownField(raw, 'shadow')).data
    ?? themeShadowSchema.safeParse(ownField(raw, 'effectsIntensity')).data
    ?? DEFAULT_THEME_CONFIG.shadow

  const overrides: UserThemeConfig['overrides'] = {}
  const rawOverrides = ownField(raw, 'overrides')
  for (const id of themePaletteIdSchema.options) {
    const rawColors = ownField(rawOverrides, id)
    if (!rawColors) continue
    const colors: ThemeCustomColors = {}
    for (const slot of Object.keys(PALETTE_PRESETS[id].colors) as ThemeColorSlot[]) {
      const color = ownField(rawColors, slot)
      if (typeof color === 'string' && /^#[0-9a-f]{6}$/.test(color)) colors[slot] = color
    }
    if (Object.keys(colors).length > 0) overrides[id] = colors
  }

  return userThemeConfigSchema.safeParse({
    version: 1, palette, mode, shadow, ...(Object.keys(overrides).length ? { overrides } : {}),
  }).data ?? DEFAULT_THEME_CONFIG
}

export function resolveEffectivePalette(config: UserThemeConfig): EffectivePalette {
  const preset = config.palette === 'custom'
    ? PALETTE_PRESETS[config.mode === 'dark' ? 'dark' : 'coral']
    : PALETTE_PRESETS[config.palette]
  const colors = {
    ...preset.colors,
    ...(preset.defaultMode !== config.mode ? (config.mode === 'dark' ? darkSurfaces : lightSurfaces) : {}),
    ...config.overrides?.[config.palette],
  }
  return {
    ...colors,
    '--ink-dim': mixHex(colors.ink, colors.bg_panel, 0.76),
    '--ink-mute': pickAccessibleMute(colors.ink, colors.bg_panel),
    '--on-accent-1': getContrastingInk(colors.accent_1),
    '--on-accent-2': getContrastingInk(colors.accent_2),
    '--on-accent-3': getContrastingInk(colors.accent_3),
    '--on-accent-4': getContrastingInk(colors.accent_4),
    '--on-accent-5': getContrastingInk(colors.accent_5),
  }
}

function updateThemeFavicon(colors: Pick<EffectivePalette, 'accent_1' | 'ink' | 'line'>) {
  if (typeof document === 'undefined') return
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  const { accent_1: accent, ink, line } = colors
  if (!link || ![accent, ink, line].every(color => /^#[0-9a-f]{6}$/.test(color))) return

  const svg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="28" height="28" fill="${line}"/>
  <rect x="1" y="1" width="28" height="28" fill="${accent}" stroke="${line}" stroke-width="1.5"/>
  <text x="15" y="23" font-family="'Archivo Black','Arial Black',sans-serif" font-size="17" font-weight="900" fill="${ink}" text-anchor="middle">NB</text>
</svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  if (link.getAttribute('href') !== url) link.href = url
}

export function applyThemeToDocument(config: UserThemeConfig) {
  if (typeof document === 'undefined') return
  const safe = sanitizeThemeConfig(config)
  const effective = resolveEffectivePalette(safe)
  const root = document.documentElement
  root.dataset.palette = safe.palette
  root.dataset.themeMode = safe.mode
  root.dataset.shadow = safe.shadow

  for (const slot of Object.keys(cssVariables) as (keyof EffectivePalette)[]) {
    root.style.setProperty(cssVariables[slot], effective[slot])
  }
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', effective.bg)
  updateThemeFavicon(effective)
}

const storageKey = 'nbox:tweaks'
const themeListeners = new Set<() => void>()
let localConfig = DEFAULT_THEME_CONFIG
let storedTheme: string | null | undefined

export function loadLocalThemeConfig(): UserThemeConfig {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw !== storedTheme) {
      storedTheme = raw
      try {
        localConfig = raw === null ? DEFAULT_THEME_CONFIG : sanitizeThemeConfig(JSON.parse(raw))
      } catch {
        localConfig = DEFAULT_THEME_CONFIG
      }
    }
  } catch {
    // Keep the current session preview if browser storage is restricted.
  }
  return localConfig
}

export function subscribeToLocalTheme(onChange: () => void) {
  themeListeners.add(onChange)
  return () => { themeListeners.delete(onChange) }
}

export function saveLocalThemeConfig(config: UserThemeConfig) {
  const safe = sanitizeThemeConfig(config)
  const serialized = JSON.stringify(safe)
  loadLocalThemeConfig()
  localConfig = safe
  try {
    localStorage.setItem(storageKey, serialized)
    storedTheme = serialized
  } catch {
    // Keep the preview available for this session if browser storage is restricted.
  }
  applyThemeToDocument(safe)
  themeListeners.forEach(onChange => onChange())
}

export function updatePaletteOverrideColor(config: UserThemeConfig, slot: ThemeColorSlot, hex: string): UserThemeConfig {
  const color = hexColorSchema.safeParse(hex)
  if (!color.success || !Object.hasOwn(PALETTE_PRESETS[config.palette].colors, slot)) return config
  return {
    ...config,
    overrides: {
      ...config.overrides,
      [config.palette]: { ...config.overrides?.[config.palette], [slot]: color.data },
    },
  }
}

export function resetPaletteOverrides(config: UserThemeConfig, paletteId: ThemePaletteId): UserThemeConfig {
  const overrides = { ...config.overrides }
  delete overrides[paletteId]
  const next = { ...config }
  if (Object.keys(overrides).length) next.overrides = overrides
  else delete next.overrides
  return next
}
