import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const dbName = `supercompat_test_${randomUUID().replace(/-/g, '_')}`
const dbUrl = `postgresql://postgres:postgres@localhost:5432/${dbName}?connection_limit=1`

console.log(`Creating database ${dbName}`)
execSync(`createdb -h localhost -U postgres ${dbName}`, {
  stdio: 'inherit',
  env: { ...process.env, PGPASSWORD: 'postgres' },
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
