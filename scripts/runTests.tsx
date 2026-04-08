import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import { spawn, execSync } from 'node:child_process'
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const testsDir = 'packages/supercompat/tests'
const tsconfig = '--tsconfig tsconfig.test.json'
const baseCmd = `npx tsx ${tsconfig} --test --test-force-exit`
const logDir = 'test-results'
const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
const logFile = join(logDir, `run-${runTimestamp}.log`)
const errFile = join(logDir, `run-${runTimestamp}.errors.log`)

// Ensure log dir exists
mkdirSync(logDir, { recursive: true })
writeFileSync(logFile, `Test run started: ${new Date().toISOString()}\n\n`)
writeFileSync(errFile, `Test run started: ${new Date().toISOString()}\n\n`)

function log(msg: string) {
  appendFileSync(logFile, msg + '\n')
}

function logError(msg: string) {
  appendFileSync(errFile, msg + '\n')
}

type GroupConfig = {
  name: string
  pattern: string
  concurrency: number
}

const groupConfigs: GroupConfig[] = [
  { name: 'unit', pattern: `${testsDir}/lib/**/*.test.ts`, concurrency: 8 },
  { name: 'openai-assistants', pattern: `${testsDir}/openaiAssistants/openai/*.test.ts`, concurrency: 1 },
  { name: 'openai-responses', pattern: `${testsDir}/openaiResponses/openai/*.test.ts`, concurrency: 1 },
  { name: 'anthropic', pattern: `${testsDir}/openai{Assistants,Responses}/anthropic/*.test.ts`, concurrency: 1 },
  { name: 'azure', pattern: `${testsDir}/openai{Assistants,Responses}/azure/*.test.ts`, concurrency: 1 },
  { name: 'groq', pattern: `${testsDir}/openai{Assistants,Responses}/groq/*.test.ts`, concurrency: 1 },
  { name: 'google', pattern: `${testsDir}/openai{Assistants,Responses}/google/*.test.ts`, concurrency: 1 },
  { name: 'mistral', pattern: `${testsDir}/openai{Assistants,Responses}/mistral/*.test.ts`, concurrency: 1 },
  { name: 'openRouter', pattern: `${testsDir}/openai{Assistants,Responses}/openRouter/*.test.ts`, concurrency: 1 },
  { name: 'together', pattern: `${testsDir}/openai{Assistants,Responses}/together/*.test.ts`, concurrency: 1 },
  { name: 'perplexity', pattern: `${testsDir}/openai{Assistants,Responses}/perplexity/*.test.ts`, concurrency: 1 },
  { name: 'humiris', pattern: `${testsDir}/openai{Assistants,Responses}/humiris/*.test.ts`, concurrency: 1 },
]

function countFiles(pattern: string): number {
  try {
    const result = execSync(`ls -1 ${pattern} 2>/dev/null | wc -l`, { encoding: 'utf-8' })
    return parseInt(result.trim()) || 0
  } catch { return 0 }
}

type GroupState = {
  name: string
  status: 'running' | 'retrying' | 'done'
  pass: number
  fail: number
  flaky: number
  skip: number
  totalTests: number
  fileCount: number
  currentTest: string
  failures: string[]
  startTime: number
  duration: number
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}

function ProgressBar({ pass, fail, total }: { pass: number; fail: number; total: number }) {
  const width = 16
  if (total === 0) return <Text dimColor>{'░'.repeat(width)}</Text>
  const passW = Math.round((pass / total) * width)
  const failW = Math.round((fail / total) * width)
  const emptyW = Math.max(0, width - passW - failW)
  return (
    <Text>
      <Text color="green">{'█'.repeat(passW)}</Text>
      <Text color="red">{'█'.repeat(failW)}</Text>
      <Text dimColor>{'░'.repeat(emptyW)}</Text>
    </Text>
  )
}

