# Supercompat — Agent Notes

## Quickstart

- Node: use `>=18` (v20+ recommended).
- Install: `npm ci` (from repo root).
- Env: add `TEST_OPENAI_API_KEY=sk-...` to `.env` in repo root. Optional: `HTTPS_PROXY=...`.
- Prisma (tests): `npm run setup:prisma` to create/reset the local test DB and generate Prisma clients.

## Build & Lint

- Build all: `npm run build`
- Type check (repo): `npm run lint`
- Type check (package): `cd packages/supercompat && npm run lint`

## Tests

- Run full suite with env: `npm run test:env`
  - Equivalent: `npx env-cmd -f .env npm test`
  - Uses Node’s built-in test runner via `tsx` and `tsconfig.test.json`.

### Run a single test file

- Example:
  - `npx env-cmd -f .env npx tsx --tsconfig tsconfig.test.json --test "packages/supercompat/tests/responsesApi.test.ts"`
  - Replace the test path to target a specific file.

## Troubleshooting

- TypeError reading `.text` on `undefined` in tests:
  - This usually means the assistant message content is not available yet (eventual consistency with the Assistants API). Re-run, or add a short retry when reading `message.content[0]`.
  - Ensure `.env` has a valid `TEST_OPENAI_API_KEY`.
  - Ensure Prisma DB is set up: `npm run setup:prisma` (requires local Postgres at `postgresql://postgres:postgres@localhost:5432/supercompat_test`).
  - If behind a proxy, set `HTTPS_PROXY` in `.env`.

## Notes

- Path aliases are resolved via `esbuild-plugin-tsconfig-paths` and TypeScript `paths` in `packages/supercompat/tsconfig.json`.
- DTS bundling is enabled. If you run into external type hoisting issues, switch to `dts: { resolve: false }` in `packages/supercompat/tsup.config.ts`.
