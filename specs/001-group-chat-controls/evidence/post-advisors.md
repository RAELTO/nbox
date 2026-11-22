# Supabase and security verification

Project `korxgckhjvsrknunqiif` · 2026-11-22 UTC

| Live check | Result |
| --- | --- |
| Group chat controls | `apply_migration` returned `{"success":true}`. Live history records `20261122014751_group_chat_controls`. |
| Profile enhancements and security hardening | `apply_migration` returned `{"success":true}`. Live history records `20261122014755_profile_enhancements_and_security_hardening`. |
| PostgREST | `NOTIFY pgrst, 'reload schema';` succeeded. |
| Rollback SQL suite | The checked-in `BEGIN … ROLLBACK` script executed successfully. MCP returned `[{"expect_error":""}]` from the final assertion, which confirms a banned caller received `user_banned`. A separate query returned `[{"remaining_rollback_fixtures":0}]`. |
| TypeScript contract | Live verification covered the RPCs and columns listed below. Checked-in TypeScript types were outside this verification scope. |

MCP assigned the live migration timestamps. Both migrations and the test suite ran as checked in.

## Live schema

- Verified `get_inbox_conversations`, `create_group_conversation`, `publish_group_text_message`, `publish_group_voice_message`, `set_group_voice_publication`, `set_group_voice_reception`, `get_group_members`, and `get_group_voice_state` in `public`. All eight are security invoker functions. `authenticated` has EXECUTE on all eight and `anon` has EXECUTE on zero.
- Verified `profiles.pinned_box_id` (UUID), `profiles.links` (JSONB), and `messages.group_sequence` (bigint).
- The live SQL assertions covered group membership and history boundaries, direct-chat compatibility, role and member limits, idempotency, voice policy and attachment visibility, Storage metadata RLS, notification integrity, profile pin ownership, and banned callers. Actual Storage HTTP transfers and concurrent behavior were outside the SQL suite.

## Live advisor comparison

| Advisor | Before | After | Findings |
| --- | ---: | ---: | --- |
| Security | 1 | 1 | Leaked Password Protection Disabled. The warning was already present. The post-change advisor returned zero new security findings. [Remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
| Unindexed foreign keys | 9 | 9 | Same nine foreign keys. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) |
| RLS init plan | 33 | 32 | The finding for `profiles_update_own` cleared. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) |
| Unused indexes | 17 | 22 | Seven newly created indexes appeared in this snapshot. The entries for `idx_messages_sender` and `idx_convpart_user` cleared. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) |
| Multiple permissive policies | 24 | 19 | Five profile UPDATE entries cleared. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) |
| **Performance total** | **83** | **82** | |

The seven newly reported unused indexes were `conversations_last_message_sender_idx`, `conversations_inbox_order_idx`, `participants_active_user_idx`, `participants_active_history_idx`, `participants_active_admin_idx`, `messages_visible_group_idx`, and `profiles_pinned_box_id_idx`.

## Local results

| Command or check | Observed result |
| --- | --- |
| `pnpm lint` | Exit 0 |
| `pnpm build` | Exit 0. Vite 8.2.2 transformed 2,011 modules and reported `✓ built in 624ms`. |
| TypeScript strict check for both new Playwright specs | Exit 0 |
| `pnpm exec playwright test --project=public-chromium` | `10 passed (4.9s)`, including all four credential-free security checks |
| `pnpm test:e2e` | `157 skipped` and `21 passed (27.4s)`. The 21 include three setup cases that wrote empty auth states because credentials were absent. |
| PostgreSQL fixture run | Both migrations applied. `Group assertions passed and rolled back`. |

The disposable PGlite fixture used the checked-in notification and direct-voice migrations and modeled the legacy direct-chat tables from the TypeScript contract. Its SQL assertions exercise direct-chat compatibility, authorization, rejoin visibility, the 50-member limit, last-admin and close rules, request retries, policy-version conflicts, attachment and Storage RLS, profile pin ownership, notification integrity, and banned callers. Live Storage API behavior and concurrent transactions remain unverified.

The group suite exercises US1–US4 through browser requests against the database and Storage APIs. It is registered in all five requested projects and requires `E2E_GROUPS_ENABLED=true` plus three dedicated accounts from the existing E2E credential configuration. The demo account must have both other accounts as accepted contacts. Group UI flows need a branch with the group interface.

DOMPurify is pinned to `3.4.18`. The npm registry reports publication on `2026-11-14T14:18:25.242Z`, and pnpm installed it under the repository's 10,080-minute release age policy.

## Security control mapping

| Change | OWASP Top 10:2025 | ISO/IEC 27001 Annex A and ISO/IEC 27002:2022 |
| --- | --- | --- |
| Group, attachment, and Storage RLS. Profile pin ownership, notification integrity, and ban enforcement. | A01 Broken Access Control | 8.3 Information access restriction |
| CSP, HSTS, browser permissions, function search paths, and upload MIME restrictions. | A02 Security Misconfiguration | 8.9 Configuration management, 8.26 Application security requirements |
| Exact DOMPurify dependency with the existing release age and provenance checks. | A03 Software Supply Chain Failures | 5.21 Managing information security in the ICT supply chain |
| URL and markup sanitization, Zod validation, and escaped search predicates. | A05 Injection | 8.28 Secure coding |
| Role-based SQL assertions, browser checks, and bundle secret scanning. | A01, A02 and A05 verification | 8.29 Security testing in development and acceptance |

The table maps engineering changes to relevant risks and controls. [OWASP Top 10:2025](https://top10.owasp.org/2025/) · [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) · [ISO/IEC 27002:2022](https://www.iso.org/standard/75652.html)

## Contract considerations

- Closing with other active members raises `group_other_members_exist`.
- The requested group creator constraint requires a non-null `created_by`, and the requested foreign key uses `ON DELETE SET NULL`. Deleting a creator profile while its group rows still exist therefore fails the group constraint.

## Live verification for stories, social groups, and admin chat force-close

Applied `20260913120000_stories_social_groups_and_admin_close.sql` through Supabase MCP on project `korxgckhjvsrknunqiif` on 2026-11-22 UTC. MCP recorded the live migration as version `20261122022308` under `stories_social_groups_and_admin_close`. Sent the PostgREST schema reload notification and verified `public.stories` in the `supabase_realtime` publication.

- `supabase/tests/group_chat_controls.sql` passed through `execute_sql` and reached its rollback.
- `supabase/tests/stories_and_social_groups.sql` passed through `execute_sql` and reached its rollback. It verified force-close visibility for all participants, the retry and authentic close event, story expiry and views, private box access and search, and community membership, moderation, pinning, and deletion.
- A separate query after both rollbacks returned `0` auth users with emails matching `%@example.invalid`.

| Advisor finding | Before | After | New finding identities |
| --- | ---: | ---: | ---: |
| Leaked password protection disabled | 1 | 1 | 0 |
| Unindexed foreign keys | 9 | 9 | 0 |
| RLS initplan | 32 | 27 | 0 |
| Multiple permissive policies | 19 | 9 | 0 |
| Unused indexes (informational) | 21 | 26 | 6 |

Compared findings by lint name and detail. The existing security warning is for the project's Auth configuration. [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

The final performance snapshot includes six new unused-index notices. The migration adds full indexes on `group_members.user_id` and `boxes.group_id` to cover foreign-key operations across all membership and publication states. [Supabase database linter](https://supabase.com/docs/guides/database/database-linter)
