# Supabase baseline

Project `korxgckhjvsrknunqiif` · 2026-11-22 01:47 UTC

MCP `list_migrations` returned 36 entries. The latest was `20260912014004_voice_note_preferences`. Neither target migration was present.

## Live advisors

Security returned 1 warning. Performance returned 83 findings across four rules.

- WARN · 1 Leaked Password Protection Disabled. Auth. [Remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- INFO · 9 Unindexed foreign keys. box_saves / box_saves_user_id_fkey; box_shares / box_shares_user_id_fkey; box_tags / box_tags_tag_id_fkey; comment_reactions / comment_reactions_user_id_fkey; comment_votes / comment_votes_user_id_fkey; notifications / notifications_actor_id_fkey; notifications / notifications_box_id_fkey; notifications / notifications_comment_id_fkey; notifications / notifications_contact_request_id_fkey. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- WARN · 33 Auth RLS Initialization Plan. profiles; boxes; follows; profiles; profiles; boxes; boxes; boxes; boxes; boxes; box_tags; box_tags; box_reactions; box_votes; box_reactions; box_reactions; box_saves; box_saves; box_saves; box_comments; box_comments; box_comments; follows; box_votes; box_votes; comment_votes; comment_votes; comment_votes; comment_reactions; comment_reactions; comment_reactions; box_shares; box_shares. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
- INFO · 17 Unused Index. profiles; notifications; notifications; notifications; box_reactions; box_votes; boxes; box_votes; box_shares; boxes; box_comments; box_comments; box_reactions; conversations; messages; conversation_participants; box_poll_votes. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
- WARN · 24 Multiple Permissive Policies. box_comments; box_comments; box_comments; box_comments; box_comments; box_comments; boxes; boxes; boxes; boxes; boxes; boxes; boxes; boxes; boxes; boxes; boxes; boxes; profiles; profiles; profiles; profiles; profiles; profiles. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)

## Live catalog and data

The `public`, `private`, and `storage` schemas exist. RLS was enabled on every table below. None of these eight tables had FORCE RLS enabled. This catalog check included column definitions, policy predicates, constraint definitions, and trigger definitions.

| Table | Policies | Constraints | Non-internal triggers |
| --- | --- | ---: | --- |
| `storage.buckets` | None | 6 | `enforce_bucket_name_length_trigger`, `enforce_versioning_status_transition`, `protect_active_lifecycle_states`, `protect_bucket_control_insert`, `protect_bucket_control_update`, `protect_bucket_control_update_role`, `protect_buckets_delete`, `wake_lifecycle_on_policy_write`, `wake_lifecycle_on_versioning_enable` |
| `public.conversation_participants` | `convpart_insert_participant`, `convpart_select_own`, `convpart_update_own` | 4 | `participants_guard_voice_preference_insert`, `participants_lock_voice_note_preference` |
| `public.conversations` | `conv_insert_contacts`, `conv_select_participant`, `conv_update_participant` | 6 | None |
| `public.message_attachments` | `message_attachments_select_participant` | 8 | None |
| `public.messages` | `msg_insert_participant`, `msg_select_participant`, `msg_update_own` | 5 | `trg_conv_last_message` |
| `public.notifications` | `notifs_delete_own`, `notifs_select_own`, `notifs_update_own` | 7 | None |
| `storage.objects` | `chat_media_delete_unreferenced_sender`, `chat_media_insert_sender`, `chat_media_select_participant`, `storage_delete_own`, `storage_insert_own`, `storage_select_own`, `storage_update_own` | 2 | `protect_objects_delete`, `update_objects_updated_at` |
| `public.profiles` | `admin_ban_users`, `profiles_insert_own`, `profiles_select_public`, `profiles_update_own` | 4 | `profiles_lock_voice_note_preference`, `set_profiles_updated_at` |

- All 4 conversations were direct with non-null, ordered participants. There were zero duplicate pairs. All 39 messages had a sender and a non-system kind. The new columns' defaults or null values satisfy the new legacy-row checks.
- The existing message-kind constraint already allowed system events. The conversation constraints limited type to direct and enforced ordered and unique pairs.
- `chat-media` was private with a 10 MiB limit and MIME types `audio/webm`, `audio/mp4`, and `audio/ogg`. `post-images` was public with no bucket-level file size or MIME limits.
- Nine functions were present in `private`, including the existing voice authorization and profile creation functions. All nine pinned their search path. The six notification trigger functions and legacy message summary function in `public` used `search_path=public`.
- The rollback fixture email count was zero before deployment.
