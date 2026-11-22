# Supabase baseline

Project `korxgckhjvsrknunqiif` · 2026-11-21

| Requested check | Result |
| --- | --- |
| MCP `get_advisors` with `type=security` | Blocked during OAuth refresh |
| MCP `get_advisors` with `type=performance` | Blocked during OAuth refresh |
| MCP `execute_sql` to inspect tables, policies, and triggers in `public`, `private`, and `storage` | Blocked during OAuth refresh |

The session exposed no Supabase tools. The local Codex app server confirmed the project-scoped MCP configuration and returned JSON-RPC error `-32603` for each baseline request.

> failed to get client: MCP startup failed: OAuth token refresh failed: Failed to parse server response

## Repository baseline

- The voice migrations allow direct voice through a wrapper and private definer function. The attachment and chat-media read rules use active membership and predate group history boundaries and personal group reception rules.
- The notification migration defines six definer triggers with schema-qualified table references and a mutable `public` search path.
- The existing post-images Storage policies scope writes by folder. The social write policies have varying ban checks.
- The git migration history starts from existing direct-chat tables in the voice migrations. The original direct-chat DDL and live policy inventory remain unverified.
