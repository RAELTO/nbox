import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { BOX_SELECT, normalizeBoxes } from '../boxes/useBoxes'
import type { BoxWithAuthor, Profile } from '../../types/database'

export type SocialGroupVisibility = 'public' | 'private'
export type SocialGroupJoinPolicy = 'open' | 'approval'
export type SocialGroupPostPolicy = 'members' | 'admins_only'
export type SocialGroupAccent = 'accent-1' | 'accent-2' | 'accent-3' | 'accent-4' | 'accent-5'
export type SocialGroupMemberRole = 'member' | 'moderator' | 'admin'
export type SocialGroupMemberStatus = 'active' | 'banned'
export type SocialGroupModAction =
  | 'promote_admin'
  | 'promote_moderator'
  | 'demote_member'
  | 'remove'
  | 'ban'
  | 'unban'

export interface SocialGroupSummary {
  id: string
  name: string
  slug: string
  description: string
  accent_color: SocialGroupAccent
  visibility: SocialGroupVisibility
  join_policy: SocialGroupJoinPolicy
  post_policy: SocialGroupPostPolicy
  created_by: string | null
  pinned_box_id: string | null
  created_at: string
  updated_at: string
  active_member_count: number
  my_role: SocialGroupMemberRole | null
  my_status: SocialGroupMemberStatus | null
  has_pending_request: boolean
}

