import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { sanitizeText, sanitizeUrl } from '../../lib/sanitize'
import type { Profile } from '../../types/database'

export type StoryBgColor = 'accent-1' | 'accent-2' | 'accent-3' | 'accent-4' | 'accent-5' | 'ink'

export interface StoryAuthorSummary {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  role: Profile['role']
}

export interface StoryItem {
  id: string
  author_id: string
  media_url: string | null
  caption: string | null
  bg_color: StoryBgColor
  created_at: string
  expires_at: string
  author: StoryAuthorSummary
  viewed_by_me: boolean
}

export interface StoryAuthorGroup {
  author: StoryAuthorSummary
  stories: StoryItem[]
  hasUnviewed: boolean
  latestCreatedAt: string
}

const VALID_BG_COLORS: ReadonlySet<StoryBgColor> = new Set([
  'accent-1',
  'accent-2',
  'accent-3',
  'accent-4',
  'accent-5',
  'ink',
])

function normalizeBgColor(raw: unknown): StoryBgColor {
  return typeof raw === 'string' && VALID_BG_COLORS.has(raw as StoryBgColor)
    ? (raw as StoryBgColor)
    : 'accent-1'
}

export function groupStoriesByAuthor(stories: StoryItem[], currentUserId?: string): StoryAuthorGroup[] {
  const byAuthor = new Map<string, StoryItem[]>()
  for (const story of stories) {
    const existing = byAuthor.get(story.author_id)
    if (existing) {
      existing.push(story)
    } else {
      byAuthor.set(story.author_id, [story])
    }
  }

  const groups: StoryAuthorGroup[] = []
  for (const [, list] of byAuthor) {
    const sorted = list.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
    const latest = sorted[sorted.length - 1]
    groups.push({
      author: latest.author,
      stories: sorted,
      hasUnviewed: sorted.some(item => !item.viewed_by_me),
      latestCreatedAt: latest.created_at,
    })
  }

  return groups.sort((a, b) => {
    if (currentUserId) {
      if (a.author.id === currentUserId && b.author.id !== currentUserId) return -1
      if (b.author.id === currentUserId && a.author.id !== currentUserId) return 1
    }
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1
    return b.latestCreatedAt.localeCompare(a.latestCreatedAt)
  })
}

export function useActiveStories(userId?: string) {
  return useQuery({
    queryKey: ['stories', 'active', userId],
    queryFn: async (): Promise<StoryItem[]> => {
      const nowIso = new Date().toISOString()
      const [storiesRes, viewsRes] = await Promise.all([
        supabase
          .from('stories')
          .select('id, author_id, media_url, caption, bg_color, created_at, expires_at, author:profiles!stories_author_id_fkey(id, username, display_name, avatar_url, role)')
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(60),
        userId
          ? supabase
              .from('story_views')
              .select('story_id')
              .eq('viewer_id', userId)
          : Promise.resolve({ data: [] as Array<{ story_id: string }>, error: null }),
      ])

      if (storiesRes.error) throw storiesRes.error
      if (viewsRes.error) throw viewsRes.error

      const viewedIds = new Set((viewsRes.data ?? []).map(row => row.story_id))
      const rawRows = (storiesRes.data ?? []) as unknown as Array<Record<string, unknown>>

      return rawRows.flatMap((row): StoryItem[] => {
        const authorRaw = row.author as Record<string, unknown> | null
        if (!authorRaw || typeof row.id !== 'string') return []
        const safeMedia = typeof row.media_url === 'string' ? sanitizeUrl(row.media_url) || null : null
        const caption = typeof row.caption === 'string' ? row.caption : null
        if (!safeMedia && !caption) return []
        return [{
          id: row.id,
          author_id: String(row.author_id ?? authorRaw.id ?? ''),
          media_url: safeMedia,
          caption,
          bg_color: normalizeBgColor(row.bg_color),
          created_at: String(row.created_at ?? nowIso),
          expires_at: String(row.expires_at ?? nowIso),
          author: {
            id: String(authorRaw.id ?? ''),
            username: String(authorRaw.username ?? 'user'),
            display_name: String(authorRaw.display_name ?? 'Member'),
            avatar_url: typeof authorRaw.avatar_url === 'string' ? authorRaw.avatar_url : null,
            role: authorRaw.role === 'admin' ? 'admin' : 'user',
          },
          viewed_by_me: viewedIds.has(row.id) || String(row.author_id) === userId,
        }]
      })
    },
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useCreateStory(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { caption?: string | null; mediaUrl?: string | null; bgColor: StoryBgColor }) => {
      if (!userId) throw new Error('Authentication required')
      const cleanCaption = input.caption ? sanitizeText(input.caption).slice(0, 280) : null
      const cleanMedia = input.mediaUrl ? sanitizeUrl(input.mediaUrl) || null : null
      if (!cleanCaption && !cleanMedia) {
        throw new Error('Add a caption or upload an image for your story.')
      }

      const { data, error } = await supabase
        .from('stories')
        .insert({
          author_id: userId,
          caption: cleanCaption || null,
          media_url: cleanMedia,
          bg_color: input.bgColor,
        })
        .select('id')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stories', 'active'] })
    },
  })
}

export function useMarkStoryViewed(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (storyId: string) => {
      if (!userId) return
      const { error } = await supabase
        .from('story_views')
        .upsert({ story_id: storyId, viewer_id: userId }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stories', 'active', userId] })
    },
  })
}

export function useDeleteStory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (storyId: string) => {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stories', 'active'] })
    },
  })
}

export interface StoryViewerRow {
  viewer_id: string
  viewed_at: string
  viewer: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
}

export function useStoryViewers(storyId?: string, enabled = false) {
  return useQuery({
    queryKey: ['stories', 'viewers', storyId],
    queryFn: async (): Promise<StoryViewerRow[]> => {
      if (!storyId) return []
      const { data, error } = await supabase
        .from('story_views')
        .select('viewer_id, viewed_at, viewer:profiles!story_views_viewer_id_fkey(id, username, display_name, avatar_url)')
        .eq('story_id', storyId)
        .order('viewed_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as StoryViewerRow[]
    },
    enabled: enabled && !!storyId,
    staleTime: 10_000,
  })
}
