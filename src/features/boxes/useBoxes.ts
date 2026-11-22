import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { BoxWithAuthor, Box } from '../../types/database'

export type FeedMode = 'foryou' | 'following' | 'fresh' | 'loud'

export const BOX_SELECT = `
  *,
  author:profiles!boxes_author_id_fkey(id, username, display_name, avatar_url, role),
  tags:box_tags(tag:tags(id, name, slug)),
  reaction_count:box_reactions(count),
  comment_count:box_comments(count)
`

export function normalizeBoxes(data: unknown[] | null | undefined): BoxWithAuthor[] {
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((b) => ({
    ...b,
    tags: ((b.tags as { tag: unknown }[] | null) ?? []).map((t) => (t as { tag: unknown }).tag),
    reaction_count: ((b.reaction_count as { count: number }[] | null)?.[0]?.count) ?? 0,
    comment_count:  ((b.comment_count  as { count: number }[] | null)?.[0]?.count) ?? 0,
  })) as BoxWithAuthor[]
}

async function fetchSearchBoxes(rawQ: string): Promise<BoxWithAuthor[]> {
  const q = rawQ.trim().slice(0, 80)
  if (q.length < 2) return []

  const { data: matches, error: searchError } = await supabase
    .rpc('search_boxes', { q, lim: 40 })
  if (searchError) throw searchError

  const ids = (matches ?? []).map((b) => b.id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('boxes')
    .select(BOX_SELECT)
    .in('id', ids)
  if (error) throw error

  const order = new Map(ids.map((id, index) => [id, index]))
  return normalizeBoxes(data).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

async function fetchFeed(mode: FeedMode, userId?: string): Promise<BoxWithAuthor[]> {
  let query = supabase
    .from('boxes')
    .select(BOX_SELECT)
    .eq('status', 'published')
    .is('group_id', null)

  if (mode === 'fresh') {
    query = query.order('published_at', { ascending: false })
  } else if (mode === 'loud') {
    query = query.order('published_at', { ascending: false })
  } else if (mode === 'following' && userId) {
    const { data: followedIds } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
    const ids = (followedIds ?? []).map(f => f.following_id)
    if (ids.length === 0) return []
    query = query.in('author_id', ids).order('published_at', { ascending: false })
  } else {
    query = query.order('published_at', { ascending: false })
  }

  query = query.limit(40)

  const { data, error } = await query
  if (error) throw error

  // normalize nested counts from [{count}] → number
  return (data ?? []).map((b: Record<string, unknown>) => ({
    ...b,
    tags: ((b.tags as { tag: unknown }[] | null) ?? []).map((t) => (t as { tag: unknown }).tag),
    reaction_count: ((b.reaction_count as { count: number }[] | null)?.[0]?.count) ?? 0,
    comment_count:  ((b.comment_count  as { count: number }[] | null)?.[0]?.count) ?? 0,
  })) as BoxWithAuthor[]
}

export function useBoxFeed(mode: FeedMode, userId?: string) {
  return useQuery({
    queryKey: ['boxes', 'feed', mode, userId],
    queryFn:  () => fetchFeed(mode, userId),
    staleTime: 30_000,
  })
}

async function fetchBoxesByAuthor(authorId: string): Promise<BoxWithAuthor[]> {
  const { data, error } = await supabase
    .from('boxes')
    .select(BOX_SELECT)
    .eq('author_id', authorId)
    .eq('status', 'published')
    .is('group_id', null)
    .order('published_at', { ascending: false })
    .limit(40)
  if (error) throw error
  return normalizeBoxes(data)
}

export function useBoxesByAuthor(authorId?: string) {
  return useQuery({
    queryKey: ['boxes', 'author', authorId],
    queryFn:  () => fetchBoxesByAuthor(authorId!),
    enabled: !!authorId,
    staleTime: 30_000,
  })
}

export function useSearchBoxes(q: string) {
  const search = q.trim()
  return useQuery({
    queryKey: ['boxes', 'search', search],
    queryFn:  () => fetchSearchBoxes(search),
    enabled: search.length >= 2,
    staleTime: 30_000,
  })
}

export function useCreateBox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Pick<Box, 'author_id' | 'type' | 'content' | 'payload'> & { tags?: string[]; group_id?: string | null }) => {
      const { tags, group_id, ...box } = input

      const { data, error } = await supabase
        .from('boxes')
        .insert({ ...box, group_id: group_id ?? null, status: 'published', published_at: new Date().toISOString() })
        .select()
        .single()
      if (error) throw error

      // Save tags if provided
      if (tags && tags.length > 0) {
        const slugs = tags.flatMap(name => {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          return slug ? [slug] : []
        })
        await Promise.all(slugs.map(async (slug) => {
          let { data: tag } = await supabase
            .from('tags')
            .select('id')
            .eq('slug', slug)
            .maybeSingle()

          if (!tag) {
            const { data: newTag } = await supabase
              .from('tags')
              .insert({ name: slug, slug })
              .select('id')
              .single()
            tag = newTag
          }

          if (tag?.id) {
            await supabase.from('box_tags').insert({ box_id: data.id, tag_id: tag.id })
          }
        }))
      }

      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['boxes', 'feed'] })
      qc.invalidateQueries({ queryKey: ['boxes', 'author-count'] })
      if (data?.group_id) {
        qc.invalidateQueries({ queryKey: ['social-group-boxes', data.group_id] })
      }
    },
  })
}

export function useDeleteBox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (boxId: string) => {
      const { error } = await supabase.from('boxes').delete().eq('id', boxId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boxes'] })
      qc.invalidateQueries({ queryKey: ['boxes', 'author-count'] })
    },
  })
}
