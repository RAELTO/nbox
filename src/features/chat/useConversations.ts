import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type {
  ConversationSummary,
  DirectConversationSummary,
  GroupConversationSummary,
  SystemEventType,
  VoiceReceptionMode,
} from './conversationTypes'

export type { ConversationSummary }

function normalizeProfileSummary(raw: unknown) {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    id: String(row.id ?? ''),
    username: String(row.username ?? ''),
    display_name: String(row.display_name ?? 'Member'),
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
  }
}

function normalizeMode(raw: unknown): VoiceReceptionMode {
  return raw === 'allow' || raw === 'block' ? raw : 'inherit'
}

function normalizeConversationItem(raw: unknown): ConversationSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  if (!id) return null

  const lastMessageKind: 'text' | 'image' | 'voice' | 'system' | null =
    row.last_message_kind === 'text'
    || row.last_message_kind === 'image'
    || row.last_message_kind === 'voice'
    || row.last_message_kind === 'system'
      ? row.last_message_kind
      : null

  const base = {
    id,
    last_message_id: typeof row.last_message_id === 'string' ? row.last_message_id : null,
    last_message_sender_id: typeof row.last_message_sender_id === 'string' ? row.last_message_sender_id : null,
    last_message_at: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    last_message_text: typeof row.last_message_text === 'string' ? row.last_message_text : null,
    last_message_kind: lastMessageKind,
    last_system_event_type: typeof row.last_system_event_type === 'string'
      ? (row.last_system_event_type as SystemEventType)
      : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    my_last_read_at: typeof row.my_last_read_at === 'string' ? row.my_last_read_at : null,
    has_unread: row.has_unread === true,
    my_voice_notes_mode: normalizeMode(row.my_voice_notes_mode),
  }

  if (row.type === 'group') {
    const group: GroupConversationSummary = {
      ...base,
      type: 'group',
      name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Private group',
      status: row.status === 'closed' ? 'closed' : 'active',
      member_count: typeof row.member_count === 'number' ? row.member_count : Number(row.member_count ?? 0),
      my_role: row.my_role === 'admin' ? 'admin' : 'member',
      voice_notes_allowed: row.voice_notes_allowed !== false,
      voice_policy_version: typeof row.voice_policy_version === 'number'
        ? row.voice_policy_version
        : Number(row.voice_policy_version ?? 1),
      history_from_sequence: typeof row.history_from_sequence === 'number'
        ? row.history_from_sequence
        : Number(row.history_from_sequence ?? 1),
    }
    return group
  }

  const direct: DirectConversationSummary = {
    ...base,
    type: 'direct',
    user_a: String(row.user_a ?? ''),
    user_b: String(row.user_b ?? ''),
    other: normalizeProfileSummary(row.other),
  }
  return direct
}

async function fetchDirectFallback(userId: string): Promise<ConversationSummary[]> {
  const [convRes, partRes] = await Promise.all([
    supabase
      .from('conversations')
      .select(`
        *,
        profile_a:profiles!conversations_user_a_fkey(id, username, display_name, avatar_url),
        profile_b:profiles!conversations_user_b_fkey(id, username, display_name, avatar_url)
      `)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at, voice_notes_mode')
      .eq('user_id', userId),
  ])

  if (convRes.error) throw convRes.error
  if (partRes.error) throw partRes.error

  const conversationIds = (convRes.data ?? []).map(row => row.id)
  const { data: latestMessages, error: latestMessagesError } = conversationIds.length
    ? await supabase
      .from('messages')
      .select('conversation_id, sender_id, created_at')
      .in('conversation_id', conversationIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
    : { data: [], error: null }
  if (latestMessagesError) throw latestMessagesError

  const lastMessageSenderMap = new Map<string, string>()
  for (const message of latestMessages ?? []) {
    if (message.sender_id && !lastMessageSenderMap.has(message.conversation_id)) {
      lastMessageSenderMap.set(message.conversation_id, message.sender_id)
    }
  }

  const partMap = new Map(
    (partRes.data ?? []).map(p => [p.conversation_id, p]),
  )

  return (convRes.data ?? []).map(row => {
    const record = row as unknown as Record<string, unknown>
    const part = partMap.get(String(record.id))
    const myLastRead = part?.last_read_at ?? null
    const lastMessageSenderId = lastMessageSenderMap.get(String(record.id)) ?? null
    const lastMessageAt = typeof record.last_message_at === 'string' ? record.last_message_at : null
    const hasUnread = Boolean(lastMessageAt)
      && lastMessageSenderId !== userId
      && (!myLastRead || lastMessageAt! > myLastRead)
    const isA = record.user_a === userId
    return {
      id: String(record.id),
      type: 'direct',
      user_a: String(record.user_a ?? ''),
      user_b: String(record.user_b ?? ''),
      other: normalizeProfileSummary(isA ? record.profile_b : record.profile_a),
      last_message_id: null,
      last_message_sender_id: lastMessageSenderId,
      last_message_at: lastMessageAt,
      last_message_text: typeof record.last_message_text === 'string' ? record.last_message_text : null,
      last_message_kind: null,
      last_system_event_type: null,
      created_at: String(record.created_at ?? new Date().toISOString()),
      updated_at: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
      my_last_read_at: myLastRead,
      has_unread: hasUnread,
      my_voice_notes_mode: normalizeMode(part?.voice_notes_mode),
    } satisfies DirectConversationSummary
  })
}

export function useConversations(userId: string | undefined) {
  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: async () => {
      if (!userId) return []

      const { data, error } = await supabase.rpc('get_inbox_conversations', { p_limit: 50 })

      if (error) {
        const msg = `${error.code ?? ''} ${error.message ?? ''}`
        if (error.code === '42883' || error.code === 'PGRST202' || msg.includes('get_inbox_conversations')) {
          return fetchDirectFallback(userId)
        }
        throw error
      }

      const rawItems = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
          ? (data as { items: unknown[] }).items
          : []

      return rawItems
        .map(normalizeConversationItem)
        .filter((item): item is ConversationSummary => item !== null)
    },
    enabled: !!userId,
    staleTime: 15_000,
  })
}
