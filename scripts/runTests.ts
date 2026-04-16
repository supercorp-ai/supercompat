import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const pgEnv = { ...process.env, PGPASSWORD: 'postgres' }

// Clean up old test databases
try {
  const oldDbs = execSync(
    `psql -h localhost -U postgres -t -c "SELECT datname FROM pg_database WHERE datname LIKE 'supercompat_test_%'"`,
    { env: pgEnv, encoding: 'utf-8' },
  ).trim().split('\n').map(s => s.trim()).filter(Boolean)
  for (const db of oldDbs) {
    try { execSync(`dropdb -h localhost -U postgres ${db}`, { stdio: 'ignore', env: pgEnv }) } catch {}
  }
} catch {}

const dbName = `supercompat_test_${randomUUID().replace(/-/g, '_')}`
const dbUrl = `postgresql://postgres:postgres@localhost:5432/${dbName}?connection_limit=1`

console.log(`Creating database ${dbName}`)
execSync(`createdb -h localhost -U postgres ${dbName}`, {
  stdio: 'inherit',
  env: pgEnv,
})

const commonEnv = { ...process.env, DATABASE_URL: dbUrl }

try {
  execSync('npx prisma db push --accept-data-loss --skip-generate --schema packages/supercompat/prisma/schema.prisma', {
    stdio: 'inherit',
    env: commonEnv,
  })

  execSync(
    'npx tsx --tsconfig tsconfig.test.json --test --test-isolation=process --test-concurrency=256 --test-force-exit "packages/supercompat/tests/**/*.test.ts"',
    {
      stdio: 'inherit',
      env: { ...commonEnv, NODE_ENV: 'test' },
    },
  )
} finally {
  console.log(`Database ${dbName} preserved for inspection`)
}
