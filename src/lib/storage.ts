import { supabase } from './supabase'

const BUCKET = 'post-images'

export const IMAGE_LIMITS = {
  cover: { maxBytes: 1 * 1024 * 1024, label: '1 MB' },
  avatar: { maxBytes: 512 * 1024,     label: '500 KB' },
} as const

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export type ImageKind = keyof typeof IMAGE_LIMITS

export interface UploadError {
  type: 'size' | 'format' | 'upload'
  message: string
}

function ext(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
}

export function validateImage(file: File, kind: ImageKind): UploadError | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { type: 'format', message: 'Unsupported format. Use JPG, PNG, WebP, or GIF.' }
  }
  const limit = IMAGE_LIMITS[kind]
  if (file.size > limit.maxBytes) {
    return { type: 'size', message: `The image exceeds the ${limit.label} limit.` }
  }
  return null
}

export async function uploadCoverImage(file: File, userId: string): Promise<string> {
  const err = validateImage(file, 'cover')
  if (err) throw new Error(err.message)
  const path = `${userId}/posts/${Date.now()}.${ext(file)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
  if (error) throw new Error('Failed to upload the image.')
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadStoryImage(file: File, userId: string): Promise<string> {
  const err = validateImage(file, 'cover')
  if (err) throw new Error(err.message)
  const path = `${userId}/stories/${Date.now()}.${ext(file)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
  if (error) throw new Error('Failed to upload the story image.')
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadAvatarImage(file: File, userId: string): Promise<string> {
  const err = validateImage(file, 'avatar')
  if (err) throw new Error(err.message)
  const path = `${userId}/avatar/avatar.${ext(file)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) throw new Error('Failed to upload the avatar.')
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function deleteImage(url: string): Promise<void> {
  try {
    const urlObj = new URL(url)
    const pathStart = urlObj.pathname.indexOf(`/object/public/${BUCKET}/`)
    if (pathStart === -1) return
    const filePath = urlObj.pathname.slice(pathStart + `/object/public/${BUCKET}/`.length)
    await supabase.storage.from(BUCKET).remove([filePath])
  } catch { /* best-effort: ignore if file not found */ }
}
