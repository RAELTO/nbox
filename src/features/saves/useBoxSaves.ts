import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { BoxWithAuthor } from '../../types/database'

const SAVED_BOX_SELECT = `
  created_at,
  box:boxes!box_saves_box_id_fkey(
    *,
    author:profiles!boxes_author_id_fkey(id, username, display_name, avatar_url, role),
    tags:box_tags(tag:tags(id, name, slug)),
    reaction_count:box_reactions(count),
    comment_count:box_comments(count)
  )
`

function normalizeBox(box: Record<string, unknown>): BoxWithAuthor {
  return {
    ...box,
    tags: ((box.tags as { tag: unknown }[] | null) ?? []).map((t) => t.tag),
    reaction_count: ((box.reaction_count as { count: number }[] | null)?.[0]?.count) ?? 0,
    comment_count: ((box.comment_count as { count: number }[] | null)?.[0]?.count) ?? 0,
  } as BoxWithAuthor
}

export interface SavedBoxItem {
  savedAt: string
  box: BoxWithAuthor
}

export function useIsBoxSaved(boxId: string, userId?: string, enabled = true) {
  return useQuery({
    queryKey: ['box-save', boxId, userId],
    queryFn: async () => {
      if (!userId) return false
      const { data, error } = await supabase
        .from('box_saves')
        .select('box_id')
        .eq('box_id', boxId)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
    enabled: enabled && !!userId,
    staleTime: 30_000,
  })
}

export function useSavedBoxes(userId?: string, enabled = true) {
  return useQuery({
    queryKey: ['box-saves', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('box_saves')
        .select(SAVED_BOX_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error

      return ((data ?? []) as { created_at: string; box: Record<string, unknown> | null }[])
        .reduce<SavedBoxItem[]>((items, row) => {
          if (!row.box) return items
          items.push({
            savedAt: row.created_at,
            box: normalizeBox(row.box),
          })
          return items
        }, [])
    },
    enabled: enabled && !!userId,
    staleTime: 30_000,
  })
}

export function useToggleBoxSave(boxId: string, userId?: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (currentlySaved: boolean) => {
      if (!userId) throw new Error('Missing user')

      if (currentlySaved) {
        const { error } = await supabase
          .from('box_saves')
          .delete()
          .eq('box_id', boxId)
          .eq('user_id', userId)
        if (error) throw error
        return false
      }

      const { error } = await supabase
        .from('box_saves')
        .insert({ box_id: boxId, user_id: userId })
      if (error) throw error
      return true
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['box-save', boxId, userId] })
      qc.invalidateQueries({ queryKey: ['box-saves', userId] })
      qc.invalidateQueries({ queryKey: ['box-engagement'] })
    },
  })
}
