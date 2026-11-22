import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { sanitizeText, sanitizeUrl } from '../../lib/sanitize'
import type { Json } from '../../types/database'

export interface ProfileLink {
  label: string
  url: string
}

export interface Profile {
  id: string
  display_name: string
  username: string
  bio: string | null
  avatar_url: string | null
  role: 'user' | 'admin'
  is_banned: boolean
  voice_notes_enabled?: boolean
  pinned_box_id: string | null
  links: ProfileLink[]
  created_at: string
}

interface ProfileFormData {
  display_name: string
  username: string
  bio: string
  avatar_url: string
  links?: ProfileLink[]
}

function parseProfileLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return []
  const cleaned: ProfileLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as { label?: unknown; url?: unknown }
    const label = typeof candidate.label === 'string' ? sanitizeText(candidate.label).slice(0, 40) : ''
    const url = typeof candidate.url === 'string' ? sanitizeUrl(candidate.url).slice(0, 300) : ''
    if (!label || !url) continue
    cleaned.push({ label, url })
    if (cleaned.length >= 5) break
  }
  return cleaned
}

function normalizeProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    display_name: String(row.display_name ?? ''),
    username: String(row.username ?? ''),
    bio: typeof row.bio === 'string' ? row.bio : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    role: row.role === 'admin' ? 'admin' : 'user',
    is_banned: row.is_banned === true,
    voice_notes_enabled: typeof row.voice_notes_enabled === 'boolean' ? row.voice_notes_enabled : undefined,
    pinned_box_id: typeof row.pinned_box_id === 'string' ? row.pinned_box_id : null,
    links: parseProfileLinks(row.links),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, bio, avatar_url, role, is_banned, voice_notes_enabled, pinned_box_id, links, created_at')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return normalizeProfile(data as unknown as Record<string, unknown>)
    },
    enabled: !!userId,
  })
}

export function useProfileByUsername(username?: string) {
  return useQuery({
    queryKey: ['profile', 'by-username', username?.toLowerCase()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, bio, avatar_url, role, is_banned, pinned_box_id, links, created_at')
        .eq('username', username!.toLowerCase())
        .maybeSingle()
      if (error) throw error
      return data ? normalizeProfile(data as unknown as Record<string, unknown>) : null
    },
    enabled: !!username && username.length >= 3,
  })
}

export function usePublishedBoxCount(userId?: string) {
  return useQuery({
    queryKey: ['boxes', 'author-count', userId],
    queryFn: async () => {
      if (!userId) return 0
      const { count, error } = await supabase
        .from('boxes')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', userId)
        .eq('status', 'published')
      if (error) throw error
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function usePinBox(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (boxId: string | null) => {
      if (!userId) throw new Error('Authentication required')
      const { error } = await supabase
        .from('profiles')
        .update({ pinned_box_id: boxId })
        .eq('id', userId)
      if (error) throw error
      return boxId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', userId] })
      qc.invalidateQueries({ queryKey: ['profile', 'by-username'] })
    },
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, form }: { userId: string; form: ProfileFormData }) => {
      const USERNAME_RE = /^[a-z0-9_]{3,30}$/
      const cleanUsername = sanitizeText(form.username).toLowerCase().replace(/\s+/g, '_')

      if (!USERNAME_RE.test(cleanUsername)) {
        throw new Error('Usernames can only use lowercase letters, numbers, and underscores (3-30 characters).')
      }

      const cleanLinks = parseProfileLinks(form.links ?? [])

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: sanitizeText(form.display_name).slice(0, 100),
          username: cleanUsername,
          bio: sanitizeText(form.bio).slice(0, 500) || null,
          avatar_url: sanitizeText(form.avatar_url).slice(0, 500) || null,
          links: cleanLinks as unknown as Json,
        })
        .eq('id', userId)

      if (error) {
        if (error.code === '23505') throw new Error('That username is already in use.')
        throw new Error('Could not update your profile. Please try again.')
      }
    },
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['profile', userId] })
      qc.invalidateQueries({ queryKey: ['profile', 'by-username'] })
    },
  })
}
