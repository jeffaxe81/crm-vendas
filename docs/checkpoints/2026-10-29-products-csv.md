# Products visible-page CSV — 2026-10-29

Added a local CSV download for only products already loaded on the current server page. Read-only users can export their readable data. The button title explains its page scope and the button is disabled during loading, empty pages, and reported errors. Existing search, pagination, import and write permissions remain in place.

Columns: code, name, description, unit price (original decimal string to preserve precision), localized status. Existing CSV utility handles UTF-8, quoting and spreadsheet formula protection. No extra request or server change.

## Validation

- RED: products view tests failed in the three new export cases because the export button did not exist; five existing cases passed.
- GREEN: direct Vitest run for products-view.test.tsx and local-productivity-export.test.ts: 2 files, 10 tests passed. Blob content and download filename checked using the real exporter, including current-page isolation, read-only access, formula escaping, quoting and decimals; loading/empty/error disabling covered.
- Web TypeScript: `../../node_modules/.bin/tsc --noEmit` passed from apps/web.
- Prettier check passed for both changed source files.
- Aggregate web suite delegated to parent integration as requested. No deployed service or database accessed.
- pnpm command could not run with linked dependencies because its automatic dependency check refused the external modules directory. Used existing binary executables directly. Vitest emits the pre-existing Vite CommonJS config warning.

## Translation handoff

- `Exportar produtos CSV`: EN `Export products CSV`; ES `Exportar productos CSV`.
- `Exporta somente os produtos da página atual.`: EN `Exports only products on the current page.`; ES `Exporta solo los productos de la página actual.`

Catalog edits are handled by the parent integration task.