export interface SocialGroupMemberRow {
  group_id: string
  user_id: string
  role: SocialGroupMemberRole
  status: SocialGroupMemberStatus
  joined_at: string
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export interface SocialGroupJoinRequestRow {
  id: string
  group_id: string
  user_id: string
  message: string | null
  status: 'pending' | 'approved' | 'declined' | 'canceled'
  created_at: string
  user: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

const SOCIAL_GROUP_ERROR_MESSAGES: Record<string, string> = {
  group_admin_required: 'Only a group admin can perform that action.',
  group_moderator_required: 'Only a group admin or moderator can perform that action.',
  group_member_banned: 'This account is banned from joining this group.',
  last_social_group_admin: 'Assign another admin before removing or stepping down as the last admin.',
  accepted_contact_required: 'You can only invite accepted contacts.',
  invalid_group_name: 'Group name must be between 2 and 80 characters.',
  invalid_group_settings: 'Check the group visibility, join policy, and post settings.',
  box_not_in_group: 'Only published posts inside this group can be pinned.',
  user_banned: 'Your account cannot perform this action.',
}

export function mapSocialGroupError(error: unknown, fallback = 'Could not complete the group action.'): string {
  if (!error || typeof error !== 'object') return fallback
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown }
  const text = [candidate.message, candidate.details, candidate.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')

  for (const [code, message] of Object.entries(SOCIAL_GROUP_ERROR_MESSAGES)) {
    if (text.includes(code)) return message
  }
  return fallback
}

export function useSocialGroups(userId?: string) {
  return useQuery({
    queryKey: ['social-groups', userId],
    queryFn: async (): Promise<SocialGroupSummary[]> => {
      const [groupsRes, reqRes] = await Promise.all([
        supabase
          .from('groups')
          .select('id, name, slug, description, accent_color, visibility, join_policy, post_policy, created_by, pinned_box_id, created_at, updated_at, group_members(user_id, role, status)')
          .order('created_at', { ascending: false })
          .limit(60),
        userId
          ? supabase
              .from('group_join_requests')
              .select('group_id')
              .eq('user_id', userId)
              .eq('status', 'pending')
          : Promise.resolve({ data: [] as Array<{ group_id: string }>, error: null }),
      ])

      if (groupsRes.error) throw groupsRes.error
      if (reqRes.error) throw reqRes.error

      const pendingGroupIds = new Set((reqRes.data ?? []).map(r => r.group_id))
      const rawGroups = (groupsRes.data ?? []) as unknown as Array<Record<string, unknown>>

      return rawGroups.map(row => {
        const membersRaw = Array.isArray(row.group_members)
          ? (row.group_members as Array<{ user_id: string; role: SocialGroupMemberRole; status: SocialGroupMemberStatus }>)
          : []
        const activeMembers = membersRaw.filter(m => m.status === 'active')
        const mine = userId ? membersRaw.find(m => m.user_id === userId) : undefined

        return {
          id: String(row.id),
          name: String(row.name ?? 'Group'),
          slug: String(row.slug ?? row.id),
          description: String(row.description ?? ''),
          accent_color: (row.accent_color as SocialGroupAccent) ?? 'accent-3',
          visibility: row.visibility === 'private' ? 'private' : 'public',
          join_policy: row.join_policy === 'approval' ? 'approval' : 'open',
          post_policy: row.post_policy === 'admins_only' ? 'admins_only' : 'members',
          created_by: typeof row.created_by === 'string' ? row.created_by : null,
          pinned_box_id: typeof row.pinned_box_id === 'string' ? row.pinned_box_id : null,
          created_at: String(row.created_at ?? ''),
          updated_at: String(row.updated_at ?? ''),
          active_member_count: activeMembers.length,
          my_role: mine?.status === 'active' ? mine.role : null,
          my_status: mine?.status ?? null,
          has_pending_request: pendingGroupIds.has(String(row.id)),
        }
      })
    },
    enabled: !!userId,
    staleTime: 20_000,
  })
}

export function useSocialGroupDetail(slug?: string, userId?: string) {
  return useQuery({
    queryKey: ['social-group', slug, userId],
    queryFn: async (): Promise<SocialGroupSummary | null> => {
      if (!slug) return null
      const { data: row, error } = await supabase
        .from('groups')
        .select('id, name, slug, description, accent_color, visibility, join_policy, post_policy, created_by, pinned_box_id, created_at, updated_at')
        .eq('slug', slug)
        .maybeSingle()

      if (error) throw error
      if (!row) return null

      const [membersRes, myReqRes] = await Promise.all([
        supabase
          .from('group_members')
          .select('user_id, role, status')
          .eq('group_id', row.id),
        userId
          ? supabase
              .from('group_join_requests')
              .select('id')
              .eq('group_id', row.id)
              .eq('user_id', userId)
              .eq('status', 'pending')
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

      if (membersRes.error) throw membersRes.error
      if (myReqRes.error) throw myReqRes.error

      const membersRaw = membersRes.data ?? []
      const mine = userId ? membersRaw.find(m => m.user_id === userId) : undefined

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        accent_color: row.accent_color,
        visibility: row.visibility,
        join_policy: row.join_policy,
        post_policy: row.post_policy,
        created_by: row.created_by,
        pinned_box_id: row.pinned_box_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        active_member_count: membersRaw.filter(m => m.status === 'active').length,
        my_role: mine?.status === 'active' ? mine.role : null,
        my_status: mine?.status ?? null,
        has_pending_request: Boolean(myReqRes.data),
      }
    },
    enabled: !!slug && !!userId,
    staleTime: 15_000,
  })
}

export function useSocialGroupBoxes(groupId?: string, enabled = true) {
  return useQuery({
    queryKey: ['social-group-boxes', groupId],
    queryFn: async (): Promise<BoxWithAuthor[]> => {
      if (!groupId) return []
      const { data, error } = await supabase
        .from('boxes')
        .select(BOX_SELECT)
        .eq('group_id', groupId)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return normalizeBoxes(data)
    },
    enabled: enabled && !!groupId,
    staleTime: 20_000,
  })
}

export function useSocialGroupMembers(groupId?: string, enabled = true) {
  return useQuery({
    queryKey: ['social-group-members', groupId],
    queryFn: async (): Promise<SocialGroupMemberRow[]> => {
      if (!groupId) return []
      const { data, error } = await supabase
        .from('group_members')
        .select('group_id, user_id, role, status, joined_at, profile:profiles!group_members_user_id_fkey(id, username, display_name, avatar_url)')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as SocialGroupMemberRow[]
    },
    enabled: enabled && !!groupId,
    staleTime: 15_000,
  })
}

export function useSocialGroupRequests(groupId?: string, enabled = false) {
  return useQuery({
    queryKey: ['social-group-requests', groupId],
    queryFn: async (): Promise<SocialGroupJoinRequestRow[]> => {
      if (!groupId) return []
      const { data, error } = await supabase
        .from('group_join_requests')
        .select('id, group_id, user_id, message, status, created_at, user:profiles!group_join_requests_user_id_fkey(id, username, display_name, avatar_url)')
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as SocialGroupJoinRequestRow[]
    },
    enabled: enabled && !!groupId,
    staleTime: 10_000,
  })
}

export function useCreateSocialGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description: string
      visibility: SocialGroupVisibility
      joinPolicy: SocialGroupJoinPolicy
      postPolicy: SocialGroupPostPolicy
      accentColor: SocialGroupAccent
    }) => {
      const { data, error } = await supabase.rpc('create_social_group', {
        p_name: input.name.trim(),
        p_description: input.description.trim(),
        p_visibility: input.visibility,
        p_join_policy: input.joinPolicy,
        p_post_policy: input.postPolicy,
        p_accent_color: input.accentColor,
      })
      if (error) throw error
      return data as unknown as { id: string; slug: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-groups'] })
    },
  })
}