function GroupRow({ state, now }: { state: GroupState; now: number }) {
  const t = state.status === 'done' ? state.duration : now - state.startTime
  const done = state.pass + state.fail
  const total = state.totalTests || done
  const remaining = Math.max(0, total - done)

  if (state.status === 'done') {
    const icon = state.fail > 0 ? '❌' : state.pass === 0 ? '⚠️ ' : state.flaky > 0 ? '⚠️ ' : '✅'
    const iconColor = state.fail > 0 ? 'red' : state.pass === 0 ? 'yellow' : state.flaky > 0 ? 'yellow' : 'green'
    return (
      <Box>
        <Text color={iconColor}>{`  ${icon} `}</Text>
        <Text>{state.name.padEnd(20)}</Text>
        <ProgressBar pass={state.pass} fail={state.fail} total={total} />
        <Text color="green">{` ${String(state.pass).padStart(3)}`}</Text>
        {state.fail > 0 && <Text color="red">{`  ${state.fail} err`}</Text>}
        {state.flaky > 0 && <Text color="yellow">{`  ${state.flaky} flaky`}</Text>}
        {state.skip > 0 && <Text color="yellow">{`  ${state.skip} skip`}</Text>}
        <Text dimColor>{`  ${elapsed(state.duration)}`}</Text>
      </Box>
    )
  }

  const testName = state.currentTest.length > 30 ? state.currentTest.slice(0, 27) + '...' : state.currentTest
  return (
    <Box>
      <Text color={state.status === 'retrying' ? 'yellow' : 'cyan'}>{state.status === 'retrying' ? '  🔄 ' : '  ⏳ '}</Text>
      <Text>{state.name.padEnd(20)}</Text>
      <ProgressBar pass={state.pass} fail={state.fail} total={total || state.fileCount * 10} />
      <Text>{` ${String(done).padStart(3)}`}</Text>
      {state.fail > 0 && <Text color="red">{`  ${state.fail} err`}</Text>}
      {remaining > 0 && <Text dimColor>{`  ~${remaining} left`}</Text>}
      <Text dimColor>{`  ${elapsed(t)}  `}</Text>
      <Text dimColor>{state.status === 'retrying' ? 'retrying failures...' : testName}</Text>
    </Box>
  )
}

