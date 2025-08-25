# AGENTS

## Setup
- Use Node.js v24 via nvm:
  ```bash
  nvm install 24
  nvm use 24
  npm install
  ```
- Ensure a local PostgreSQL instance is running with user `postgres` and password `postgres`.
- Create a test database and set the connection string:
  ```bash
  createdb supercompat_test
  export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supercompat_test
  npx prisma migrate deploy --schema examples/prisma-nextjs/prisma/schema.prisma
  npx prisma generate --schema examples/prisma-nextjs/prisma/schema.prisma
  cp -r examples/prisma-nextjs/node_modules/.prisma packages/supercompat/node_modules/
  cp -r examples/prisma-nextjs/node_modules/@prisma packages/supercompat/node_modules/
  ```
- Ensure the following API environment variables are available for live tests:
  - `TEST_OPENAI_API_KEY`
  - `GROQ_API_KEY`
  - `MISTRAL_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `PERPLEXITY_API_KEY`
  - `AZURE_OPENAI_API_KEY`
  - `EXAMPLE_AZURE_OPENAI_ENDPOINT`
  - `GOOGLE_API_KEY`
  - `HUMIRIS_API_KEY`

## Testing
- Run the full quality gate before committing:
  ```bash
  npm run lint
  npm run lint:ts
  npm run test
  ```
- All tests must pass; none may be skipped.

## Code style
- Use two spaces for indentation, single quotes for strings, and omit semicolons.
- Avoid barrel files; import helpers directly from their files.
- Prefer ripgrep (`rg`) over recursive `grep`.
- Avoid nested ternary expressions; extract complex logic into helper functions instead.
