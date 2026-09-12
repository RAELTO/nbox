export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          username: string
          bio: string | null
          avatar_url: string | null
          role: string
          is_banned: boolean
          voice_notes_enabled: boolean
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          username: string
          bio?: string | null
          avatar_url?: string | null
          role?: string
          is_banned?: boolean
          voice_notes_enabled?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          username?: string
          bio?: string | null
          avatar_url?: string | null
          role?: string
          is_banned?: boolean
          voice_notes_enabled?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
        }
        Relationships: []
      }
      boxes: {
        Row: {
          id: string
          author_id: string
          type: 'quick' | 'media' | 'poll' | 'mood' | 'link' | 'thread'
          content: string
          payload: Json
          status: 'published' | 'draft' | 'archived'
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          type?: 'quick' | 'media' | 'poll' | 'mood' | 'link' | 'thread'
          content?: string
          payload?: Json
          status?: 'published' | 'draft' | 'archived'
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          type?: 'quick' | 'media' | 'poll' | 'mood' | 'link' | 'thread'
          content?: string
          payload?: Json
          status?: 'published' | 'draft' | 'archived'
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'boxes_author_id_fkey'
            columns: ['author_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      box_tags: {
        Row: {
          box_id: string
          tag_id: string
        }
        Insert: {
          box_id: string
          tag_id: string
        }
        Update: {
          box_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'box_tags_box_id_fkey'
            columns: ['box_id']
            referencedRelation: 'boxes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'box_tags_tag_id_fkey'
            columns: ['tag_id']
            referencedRelation: 'tags'
            referencedColumns: ['id']
          }
        ]
      }
      box_reactions: {
        Row: {
          box_id: string
          user_id: string
          reaction_type: 'bold' | 'loud' | 'fire' | 'sharp' | 'save' | 'angry'
          created_at: string
        }
        Insert: {
          box_id: string
          user_id: string
          reaction_type: 'bold' | 'loud' | 'fire' | 'sharp' | 'save' | 'angry'
          created_at?: string
        }
        Update: {
          box_id?: string
          user_id?: string
          reaction_type?: 'bold' | 'loud' | 'fire' | 'sharp' | 'save' | 'angry'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'box_reactions_box_id_fkey'
            columns: ['box_id']
            referencedRelation: 'boxes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'box_reactions_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      box_shares: {
        Row: { id: string; box_id: string; user_id: string; share_type: 'feed' | 'whatsapp' | 'link' | 'contact' | 'group'; created_at: string }
        Insert: { id?: string; box_id: string; user_id: string; share_type: 'feed' | 'whatsapp' | 'link' | 'contact' | 'group'; created_at?: string }
        Update: { id?: string; box_id?: string; user_id?: string; share_type?: 'feed' | 'whatsapp' | 'link' | 'contact' | 'group'; created_at?: string }
        Relationships: []
      }
      comment_votes: {
        Row: { comment_id: string; user_id: string; vote: 'like' | 'dislike'; created_at: string }
        Insert: { comment_id: string; user_id: string; vote: 'like' | 'dislike'; created_at?: string }
        Update: { comment_id?: string; user_id?: string; vote?: 'like' | 'dislike'; created_at?: string }
        Relationships: []
      }
      comment_reactions: {
        Row: { comment_id: string; user_id: string; reaction_type: 'bold' | 'loud' | 'fire' | 'sharp' | 'save' | 'angry'; created_at: string }
        Insert: { comment_id: string; user_id: string; reaction_type: 'bold' | 'loud' | 'fire' | 'sharp' | 'save' | 'angry'; created_at?: string }
        Update: { comment_id?: string; user_id?: string; reaction_type?: 'bold' | 'loud' | 'fire' | 'sharp' | 'save' | 'angry'; created_at?: string }
        Relationships: []
      }
      box_votes: {
        Row: {
          box_id: string
          user_id: string
          vote: 'like' | 'dislike'
          created_at: string
        }
        Insert: {
          box_id: string
          user_id: string
          vote: 'like' | 'dislike'
          created_at?: string
        }
        Update: {
          box_id?: string
          user_id?: string
          vote?: 'like' | 'dislike'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'box_votes_box_id_fkey'
            columns: ['box_id']
            referencedRelation: 'boxes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'box_votes_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      box_poll_votes: {
        Row: {
          box_id: string
          user_id: string
          option_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          box_id: string
          user_id: string
          option_index: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          box_id?: string
          user_id?: string
          option_index?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'box_poll_votes_box_id_fkey'
            columns: ['box_id']
            referencedRelation: 'boxes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'box_poll_votes_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          recipient_id: string
          actor_id: string | null
          kind: 'reaction' | 'vote' | 'comment' | 'follow' | 'contact_request' | 'contact_accepted' | 'share'
          source_table: string
          source_id: string | null
          box_id: string | null
          comment_id: string | null
          contact_request_id: string | null
          metadata: Json
          dedup_key: string | null
          read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { read_at?: string | null }
        Relationships: [
          { foreignKeyName: 'notifications_recipient_id_fkey'; columns: ['recipient_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'notifications_actor_id_fkey'; columns: ['actor_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      conversations: {
        Row: { id: string; type: 'direct'; user_a: string; user_b: string; last_message_at: string | null; last_message_text: string | null; created_at: string }
        Insert: { id?: string; type?: 'direct'; user_a: string; user_b: string; last_message_at?: string | null; last_message_text?: string | null; created_at?: string }
        Update: { last_message_at?: string | null; last_message_text?: string | null }
        Relationships: [
          { foreignKeyName: 'conversations_user_a_fkey'; columns: ['user_a']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'conversations_user_b_fkey'; columns: ['user_b']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      conversation_participants: {
        Row: { conversation_id: string; user_id: string; last_read_at: string | null; archived_at: string | null; deleted_at: string | null; voice_notes_mode: 'inherit' | 'allow' | 'block' }
        Insert: { conversation_id: string; user_id: string; last_read_at?: string | null; archived_at?: string | null; deleted_at?: string | null; voice_notes_mode?: 'inherit' | 'allow' | 'block' }
        Update: { last_read_at?: string | null; archived_at?: string | null; deleted_at?: string | null; voice_notes_mode?: 'inherit' | 'allow' | 'block' }
        Relationships: []
      }
      messages: {
        Row: { id: string; conversation_id: string; sender_id: string; body: string; kind: 'text' | 'image' | 'voice' | 'system'; created_at: string; edited_at: string | null; deleted_at: string | null }
        Insert: { id?: string; conversation_id: string; sender_id: string; body: string; kind?: 'text' | 'image' | 'voice' | 'system'; created_at?: string; edited_at?: string | null; deleted_at?: string | null }
        Update: { body?: string; edited_at?: string | null; deleted_at?: string | null }
        Relationships: [
          { foreignKeyName: 'messages_sender_id_fkey'; columns: ['sender_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'messages_conversation_id_fkey'; columns: ['conversation_id']; referencedRelation: 'conversations'; referencedColumns: ['id'] }
        ]
      }
      message_attachments: {
        Row: {
          id: string
          message_id: string
          kind: 'voice' | 'image' | 'video' | 'file'
          storage_path: string
          mime_type: string
          size_bytes: number
          duration_ms: number | null
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          kind: 'voice' | 'image' | 'video' | 'file'
          storage_path: string
          mime_type: string
          size_bytes: number
          duration_ms?: number | null
          position?: number
          created_at?: string
        }
        Update: never
        Relationships: [
          { foreignKeyName: 'message_attachments_message_id_fkey'; columns: ['message_id']; referencedRelation: 'messages'; referencedColumns: ['id'] }
        ]
      }
      contact_requests: {
        Row: {
          id: string
          requester_id: string
          addressee_id: string
          status: 'pending' | 'accepted' | 'declined' | 'canceled'
          created_at: string
          responded_at: string | null
        }
        Insert: {
          id?: string
          requester_id: string
          addressee_id: string
          status?: 'pending' | 'accepted' | 'declined' | 'canceled'
          created_at?: string
          responded_at?: string | null
        }
        Update: {
          id?: string
          requester_id?: string
          addressee_id?: string
          status?: 'pending' | 'accepted' | 'declined' | 'canceled'
          created_at?: string
          responded_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'contact_requests_requester_id_fkey'; columns: ['requester_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'contact_requests_addressee_id_fkey'; columns: ['addressee_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      contacts: {
        Row: { user_a: string; user_b: string; created_at: string }
        Insert: { user_a: string; user_b: string; created_at?: string }
        Update: { user_a?: string; user_b?: string; created_at?: string }
        Relationships: [
          { foreignKeyName: 'contacts_user_a_fkey'; columns: ['user_a']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'contacts_user_b_fkey'; columns: ['user_b']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      box_saves: {
        Row: {
          box_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          box_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          box_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'box_saves_box_id_fkey'
            columns: ['box_id']
            referencedRelation: 'boxes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'box_saves_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      box_comments: {
        Row: {
          id: string
          box_id: string
          author_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          box_id: string
          author_id: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          box_id?: string
          author_id?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'box_comments_box_id_fkey'
            columns: ['box_id']
            referencedRelation: 'boxes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'box_comments_author_id_fkey'
            columns: ['author_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      follows: {
        Row: {
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: {
          follower_id: string
          following_id: string
          created_at?: string
        }
        Update: {
          follower_id?: string
          following_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey'
            columns: ['follower_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'follows_following_id_fkey'
            columns: ['following_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      is_banned: {
        Args: Record<string, never>
        Returns: boolean
      }
      search_boxes: {
        Args: { q: string; lim?: number }
        Returns: Database['public']['Tables']['boxes']['Row'][]
      }
      accept_contact_request: {
        Args: { p_request_id: string }
        Returns: void
      }
      get_voice_note_permission: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      create_voice_message: {
        Args: {
          p_message_id: string
          p_attachment_id: string
          p_conversation_id: string
          p_storage_path: string
          p_mime_type: string
          p_size_bytes: number
          p_duration_ms: number
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Convenience row types
export type Profile      = Database['public']['Tables']['profiles']['Row']
export type Tag          = Database['public']['Tables']['tags']['Row']
export type Box          = Database['public']['Tables']['boxes']['Row']
export type BoxTag       = Database['public']['Tables']['box_tags']['Row']
export type BoxReaction  = Database['public']['Tables']['box_reactions']['Row']
export type BoxPollVote  = Database['public']['Tables']['box_poll_votes']['Row']
export type BoxSave      = Database['public']['Tables']['box_saves']['Row']
export type BoxComment   = Database['public']['Tables']['box_comments']['Row']
export type Follow       = Database['public']['Tables']['follows']['Row']

export type ContactRequest = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined' | 'canceled'
  created_at: string
  responded_at: string | null
}

export type Contact = {
  user_a: string
  user_b: string
  created_at: string
}

export type RequestStatus = ContactRequest['status']

export type ReactionType = BoxReaction['reaction_type']
export type VoteType     = 'like' | 'dislike'
export type BoxType      = Box['type']

// Box payload shapes
export interface MediaPayload  { url: string; kind: 'image' | 'video' | 'gif'; caption?: string }
export interface PollOption    { text: string; votes?: number }
export interface PollPayload   { question: string; options: PollOption[] }
export interface MoodPayload   { color: 'm1' | 'm2' | 'm3' | 'm4' | 'm5' }
export interface LinkPayload   { url: string; title?: string; description?: string; host?: string; thumbnail?: string }
export interface ThreadPayload { items: string[] }

// Box with author joined (used in feed queries)
export interface BoxWithAuthor extends Box {
  author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'role'>
  tags?: Tag[]
  reaction_count?: number
  comment_count?: number
  my_reaction?: ReactionType | null
}
