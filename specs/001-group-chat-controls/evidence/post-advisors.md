# Supabase and security verification

Project `korxgckhjvsrknunqiif` · 2026-11-21

| Live check | Status |
| --- | --- |
| Apply both migrations through `apply_migration` | Pending restored MCP OAuth access and live baseline |
| Run the rollback suite through `execute_sql` | Pending live migrations |
| Run security and performance advisors | Pending live migrations |
| Compare checked-in TypeScript types with the project catalog | Pending live database access |

The baseline attempts in [pre-advisors.md](pre-advisors.md) failed during MCP OAuth refresh. The project database received no migration or fixture changes from this work.

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
