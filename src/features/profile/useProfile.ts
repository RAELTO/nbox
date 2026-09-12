import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { sanitizeText } from '../../lib/sanitize'

export interface Profile {
  id: string
  display_name: string
  username: string
  bio: string | null
  avatar_url: string | null
  role: 'user' | 'admin'
  is_banned: boolean
  voice_notes_enabled?: boolean
}

export interface ProfileFormData {
  display_name: string
  username: string
  bio: string
  avatar_url: string
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, bio, avatar_url, role, is_banned, voice_notes_enabled')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data as Profile
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
        .select('id, display_name, username, bio, avatar_url, role, is_banned')
        .eq('username', username!.toLowerCase())
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
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

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, form }: { userId: string; form: ProfileFormData }) => {
      const USERNAME_RE = /^[a-z0-9_]{3,30}$/
      const cleanUsername = sanitizeText(form.username).toLowerCase().replace(/\s+/g, '_')

      if (!USERNAME_RE.test(cleanUsername)) {
        throw new Error('Usernames can only use lowercase letters, numbers, and underscores (3-30 characters).')
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: sanitizeText(form.display_name).slice(0, 100),
          username: cleanUsername,
          bio: sanitizeText(form.bio).slice(0, 500) || null,
          avatar_url: sanitizeText(form.avatar_url).slice(0, 500) || null,
        })
        .eq('id', userId)

      if (error) {
        if (error.code === '23505') throw new Error('That username is already in use.')
        throw new Error('Could not update your profile. Please try again.')
      }
    },
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}
