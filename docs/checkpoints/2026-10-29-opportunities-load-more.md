# Opportunities: load more (2026-10-29)

- Added authenticated, explicitly requested opportunity pages of 20, preserving server search and sort parameters.
- Loaded pages append with ID deduplication; existing list and Kanban, local filters/sort and CSV all consume the same loaded records.
- Page failures preserve records and page cursor for retry. A synchronous request lock prevents concurrent extra requests.
- Request generations invalidate late pages on token, submitted search, full refresh, and unmount; full refresh resets pagination and extra-page error/loading state.
- Customer lookup dropdown requests, backend, permissions and mutation behavior are unchanged.
- New catalog key for parent integration: `Carregar mais oportunidades` → EN `Load more opportunities`; ES `Cargar más oportunidades`.

## Verification

- RED: all four initial pagination tests failed because the load-more control did not exist.
- GREEN: focused opportunity suite passed (6 files, 20 tests), including retry, authenticated requests, deduplication, concurrency, shared Kanban records and stale token/search results.
- Additional full-refresh race coverage added for stage movement; final focused run passed (6 files, 21 tests).
- `tsc --noEmit` passed using the root TypeScript binary from `apps/web`.
- Direct binaries used because pnpm's automatic dependency check refuses symlinked worktree dependencies; no install performed. Existing Vite configuration warning remains.
- Parent owns the aggregate web suite and catalog integration. No API/database access or deployment performed.
