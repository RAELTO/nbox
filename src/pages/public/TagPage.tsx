import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import BoxCard from '../../components/feed/BoxCard'
import type { BoxWithAuthor } from '../../types/database'

function useBoxesByTag(slug: string) {
  return useQuery({
    queryKey: ['boxes', 'tag', slug],
    queryFn: async () => {
      const { data: tagRow } = await supabase
        .from('tags')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!tagRow) return []

      const { data } = await supabase
        .from('box_tags')
        .select(`
          box:boxes(
            *,
            author:profiles!boxes_author_id_fkey(id, username, display_name, avatar_url),
            reaction_count:box_reactions(count),
            comment_count:box_comments(count)
          )
        `)
        .eq('tag_id', tagRow.id)
      return (data ?? []).flatMap(row => {
        const b = row.box as Record<string, unknown> | null
        if (!b || b.status !== 'published') return []
        return [{
          ...b,
          reaction_count: ((b.reaction_count as { count: number }[] | null)?.[0]?.count) ?? 0,
          comment_count: ((b.comment_count as { count: number }[] | null)?.[0]?.count) ?? 0,
        }]
      }) as BoxWithAuthor[]
    },
    enabled: !!slug,
  })
}

export default function TagPage() {
  const { slug = '' } = useParams()
  const { data: boxes = [], isLoading } = useBoxesByTag(slug)

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>
          tag
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>
          <span style={{ background: 'var(--accent-3)', color: 'var(--on-accent-3)', border: 'var(--border)', padding: '0 12px', boxShadow: 'var(--shadow)', display: 'inline-block' }}>
            #{slug}
          </span>
        </h1>
      </div>

      {isLoading && (
        <div className="spinner">
          <div className="spinner-ring" />
          <span className="spinner-label">Loading…</span>
        </div>
      )}

      {!isLoading && boxes.length === 0 && (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>No boxes with this tag</div>
          <div className="text-mute text-sm mt-2">No one has dropped anything with #{slug} yet.</div>
        </div>
      )}

      {boxes.map(box => <BoxCard key={box.id} box={box} />)}
    </AppShell>
  )
}
