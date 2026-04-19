import { execSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream, globSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const pgEnv = { ...process.env, PGPASSWORD: 'postgres' }

// --- Timestamped log file -------------------------------------------------
// Tee stdout/stderr to test-results/run-<YYYYMMDD-HHMMSS>.log so terminal
// truncation doesn't lose output from long parallel runs.
const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const stamp =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
const logDir = resolve(process.cwd(), 'test-results')
mkdirSync(logDir, { recursive: true })
const logPath = resolve(logDir, `run-${stamp}.log`)
const logStream = createWriteStream(logPath, { flags: 'a' })

console.log(`[runTests] Logging to ${logPath}`)
logStream.write(`# test run started ${now.toISOString()}\n`)

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

// Run a command streaming stdout/stderr to BOTH the terminal and the log
// file. Rejects if the child exits non-zero so we can preserve the existing
// "throw on test failure" behaviour.
function runTee(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: ['inherit', 'pipe', 'pipe'] })

    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk)
      logStream.write(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
      logStream.write(chunk)
    })

    child.on('exit', (code, signal) => {
      if (code === 0) return resolvePromise()
      const reason = signal ? `signal ${signal}` : `exit code ${code}`
      reject(new Error(`${command} ${args.join(' ')} failed with ${reason}`))
    })
    child.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Two-phase suite
// ---------------------------------------------------------------------------
// Phase 1 ("fast") — stateless API tests + unit tests. Safe to run with very
// high concurrency because each file only talks to a well-rate-limited HTTP
// service, or doesn't leave the process at all.
//
// Phase 2 ("slow") — files that own Docker containers (all `*computerUse*`
// plus the lib/computerUse integration file), files that drive the single
// local Ollama queue (ollama/base + ollama/ollama), and files hitting
// strictly rate-limited APIs (all Together variants). These get run at low
// concurrency so they don't choke each other.
//
// `--test-skip-pattern` doesn't exist in Node's test runner, so we enumerate
// the full glob once and partition it here.
//
// Overrides:
//   TEST_CONCURRENCY_FAST (default 32)
//   TEST_CONCURRENCY_SLOW (default 3)
//   SUPERCOMPAT_SINGLE_PHASE=1  — skip the split and run everything at
//                                 TEST_CONCURRENCY (default 6) like before.
// ---------------------------------------------------------------------------

const SLOW_FILE_PATTERNS: RegExp[] = [
  // Every file that spins up a computer-use-mcp Docker container
  /computerUse\.test\.ts$/i,
  /\/lib\/computerUse\/integration\.test\.ts$/,
  // Local Ollama — serves one request at a time regardless of concurrency
  /\/ollama\/(base|ollama)\.test\.ts$/,
  // Together AI — 60 RPM free-tier; parallel runs burn through the budget
  /\/together\/.*\.test\.ts$/,
  /\/memory\/together\.test\.ts$/,
]

function isSlow(path: string): boolean {
  return SLOW_FILE_PATTERNS.some((rx) => rx.test(path))
}

const allTestFiles = globSync('packages/supercompat/tests/**/*.test.ts').sort()
const slowTestFiles = allTestFiles.filter(isSlow)
const fastTestFiles = allTestFiles.filter((f) => !isSlow(f))

console.log(`[runTests] ${fastTestFiles.length} fast + ${slowTestFiles.length} slow test files`)
if (process.env.DEBUG_TEST_BUCKETS) {
  console.log('[runTests] slow files:', slowTestFiles)
}

async function main() {
  execSync('npx prisma db push --accept-data-loss --skip-generate --schema packages/supercompat/prisma/schema.prisma', {
    stdio: 'inherit',
    env: commonEnv,
  })

  if (process.env.SUPERCOMPAT_SINGLE_PHASE) {
    const concurrency = process.env.TEST_CONCURRENCY ?? '6'
    console.log(`[runTests] single-phase mode, --test-concurrency=${concurrency}`)
    await runTee(
      'npx',
      [
        'tsx',
        '--tsconfig', 'tsconfig.test.json',
        '--test',
        '--test-isolation=process',
        `--test-concurrency=${concurrency}`,
        '--test-force-exit',
        'packages/supercompat/tests/**/*.test.ts',
      ],
      { ...commonEnv, NODE_ENV: 'test' },
    )
    return
  }

  // Phase 1 — fast, high concurrency. Stateless API + unit tests.
  const fastConcurrency = process.env.TEST_CONCURRENCY_FAST ?? '32'
  console.log(`[runTests] phase 1: ${fastTestFiles.length} fast files at --test-concurrency=${fastConcurrency}`)
  let phase1Error: unknown = null
  try {
    await runTee(
      'npx',
      [
        'tsx',
        '--tsconfig', 'tsconfig.test.json',
        '--test',
        '--test-isolation=process',
        `--test-concurrency=${fastConcurrency}`,
        '--test-force-exit',
        ...fastTestFiles,
      ],
      { ...commonEnv, NODE_ENV: 'test' },
    )
  } catch (err) {
    // Don't abort early — still run phase 2 so we get full signal, but
    // remember the failure so the overall process exits non-zero.
    phase1Error = err
    console.error(`[runTests] phase 1 had failures, continuing into phase 2: ${(err as Error).message}`)
  }

  // Phase 2 — slow, low concurrency. Docker containers + Ollama + Together.
  const slowConcurrency = process.env.TEST_CONCURRENCY_SLOW ?? '3'
  console.log(`[runTests] phase 2: ${slowTestFiles.length} slow files at --test-concurrency=${slowConcurrency}`)
  let phase2Error: unknown = null
  try {
    if (slowTestFiles.length > 0) {
      await runTee(
        'npx',
        [
          'tsx',
          '--tsconfig', 'tsconfig.test.json',
          '--test',
          '--test-isolation=process',
          `--test-concurrency=${slowConcurrency}`,
          '--test-force-exit',
          ...slowTestFiles,
        ],
        { ...commonEnv, NODE_ENV: 'test' },
      )
    }
  } catch (err) {
    phase2Error = err
    console.error(`[runTests] phase 2 had failures: ${(err as Error).message}`)
  }

  if (phase1Error || phase2Error) {
    throw new Error(
      `Test suite had failures — ` +
      `phase1=${phase1Error ? 'failed' : 'ok'}, phase2=${phase2Error ? 'failed' : 'ok'}`,
    )
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => {
    console.log(`Database ${dbName} preserved for inspection`)
    console.log(`[runTests] Full log: ${logPath}`)
    logStream.end()
  })
