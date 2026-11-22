import { z } from 'zod'
import { sanitizeUrl } from './sanitize'

function plainText(min: number, max: number) {
  return z.string().trim().min(min).max(max).refine(
    value => !/[<>]/.test(value) && !/[^\P{Cc}\n\r\t]/u.test(value),
    'Enter plain text',
  )
}

export const safeHttpUrlSchema = z.string().transform((value, ctx) => {
  const url = sanitizeUrl(value)
  if (url) return url
  ctx.addIssue({ code: 'custom', message: 'Enter a valid HTTP or HTTPS URL' })
  return z.NEVER
})

export const profileLinkSchema = z.strictObject({
  label: plainText(1, 40),
  url: z.string().max(300).pipe(safeHttpUrlSchema).pipe(z.string().max(300)),
})

export const profileLinksArraySchema = z.array(profileLinkSchema).max(5)

const hexColorPattern = /^#[0-9a-f]{6}$/
const hexColorMessage = 'Use a 6-digit hex color like #ff5a5f'

export const hexColorSchema = z.string().trim().toLowerCase().regex(hexColorPattern, hexColorMessage)
export const themePaletteIdSchema = z.enum(['coral', 'electric', 'lime', 'dusk', 'dark', 'custom'])
export const themeModeSchema = z.enum(['light', 'dark'])
export const themeShadowSchema = z.enum(['low', 'medium', 'high'])

// Persisted theme colors must already be in the same canonical format as the database.
const storedHexColor = z.string().regex(hexColorPattern, hexColorMessage)

function themeObject<Shape extends Record<string, z.ZodType>>(shape: Shape) {
  // Check raw own keys because a parser can discard a JSON "__proto__" key before validation.
  return z.custom<Record<string, unknown>>(value => {
    if (typeof value !== 'object' || value === null) return false
    const prototype = Object.getPrototypeOf(value)
    return (prototype === Object.prototype || prototype === null)
      && Reflect.ownKeys(value).every(key => Object.hasOwn(shape, key))
  }, 'Use only supported theme fields').pipe(z.strictObject(shape))
}

const themeCustomColorsSchema = themeObject({
  bg: storedHexColor.optional(),
  bg_alt: storedHexColor.optional(),
  bg_panel: storedHexColor.optional(),
  ink: storedHexColor.optional(),
  line: storedHexColor.optional(),
  shadow_color: storedHexColor.optional(),
  accent_1: storedHexColor.optional(),
  accent_2: storedHexColor.optional(),
  accent_3: storedHexColor.optional(),
  accent_4: storedHexColor.optional(),
  accent_5: storedHexColor.optional(),
})

export const userThemeConfigSchema = themeObject({
  version: z.literal(1),
  palette: themePaletteIdSchema,
  mode: themeModeSchema,
  shadow: themeShadowSchema,
  overrides: themeObject({
    coral: themeCustomColorsSchema.optional(),
    electric: themeCustomColorsSchema.optional(),
    lime: themeCustomColorsSchema.optional(),
    dusk: themeCustomColorsSchema.optional(),
    dark: themeCustomColorsSchema.optional(),
    custom: themeCustomColorsSchema.optional(),
  }).optional(),
}).refine(cfg => new TextEncoder().encode(JSON.stringify(cfg)).length <= 4096, 'Theme config exceeds 4 KB limit')

export const profileUpdateSchema = z.strictObject({
  display_name: plainText(2, 100).optional(),
  username: z.string().trim().min(3).max(30).regex(/^[a-z0-9_]+$/).optional(),
  bio: plainText(0, 500).optional(),
  avatar_url: safeHttpUrlSchema.nullable().optional(),
  pinned_box_id: z.uuid().nullable().optional(),
  links: profileLinksArraySchema.optional(),
  theme_config: userThemeConfigSchema.nullable().optional(),
  voice_notes_enabled: z.boolean().optional(),
})

export const groupNameSchema = plainText(1, 80)

export const createGroupSchema = z.strictObject({
  name: groupNameSchema,
  memberIds: z.array(z.uuid()).min(2).max(49).refine(
    ids => new Set(ids).size === ids.length,
    'Select distinct contacts',
  ),
  clientRequestId: z.uuid(),
})

export const groupTextMessageSchema = plainText(1, 4000)
export const boxContentSchema = plainText(1, 10000)
export const commentContentSchema = plainText(1, 2000)

export const storyCaptionSchema = plainText(1, 280)
export const socialGroupNameSchema = plainText(2, 80)
export const socialGroupDescriptionSchema = plainText(0, 500)
export const socialGroupJoinMessageSchema = plainText(0, 240)