export function useJoinOrRequestSocialGroup(slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, message }: { groupId: string; message?: string }) => {
      const { data, error } = await supabase.rpc('join_or_request_social_group', {
        p_group_id: groupId,
        p_message: message?.trim() || null,
      })
      if (error) throw error
      return data as unknown as { status: 'joined' | 'requested' | 'already_member' }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
    },
  })
}

export function useCancelGroupJoinRequest(slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase.rpc('cancel_group_join_request', { p_group_id: groupId })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
    },
  })
}

export function useRespondGroupJoinRequest(groupId: string, slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, approve }: { requestId: string; approve: boolean }) => {
      const { data, error } = await supabase.rpc('respond_group_join_request', {
        p_request_id: requestId,
        p_approve: approve,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-group-requests', groupId] })
      qc.invalidateQueries({ queryKey: ['social-group-members', groupId] })
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
    },
  })
}

export function useModerateSocialGroupMember(groupId: string, slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ targetUserId, action }: { targetUserId: string; action: SocialGroupModAction }) => {
      const { data, error } = await supabase.rpc('moderate_social_group_member', {
        p_group_id: groupId,
        p_user_id: targetUserId,
        p_action: action,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-group-members', groupId] })
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
    },
  })
}

export function useInviteContactToSocialGroup(groupId: string, slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.rpc('invite_contact_to_social_group', {
        p_group_id: groupId,
        p_user_id: targetUserId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-group-members', groupId] })
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
    },
  })
}

export function useUpdateSocialGroupSettings(groupId: string, slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description: string
      visibility: SocialGroupVisibility
      joinPolicy: SocialGroupJoinPolicy
      postPolicy: SocialGroupPostPolicy
      accentColor: SocialGroupAccent
    }) => {
      const { data, error } = await supabase.rpc('update_social_group_settings', {
        p_group_id: groupId,
        p_name: input.name.trim(),
        p_description: input.description.trim(),
        p_visibility: input.visibility,
        p_join_policy: input.joinPolicy,
        p_post_policy: input.postPolicy,
        p_accent_color: input.accentColor,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
    },
  })
}

export function useLeaveSocialGroup(slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase.rpc('leave_social_group', { p_group_id: groupId })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
    },
  })
}

export function usePinSocialGroupBox(groupId: string, slug?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (boxId: string | null) => {
      const { data, error } = await supabase.rpc('pin_social_group_box', {
        p_group_id: groupId,
        p_box_id: boxId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      if (slug) qc.invalidateQueries({ queryKey: ['social-group', slug] })
      qc.invalidateQueries({ queryKey: ['social-group-boxes', groupId] })
    },
  })
}

export function useDeleteSocialGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase.rpc('delete_social_group', { p_group_id: groupId })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-groups'] })
    },
  })
}
