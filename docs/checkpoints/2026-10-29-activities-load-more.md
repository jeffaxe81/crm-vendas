# Activities pagination — 2026-10-29

Implemented in isolated branch `feat/activities-load-more-20261029`, based on `3a472f7c`.

Activities now offer **Carregar mais atividades** while the server page/total indicates remaining pages. Each request keeps the access token, submitted query, status, due-date ordering and 20-record limit. Results append with ID deduplication. Local priority/date filters and ICS export keep operating over loaded activities. Company/contact pickers remain unchanged.

A synchronous request lock prevents concurrent extra loads. A failed extra page leaves existing activities visible and retries the same page. Full reloads clear pagination metadata and invalidate pending extra responses; this covers query, status, token and successful create/status/delete mutations. Effect cleanup also invalidates requests after unmount.

Verification: initial five focused tests failed because the load-more control was missing (correct RED). After implementation, three focused activity files passed: 19 tests covering pagination/auth/deduplication, retry, concurrent loads, stale status/query/token responses, mutation reload invalidation, submitted search and local filters, and existing creation/lifecycle behavior. Web TypeScript (`tsc --noEmit`), scoped Prettier checks and `git diff --check` passed before commit. Coordinator runs the combined web suite.

Translation handoff (catalogs intentionally untouched): `Carregar mais atividades` → English `Load more activities`; Spanish `Cargar más actividades`. Existing loading/error strings are reused.

Tooling: direct Node CLIs used because pnpm 11 automatic dependency checks reject symlinked modules outside this worktree. The environment uses Node 24.19.0 versus declared 24.20.x. Vitest prints the pre-existing Vite config-loader warning. No deployed API/database access, push, PR or merge.
