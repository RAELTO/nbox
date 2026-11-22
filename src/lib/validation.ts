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

export const profileUpdateSchema = z.strictObject({
  display_name: plainText(2, 100).optional(),
  username: z.string().trim().min(3).max(30).regex(/^[a-z0-9_]+$/).optional(),
  bio: plainText(0, 500).optional(),
  avatar_url: safeHttpUrlSchema.nullable().optional(),
  pinned_box_id: z.uuid().nullable().optional(),
  links: profileLinksArraySchema.optional(),
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
