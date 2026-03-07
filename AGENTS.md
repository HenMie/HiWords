# Repository Guidelines

## Project Structure & Module Organization

`main.ts` is the Obsidian plugin entry point and wires commands, views, and settings.
Primary source lives in `src/`: `core/` holds vocabulary and morphology logic,
`ui/` contains modals, sidebars, and highlighters, `canvas/` handles Canvas import
workflows, `services/` contains external-facing helpers, `i18n/` stores locale
strings, and `utils/` keeps shared types and utilities. Build and release metadata
live at the root in `manifest.json`, `versions.json`, and `styles.css`. Treat
`main.js` as generated output, not hand-edited source. Helper scripts belong in
`scripts/`.

## Build, Test, and Development Commands

- `npm ci` — install the exact dependency set from `package-lock.json`.
- `npm run dev` — start the esbuild watcher for local plugin development.
- `npm run build` — run TypeScript checks and produce a production `main.js`.
- `npm run copy-wasm` — refresh bundled WASM assets when packaging logic changes.
- `npx eslint main.ts "src/**/*.ts"` — run the configured TypeScript lint rules.

## Coding Style & Naming Conventions

Use TypeScript with strict null checks and keep changes modular. Existing source
uses single quotes, no semicolons, and 4-space indentation in `.ts` files; match
the surrounding file instead of reformatting unrelated lines. Prefer `kebab-case`
for filenames (`word-matcher-service.ts`), `PascalCase` for classes and exported
types, and `UPPER_SNAKE_CASE` for constants. Keep imports grouped as external,
internal, and type-only where helpful.

## Testing Guidelines

There is no dedicated automated test suite in this repository yet, so `npm run build`
is the minimum required validation for every change. For behavior changes, verify
the affected flow inside Obsidian, especially reading-mode highlighting, PDF
highlighting, Canvas sync, and morphology settings. If you add tests, prefer focused
`*.test.ts` files near the changed module or under a small `tests/` directory.

## Commit & Pull Request Guidelines

Follow the commit style already used in history: `feat: ...`, `fix(ci): ...`,
`refactor: ...`, `chore(release): ...`. Keep commits scoped to one concern. Pull
requests should summarize user-visible impact, list touched areas (`core`, `ui`,
`i18n`, `canvas`), and include screenshots or GIFs for interface changes. If a PR
affects releases, keep `manifest.json` and `versions.json` in sync with the shipped
version; release tags may be bare or `v`-prefixed, but they must resolve to the
manifest version in CI.

## Security & Configuration Tips

Do not commit real API keys or private endpoints. AI dictionary credentials should
remain in local plugin settings, and new networked features should fail loudly when
configuration is missing instead of shipping hidden fallbacks.