function Dashboard() {
  const [states, setStates] = useState<GroupState[]>(
    groupConfigs.map(g => ({
      name: g.name,
      status: 'running',
      pass: 0,
      fail: 0,
      flaky: 0,
      skip: 0,
      totalTests: 0,
      fileCount: countFiles(g.pattern),
      currentTest: 'starting...',
      failures: [],
      startTime: Date.now(),
      duration: 0,
    }))
  )
  const [now, setNow] = useState(Date.now())
  const [globalStart] = useState(Date.now())
  const [allDone, setAllDone] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const MAX_PARALLEL_GROUPS = 8

    const execGroup = (group: GroupConfig, index: number, isRetry: boolean) => {
      const cmd = `${baseCmd} --test-concurrency=${group.concurrency} ${group.pattern}`
      const dbUrl = process.env.DATABASE_URL || ''
      const separator = dbUrl.includes('?') ? '&' : '?'
      const pooledDbUrl = `${dbUrl}${separator}connection_limit=2`
      const label = isRetry ? `${group.name} retry` : group.name

      return new Promise<{ pass: number; fail: number; skip: number; failures: string[]; stdout: string; stderr: string }>((resolve) => {
        const child = spawn('sh', ['-c', cmd], {
          env: { ...process.env, DATABASE_URL: pooledDbUrl },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let pass = 0
        let fail = 0
        const failures: string[] = []

        child.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString()
          stdout += text
          setStates(prev => {
            const next = [...prev]
            const s = { ...next[index], failures: [...next[index].failures] }
            for (const line of text.split('\n')) {
              const pm = line.match(/✔\s+(.+?)\s+\(/)
              if (pm) {
                if (!isRetry) s.pass++
                s.currentTest = pm[1]
                log(`✅ [${label}] ${pm[1]}`)
              }
              const fm = line.match(/✖\s+(.+?)(?:\s+\(\d[\d.]*(?:ms|s)\))?$/)
              if (fm) {
                if (!isRetry) { s.fail++; s.failures.push(fm[1]) }
                s.currentTest = fm[1]
                log(`FAIL [${label}] ${fm[1]}`)
                logError(`FAIL [${label}] ${fm[1]}`)
              }
              const tm = line.match(/ℹ tests (\d+)/)
              if (tm && !isRetry) s.totalTests = parseInt(tm[1])
            }
            next[index] = s
            return next
          })

          // Track results locally for retry logic
          for (const line of text.split('\n')) {
            if (/✔\s+(.+?)\s+\(/.test(line)) pass++
            const fm = line.match(/✖\s+(.+?)(?:\s+\(\d[\d.]*(?:ms|s)\))?$/)
            if (fm) { fail++; failures.push(fm[1]) }
          }
        })

        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })

        child.on('close', () => {
          log(`\n${'='.repeat(60)}`)
          log(`[${label}] completed`)
          log(`${'='.repeat(60)}`)
          log(stdout)
          if (stderr.trim()) {
            log(`\n--- stderr ---`)
            log(stderr)
          }

          const hasFailures = /✖/.test(stdout)
          if (hasFailures || stderr.trim()) {
            logError(`\n${'='.repeat(60)}`)
            logError(`FAIL [${label}]`)
            logError(`${'='.repeat(60)}`)
            if (hasFailures) logError(stdout)
            if (stderr.trim()) { logError(`\n--- stderr ---`); logError(stderr) }
          }

          let skip = 0
          const sm = stdout.match(/ℹ skipped (\d+)/)
          if (sm) skip = parseInt(sm[1])

          resolve({ pass, fail, skip, failures, stdout, stderr })
        })
      })
    }

    const runGroup = async (group: GroupConfig, index: number) => {
      const first = await execGroup(group, index, false)

      // Retry once if there were failures
      if (first.failures.length > 0) {
        const firstFailures = new Set(first.failures)
        log(`\n🔄 [${group.name}] Retrying ${firstFailures.size} failed test(s)...`)

        setStates(prev => {
          const next = [...prev]
          next[index] = { ...next[index], status: 'retrying', currentTest: 'retrying...' }
          return next
        })

        const retry = await execGroup(group, index, true)

        // Tests that failed first but passed on retry are flaky
        const retryFailures = new Set(retry.failures)
        const flakyTests: string[] = []
        const realFailures: string[] = []

        for (const name of firstFailures) {
          if (!retryFailures.has(name)) {
            flakyTests.push(name)
          } else {
            realFailures.push(name)
          }
        }

        if (flakyTests.length > 0) {
          log(`\n⚠️  [${group.name}] ${flakyTests.length} flaky test(s) (passed on retry):`)
          for (const t of flakyTests) log(`    ⚠️  ${t}`)
        }

        setStates(prev => {
          const next = [...prev]
          const s = { ...next[index] }
          s.duration = Date.now() - s.startTime
          s.status = 'done'
          // Adjust counts: move flaky from fail to flaky
          s.fail -= flakyTests.length
          s.flaky = flakyTests.length
          s.failures = realFailures
          s.skip = first.skip
          next[index] = s
          return next
        })
      } else {
        setStates(prev => {
          const next = [...prev]
          const s = { ...next[index] }
          s.duration = Date.now() - s.startTime
          s.status = 'done'
          s.skip = first.skip
          next[index] = s
          return next
        })
      }
    }

    // Run groups with limited concurrency to avoid exhausting database connections
    async function runAll() {
      const running = new Set<Promise<void>>()
      for (let i = 0; i < groupConfigs.length; i++) {
        const p = runGroup(groupConfigs[i], i).then(() => { running.delete(p) })
        running.add(p)
        if (running.size >= MAX_PARALLEL_GROUPS) {
          await Promise.race(running)
        }
      }
      await Promise.all(running)
    }

    runAll().then(() => setAllDone(true))
  }, [])

  useEffect(() => {
    if (!allDone) return
    const totalPass = states.reduce((a, s) => a + s.pass, 0)
    const totalFail = states.reduce((a, s) => a + s.fail, 0)
    const totalFlaky = states.reduce((a, s) => a + s.flaky, 0)
    const totalSkip = states.reduce((a, s) => a + s.skip, 0)
    const wall = Date.now() - globalStart
    const seqTime = states.reduce((a, s) => a + s.duration, 0)

    log(`\n${'='.repeat(60)}`)
    log(`FINAL: ${totalPass} pass, ${totalFail} fail, ${totalFlaky} flaky, ${totalSkip} skip`)
    log(`Wall time: ${elapsed(wall)} (saved ${elapsed(seqTime - wall)} vs sequential)`)
    log(`${'='.repeat(60)}`)

    if (totalFail > 0) {
      log('\nAll failures:')
      logError(`\nFAIL summary: ${totalFail} failed tests`)
      for (const s of states) {
        for (const f of s.failures) {
          log(`  FAIL ${s.name}: ${f}`)
          logError(`  FAIL ${s.name}: ${f}`)
        }
      }
    }

    setTimeout(() => process.exit(totalFail > 0 ? 1 : 0), 500)
  }, [allDone, states])

  const totalPass = states.reduce((a, s) => a + s.pass, 0)
  const totalFail = states.reduce((a, s) => a + s.fail, 0)
  const totalFlaky = states.reduce((a, s) => a + s.flaky, 0)
  const totalSkip = states.reduce((a, s) => a + s.skip, 0)
  const totalTests = states.reduce((a, s) => a + (s.totalTests || s.pass + s.fail), 0)
  const totalDone = states.reduce((a, s) => a + s.pass + s.fail, 0)
  const groupsDone = states.filter(s => s.status === 'done').length
  const wall = now - globalStart
  const seqTime = states.reduce((a, s) => a + (s.status === 'done' ? s.duration : 0), 0)
  const allFailures = states.flatMap(s => s.failures.map(f => ({ group: s.name, test: f, status: s.status })))

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Text dimColor>{'  '}Log: {logFile}</Text>
        <Text dimColor>{'  '}Errors: {errFile}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold>
          {'  '}
          <Text color="green">{totalPass} pass</Text>
          <Text color={totalFail > 0 ? 'red' : 'green'}>{`  ${totalFail} fail`}</Text>
          {totalFlaky > 0 && <Text color="yellow">{`  ${totalFlaky} flaky`}</Text>}
          {totalSkip > 0 && <Text color="yellow">{`  ${totalSkip} skip`}</Text>}
          {'  '}
          <Text dimColor>
            {totalDone}/{totalTests > 0 ? totalTests : '?'} tests
            {'  '}{groupsDone}/{groupConfigs.length} groups
            {'  '}{elapsed(wall)}
          </Text>
          {allDone && seqTime > wall && <Text dimColor>{`  (${elapsed(seqTime - wall)} saved)`}</Text>}
        </Text>
      </Box>

      {states.map((state, i) => (
        <GroupRow key={i} state={state} now={now} />
      ))}

      {allFailures.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">{'  Failures:'}</Text>
          {allFailures.slice(-15).map((f, i) => (
            f.status === 'retrying'
              ? <Text key={i} color="yellow">{'    🔄 '}{f.group}: {f.test} <Text dimColor>(retrying)</Text></Text>
              : f.status === 'running'
                ? <Text key={i} color="yellow">{'    ⏳ '}{f.group}: {f.test} <Text dimColor>(will retry)</Text></Text>
                : <Text key={i} color="red">{'    ❌ '}{f.group}: {f.test}</Text>
          ))}
          {allFailures.length > 15 && (
            <Text dimColor>{`    ... and ${allFailures.length - 15} more (see ${logFile})`}</Text>
          )}
        </Box>
      )}

      {allDone && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>
            {'  '}Total: <Text color="green">{totalPass} pass</Text>
            {totalFail > 0 && <Text color="red">, {totalFail} fail</Text>}
            {totalFlaky > 0 && <Text color="yellow">, {totalFlaky} flaky</Text>}
            {totalSkip > 0 && <Text color="yellow">, {totalSkip} skip</Text>}
          </Text>
          <Text dimColor>{'  '}Full log: {logFile}</Text>
          <Text dimColor>{'  '}Errors: {errFile}</Text>
        </Box>
      )}
    </Box>
  )
}

render(<Dashboard />)
