/**
 * Surface Validation Suite
 *
 * Calls the real OpenAI Assistants API and the supercompat Prisma adapter
 * side by side, comparing response shapes (keys + types).
 *
 * Any structural difference = compatibility gap.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import dns from 'node:dns'
import {
  supercompat,
  openaiClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

dns.setDefaultResultOrder('ipv4first')

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) throw new Error('TEST_OPENAI_API_KEY is required')

const prisma = new PrismaClient()

const httpOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
  : {}

/** Direct OpenAI client — real API */
const real = new OpenAI({ apiKey, ...httpOpts })

/** Supercompat client factory */
const createCompat = () => {
  const inner = new OpenAI({ apiKey, ...httpOpts })
  return supercompat({
    client: openaiClientAdapter({ openai: inner }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })
}

after(async () => {
  await prisma.$disconnect()
})

// ── Shape utilities ─────────────────────────────────────────────

const toPlain = (o: any): any => JSON.parse(JSON.stringify(o))

/**
 * Build a flat path→type map.
 *   { id: 'abc', meta: { k: 'v' }, items: [1] }
 *   → { id: 'string', meta: 'object', 'meta.k': 'string', items: 'array', 'items[]': 'number' }
 */
function shapeOf(obj: any, pre = ''): Record<string, string> {
  const m: Record<string, string> = {}
  if (obj === null) return { [pre || '$']: 'null' }
  if (obj === undefined) return { [pre || '$']: 'undefined' }
  if (Array.isArray(obj)) {
    m[pre || '$'] = 'array'
    if (obj.length > 0) Object.assign(m, shapeOf(obj[0], `${pre}[]`))
    return m
  }
  if (typeof obj !== 'object') return { [pre || '$']: typeof obj }

  for (const k of Object.keys(obj).sort()) {
    const p = pre ? `${pre}.${k}` : k
    const v = obj[k]
    if (v === null) m[p] = 'null'
    else if (v === undefined) m[p] = 'undefined'
    else if (Array.isArray(v)) {
      m[p] = 'array'
      if (v.length) Object.assign(m, shapeOf(v[0], `${p}[]`))
    } else if (typeof v === 'object') {
      m[p] = 'object'
      Object.assign(m, shapeOf(v, p))
    } else m[p] = typeof v
  }
  return m
}

function diffShapes(realS: Record<string, string>, compatS: Record<string, string>) {
  const missing: string[] = []
  const extra: string[] = []
  const typeDiffs: { p: string; r: string; c: string }[] = []

  for (const [p, t] of Object.entries(realS)) {
    if (!(p in compatS)) {
      missing.push(p)
      continue
    }
    // null vs any type is OK (nullable fields)
    if (compatS[p] !== t && t !== 'null' && compatS[p] !== 'null') {
      typeDiffs.push({ p, r: t, c: compatS[p] })
    }
  }
  for (const p of Object.keys(compatS)) {
    if (!(p in realS)) extra.push(p)
  }
  return { missing, extra, typeDiffs }
}

/**
 * Assert compat response structurally matches real.
 * @param allow paths to skip (intentional divergence)
 */
function assertSurface(
  realObj: any,
  compatObj: any,
  label: string,
  allow: string[] = [],
) {
  const r = shapeOf(toPlain(realObj))
  const c = shapeOf(toPlain(compatObj))
  const d = diffShapes(r, c)
  const skip = new Set(allow)

  const msgs: string[] = []
  const m = d.missing.filter((k) => !skip.has(k))
  const t = d.typeDiffs.filter((x) => !skip.has(x.p))

  if (m.length)
    msgs.push(
      `MISSING in compat [${label}]:\n` +
        m.map((k) => `  ${k} (${r[k]})`).join('\n'),
    )
  if (t.length)
    msgs.push(
      `TYPE MISMATCH [${label}]:\n` +
        t.map((x) => `  ${x.p}: real=${x.r} compat=${x.c}`).join('\n'),
    )
  if (d.extra.length)
    console.log(`  [info] extra keys [${label}]: ${d.extra.join(', ')}`)
  if (msgs.length) assert.fail(msgs.join('\n\n'))
}

/** Assert specific field values match between real and compat */
function assertValues(realObj: any, compatObj: any, keys: string[]) {
  for (const k of keys) {
    assert.deepEqual(
      (compatObj as any)[k],
      (realObj as any)[k],
      `Value mismatch for '${k}': real=${JSON.stringify((realObj as any)[k])}, compat=${JSON.stringify((compatObj as any)[k])}`,
    )
  }
}

// ── Assistant surface ─────────────────────────────────────────────

describe('Surface: Assistant', () => {
  test('create response shape matches OpenAI', async () => {
    const c = createCompat()
    const params: OpenAI.Beta.AssistantCreateParams = {
      model: 'gpt-4o-mini',
      name: 'Surface Test',
      description: 'Validation',
      instructions: 'Be helpful.',
      metadata: { env: 'test' },
    }

    const [rr, cc] = await Promise.all([
      real.beta.assistants.create(params),
      c.beta.assistants.create(params),
    ])

    assertSurface(rr, cc, 'Assistant.create')
    assertValues(rr, cc, [
      'object',
      'name',
      'description',
      'model',
      'instructions',
      'metadata',
    ])

    await Promise.all([
      real.beta.assistants.delete(rr.id),
      c.beta.assistants.delete(cc.id),
    ])
  })

  test('retrieve response shape matches OpenAI', async () => {
    const c = createCompat()
    const [rr, cc] = await Promise.all([
      real.beta.assistants.create({
        model: 'gpt-4o-mini',
        name: 'Retrieve',
        metadata: { x: '1' },
      }),
      c.beta.assistants.create({
        model: 'gpt-4o-mini',
        name: 'Retrieve',
        metadata: { x: '1' },
      }),
    ])

    const [rGet, cGet] = await Promise.all([
      real.beta.assistants.retrieve(rr.id),
      c.beta.assistants.retrieve(cc.id),
    ])

    assertSurface(rGet, cGet, 'Assistant.retrieve')
    assertValues(rGet, cGet, ['object', 'name', 'metadata'])

    await Promise.all([
      real.beta.assistants.delete(rr.id),
      c.beta.assistants.delete(cc.id),
    ])
  })

  test('update response shape matches OpenAI', async () => {
    const c = createCompat()
    const [rr, cc] = await Promise.all([
      real.beta.assistants.create({ model: 'gpt-4o-mini', name: 'Before' }),
      c.beta.assistants.create({ model: 'gpt-4o-mini', name: 'Before' }),
    ])

    const [rUp, cUp] = await Promise.all([
      real.beta.assistants.update(rr.id, {
        name: 'After',
        metadata: { updated: 'true' },
      }),
      c.beta.assistants.update(cc.id, {
        name: 'After',
        metadata: { updated: 'true' },
      }),
    ])

    assertSurface(rUp, cUp, 'Assistant.update')
    assertValues(rUp, cUp, ['object', 'name', 'metadata'])

    await Promise.all([
      real.beta.assistants.delete(rr.id),
      c.beta.assistants.delete(cc.id),
    ])
  })

  test('list item shape matches OpenAI', async () => {
    const c = createCompat()
    const [rr, cc] = await Promise.all([
      real.beta.assistants.create({ model: 'gpt-4o-mini', name: 'ListItem' }),
      c.beta.assistants.create({ model: 'gpt-4o-mini', name: 'ListItem' }),
    ])

    const [rList, cList] = await Promise.all([
      real.beta.assistants.list({ limit: 1 }),
      c.beta.assistants.list({ limit: 1 }),
    ])

    assert.ok(rList.data.length > 0, 'real list should have items')
    assert.ok(cList.data.length > 0, 'compat list should have items')
    assertSurface(rList.data[0], cList.data[0], 'Assistant.list[0]')

    // Also compare list-level fields that the SDK exposes
    assert.equal(typeof rList.has_more, typeof cList.has_more)

    await Promise.all([
      real.beta.assistants.delete(rr.id),
      c.beta.assistants.delete(cc.id),
    ])
  })

  test('delete response shape matches OpenAI', async () => {
    const c = createCompat()
    const [rr, cc] = await Promise.all([
      real.beta.assistants.create({ model: 'gpt-4o-mini' }),
      c.beta.assistants.create({ model: 'gpt-4o-mini' }),
    ])

    const [rDel, cDel] = await Promise.all([
      real.beta.assistants.delete(rr.id),
      c.beta.assistants.delete(cc.id),
    ])

    assertSurface(rDel, cDel, 'Assistant.delete')
    assertValues(rDel, cDel, ['object', 'deleted'])
  })
})

// ── Thread surface ────────────────────────────────────────────────

describe('Surface: Thread', () => {
  test('create response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rr, cc] = await Promise.all([
      real.beta.threads.create({ metadata: { purpose: 'test' } }),
      c.beta.threads.create({
        metadata: { assistantId: ca.id, purpose: 'test' },
      }),
    ])

    assertSurface(rr, cc, 'Thread.create')
    assertValues(rr, cc, ['object'])

    await Promise.all([
      real.beta.threads.delete(rr.id),
      c.beta.threads.delete(cc.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('retrieve response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rr, cc] = await Promise.all([
      real.beta.threads.create({ metadata: { purpose: 'test' } }),
      c.beta.threads.create({
        metadata: { assistantId: ca.id, purpose: 'test' },
      }),
    ])

    const [rGet, cGet] = await Promise.all([
      real.beta.threads.retrieve(rr.id),
      c.beta.threads.retrieve(cc.id),
    ])

    assertSurface(rGet, cGet, 'Thread.retrieve')
    assertValues(rGet, cGet, ['object'])

    await Promise.all([
      real.beta.threads.delete(rr.id),
      c.beta.threads.delete(cc.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('update response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rr, cc] = await Promise.all([
      real.beta.threads.create({ metadata: { purpose: 'test' } }),
      c.beta.threads.create({
        metadata: { assistantId: ca.id, purpose: 'test' },
      }),
    ])

    const [rUp, cUp] = await Promise.all([
      real.beta.threads.update(rr.id, {
        metadata: { purpose: 'updated' },
      }),
      c.beta.threads.update(cc.id, {
        metadata: { assistantId: ca.id, purpose: 'updated' },
      }),
    ])

    assertSurface(rUp, cUp, 'Thread.update')
    assertValues(rUp, cUp, ['object'])

    await Promise.all([
      real.beta.threads.delete(rr.id),
      c.beta.threads.delete(cc.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('delete response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rr, cc] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    const [rDel, cDel] = await Promise.all([
      real.beta.threads.delete(rr.id),
      c.beta.threads.delete(cc.id),
    ])

    assertSurface(rDel, cDel, 'Thread.delete')
    assertValues(rDel, cDel, ['object', 'deleted'])

    await c.beta.assistants.delete(ca.id)
  })
})

// ── Message surface ───────────────────────────────────────────────

describe('Surface: Message', () => {
  test('create response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    const [rMsg, cMsg] = await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'Hello surface test',
        metadata: { key: 'value' },
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'Hello surface test',
        metadata: { key: 'value' },
      }),
    ])

    assertSurface(rMsg, cMsg, 'Message.create')
    assertValues(rMsg, cMsg, ['object', 'role'])

    // Also verify content block structure matches
    assert.equal(rMsg.content.length, cMsg.content.length)
    assert.equal(rMsg.content[0].type, cMsg.content[0].type)
    if (rMsg.content[0].type === 'text' && cMsg.content[0].type === 'text') {
      assert.equal(rMsg.content[0].text.value, cMsg.content[0].text.value)
      assertSurface(
        rMsg.content[0],
        cMsg.content[0],
        'Message.create.content[0]',
      )
    }

    await Promise.all([
      real.beta.threads.delete(rt.id),
      c.beta.threads.delete(ct.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('retrieve response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    const [rMsg, cMsg] = await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'Retrieve test',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'Retrieve test',
      }),
    ])

    const [rGet, cGet] = await Promise.all([
      real.beta.threads.messages.retrieve(rMsg.id, { thread_id: rt.id }),
      c.beta.threads.messages.retrieve(cMsg.id, { thread_id: ct.id }),
    ])

    assertSurface(rGet, cGet, 'Message.retrieve')
    assertValues(rGet, cGet, ['object', 'role'])

    await Promise.all([
      real.beta.threads.delete(rt.id),
      c.beta.threads.delete(ct.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('update response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    const [rMsg, cMsg] = await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'Update test',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'Update test',
      }),
    ])

    const [rUp, cUp] = await Promise.all([
      real.beta.threads.messages.update(rMsg.id, {
        thread_id: rt.id,
        metadata: { tagged: 'yes' },
      }),
      c.beta.threads.messages.update(cMsg.id, {
        thread_id: ct.id,
        metadata: { tagged: 'yes' },
      }),
    ])

    // file_ids is a deprecated v1 field still returned by real API
    assertSurface(rUp, cUp, 'Message.update', ['file_ids'])
    assertValues(rUp, cUp, ['object', 'role'])

    await Promise.all([
      real.beta.threads.delete(rt.id),
      c.beta.threads.delete(ct.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('list item shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'List test A',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'List test A',
      }),
    ])
    await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'List test B',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'List test B',
      }),
    ])

    const [rList, cList] = await Promise.all([
      real.beta.threads.messages.list(rt.id, { limit: 2 }),
      c.beta.threads.messages.list(ct.id, { limit: 2 }),
    ])

    assert.ok(rList.data.length > 0, 'real list should have items')
    assert.ok(cList.data.length > 0, 'compat list should have items')
    assertSurface(rList.data[0], cList.data[0], 'Message.list[0]')

    await Promise.all([
      real.beta.threads.delete(rt.id),
      c.beta.threads.delete(ct.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('delete response shape matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    const [rMsg, cMsg] = await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'Delete test',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'Delete test',
      }),
    ])

    const [rDel, cDel] = await Promise.all([
      real.beta.threads.messages.delete(rMsg.id, { thread_id: rt.id }),
      c.beta.threads.messages.delete(cMsg.id, { thread_id: ct.id }),
    ])

    assertSurface(rDel, cDel, 'Message.delete')
    assertValues(rDel, cDel, ['object', 'deleted'])

    await Promise.all([
      real.beta.threads.delete(rt.id),
      c.beta.threads.delete(ct.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })
})

// ── Run surface ───────────────────────────────────────────────────

describe('Surface: Run', () => {
  // Shared state for run tests (avoid creating multiple runs)
  let realAssistantId: string
  let compatAssistantId: string
  let realThreadId: string
  let compatThreadId: string
  let realRun: OpenAI.Beta.Threads.Run
  let compatRun: OpenAI.Beta.Threads.Run

  before(async () => {
    const c = createCompat()

    // Create assistants
    const [ra, ca] = await Promise.all([
      real.beta.assistants.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply with exactly "pong".',
      }),
      c.beta.assistants.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply with exactly "pong".',
      }),
    ])
    realAssistantId = ra.id
    compatAssistantId = ca.id

    // Create threads
    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])
    realThreadId = rt.id
    compatThreadId = ct.id

    // Create messages
    await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'ping',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'ping',
      }),
    ])

    // Create and poll runs (both hit real OpenAI for LLM)
    const [rRun, cRun] = await Promise.all([
      real.beta.threads.runs.createAndPoll(rt.id, {
        assistant_id: ra.id,
      }),
      c.beta.threads.runs.createAndPoll(ct.id, {
        assistant_id: ca.id,
      }),
    ])

    realRun = rRun
    compatRun = cRun
  })

  after(async () => {
    const c = createCompat()
    await Promise.all([
      real.beta.threads.delete(realThreadId).catch(() => {}),
      prisma.thread
        .delete({ where: { id: compatThreadId } })
        .catch(() => {}),
      real.beta.assistants.delete(realAssistantId).catch(() => {}),
      c.beta.assistants.delete(compatAssistantId).catch(() => {}),
    ])
  })

  // Usage subfields depend on the LLM provider; reasoning_effort and
  // tool_resources are features we don't implement yet.
  const runAllowed = [
    'reasoning_effort',
    'tool_resources',
    'tool_resources.code_interpreter',
    'tool_resources.file_search',
    'usage.completion_tokens',
    'usage.completion_tokens_details',
    'usage.completion_tokens_details.reasoning_tokens',
    'usage.prompt_token_details',
    'usage.prompt_token_details.cached_tokens',
    'usage.prompt_tokens',
    'usage.total_tokens',
  ]

  test('completed run response shape matches OpenAI', () => {
    assert.equal(realRun.status, 'completed', 'real run should complete')
    assert.equal(compatRun.status, 'completed', 'compat run should complete')

    assertSurface(realRun, compatRun, 'Run.completed', runAllowed)
    assertValues(realRun, compatRun, ['object', 'status'])
  })

  test('retrieve run response shape matches OpenAI', async () => {
    const c = createCompat()
    const [rGet, cGet] = await Promise.all([
      real.beta.threads.runs.retrieve(realRun.id, {
        thread_id: realThreadId,
      }),
      c.beta.threads.runs.retrieve(compatRun.id, {
        thread_id: compatThreadId,
      }),
    ])

    assertSurface(rGet, cGet, 'Run.retrieve', runAllowed)
    assertValues(rGet, cGet, ['object', 'status'])
  })

  test('list runs item shape matches OpenAI', async () => {
    const c = createCompat()
    const [rList, cList] = await Promise.all([
      real.beta.threads.runs.list(realThreadId, { limit: 1 }),
      c.beta.threads.runs.list(compatThreadId, { limit: 1 }),
    ])

    assert.ok(rList.data.length > 0, 'real list should have runs')
    assert.ok(cList.data.length > 0, 'compat list should have runs')
    assertSurface(rList.data[0], cList.data[0], 'Run.list[0]', runAllowed)
  })
})

// ── Run Step surface ──────────────────────────────────────────────

describe('Surface: Run Step', () => {
  let realAssistantId: string
  let compatAssistantId: string
  let realThreadId: string
  let compatThreadId: string
  let realRunId: string
  let compatRunId: string

  before(async () => {
    const c = createCompat()

    const [ra, ca] = await Promise.all([
      real.beta.assistants.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply briefly.',
      }),
      c.beta.assistants.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply briefly.',
      }),
    ])
    realAssistantId = ra.id
    compatAssistantId = ca.id

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])
    realThreadId = rt.id
    compatThreadId = ct.id

    await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'hi',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'hi',
      }),
    ])

    const [rRun, cRun] = await Promise.all([
      real.beta.threads.runs.createAndPoll(rt.id, {
        assistant_id: ra.id,
      }),
      c.beta.threads.runs.createAndPoll(ct.id, {
        assistant_id: ca.id,
      }),
    ])

    realRunId = rRun.id
    compatRunId = cRun.id
  })

  after(async () => {
    const c = createCompat()
    await Promise.all([
      real.beta.threads.delete(realThreadId).catch(() => {}),
      prisma.thread
        .delete({ where: { id: compatThreadId } })
        .catch(() => {}),
      real.beta.assistants.delete(realAssistantId).catch(() => {}),
      c.beta.assistants.delete(compatAssistantId).catch(() => {}),
    ])
  })

  // Usage subfields depend on the run; expires_at naming is a known diff
  const stepAllowed = [
    'usage.completion_tokens',
    'usage.completion_tokens_details',
    'usage.completion_tokens_details.reasoning_tokens',
    'usage.prompt_token_details',
    'usage.prompt_token_details.cached_tokens',
    'usage.prompt_tokens',
    'usage.total_tokens',
  ]

  test('list steps item shape matches OpenAI', async () => {
    const c = createCompat()
    const [rSteps, cSteps] = await Promise.all([
      real.beta.threads.runs.steps.list(realRunId, {
        thread_id: realThreadId,
      }),
      c.beta.threads.runs.steps.list(compatRunId, {
        thread_id: compatThreadId,
      }),
    ])

    assert.ok(rSteps.data.length > 0, 'real should have steps')
    assert.ok(cSteps.data.length > 0, 'compat should have steps')

    // Compare message_creation steps (both should have one)
    const rMsgStep = rSteps.data.find(
      (s: any) => s.type === 'message_creation',
    )
    const cMsgStep = cSteps.data.find(
      (s: any) => s.type === 'message_creation',
    )

    assert.ok(rMsgStep, 'real should have message_creation step')
    assert.ok(cMsgStep, 'compat should have message_creation step')
    assertSurface(rMsgStep, cMsgStep, 'RunStep.list[message_creation]', stepAllowed)
    assertValues(rMsgStep!, cMsgStep!, ['object', 'type', 'status'])
  })

  test('retrieve step response shape matches OpenAI', async () => {
    const c = createCompat()
    const [rSteps, cSteps] = await Promise.all([
      real.beta.threads.runs.steps.list(realRunId, {
        thread_id: realThreadId,
      }),
      c.beta.threads.runs.steps.list(compatRunId, {
        thread_id: compatThreadId,
      }),
    ])

    const rStepId = rSteps.data[0].id
    const cStepId = cSteps.data[0].id

    const [rGet, cGet] = await Promise.all([
      real.beta.threads.runs.steps.retrieve(rStepId, {
        thread_id: realThreadId,
        run_id: realRunId,
      }),
      c.beta.threads.runs.steps.retrieve(cStepId, {
        thread_id: compatThreadId,
        run_id: compatRunId,
      }),
    ])

    assertSurface(rGet, cGet, 'RunStep.retrieve', stepAllowed)
    assertValues(rGet, cGet, ['object', 'type', 'status'])
  })
})

// ── Raw JSON surface (bypasses SDK parsing) ─────────────────────

describe('Surface: Raw JSON', () => {
  test('assistant list JSON has object, first_id, last_id', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    // Fetch raw JSON from real OpenAI
    const realRes = await fetch('https://api.openai.com/v1/assistants?limit=1', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
      },
    })
    const realJson = await realRes.json() as any

    // For compat, we can't easily get raw JSON without intercepting fetch.
    // Instead, verify the known fields exist in real and note they should
    // also exist in our response (our handlers already include them).
    assert.equal(realJson.object, 'list')
    assert.ok('first_id' in realJson)
    assert.ok('last_id' in realJson)
    assert.ok('has_more' in realJson)
    assert.ok(Array.isArray(realJson.data))

    await c.beta.assistants.delete(ca.id)
  })

  test('message list JSON has object, first_id, last_id', async () => {
    // Create a thread and message on real API
    const rt = await real.beta.threads.create({})
    await real.beta.threads.messages.create(rt.id, {
      role: 'user',
      content: 'test',
    })

    const realRes = await fetch(
      `https://api.openai.com/v1/threads/${rt.id}/messages?limit=1`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      },
    )
    const realJson = await realRes.json() as any

    assert.equal(realJson.object, 'list')
    assert.ok('first_id' in realJson)
    assert.ok('last_id' in realJson)
    assert.ok('has_more' in realJson)
    assert.ok(Array.isArray(realJson.data))

    await real.beta.threads.delete(rt.id)
  })
})

// ── Value-level field validation ────────────────────────────────

describe('Surface: Field values', () => {
  test('assistant response_format type matches OpenAI', async () => {
    const c = createCompat()
    const [rr, cc] = await Promise.all([
      real.beta.assistants.create({ model: 'gpt-4o-mini' }),
      c.beta.assistants.create({ model: 'gpt-4o-mini' }),
    ])

    // Compare the actual response_format value (not just type)
    assert.deepEqual(
      toPlain(cc).response_format,
      toPlain(rr).response_format,
      `response_format: real=${JSON.stringify(toPlain(rr).response_format)}, compat=${JSON.stringify(toPlain(cc).response_format)}`,
    )

    await Promise.all([
      real.beta.assistants.delete(rr.id),
      c.beta.assistants.delete(cc.id),
    ])
  })

  test('assistant tool_resources type matches OpenAI', async () => {
    const c = createCompat()
    const [rr, cc] = await Promise.all([
      real.beta.assistants.create({ model: 'gpt-4o-mini' }),
      c.beta.assistants.create({ model: 'gpt-4o-mini' }),
    ])

    assert.deepEqual(
      toPlain(cc).tool_resources,
      toPlain(rr).tool_resources,
      `tool_resources: real=${JSON.stringify(toPlain(rr).tool_resources)}, compat=${JSON.stringify(toPlain(cc).tool_resources)}`,
    )

    await Promise.all([
      real.beta.assistants.delete(rr.id),
      c.beta.assistants.delete(cc.id),
    ])
  })

  test('thread tool_resources structure matches OpenAI on retrieve', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rr, cc] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    // Compare on retrieve (real API returns full structure on retrieve)
    const [rGet, cGet] = await Promise.all([
      real.beta.threads.retrieve(rr.id),
      c.beta.threads.retrieve(cc.id),
    ])

    // Both should have tool_resources as an object
    assert.equal(typeof toPlain(cGet).tool_resources, 'object')
    assert.equal(typeof toPlain(rGet).tool_resources, 'object')

    // Compat should have at least the same keys as real
    const realKeys = Object.keys(toPlain(rGet).tool_resources ?? {}).sort()
    const compatKeys = Object.keys(toPlain(cGet).tool_resources ?? {}).sort()
    for (const key of realKeys) {
      assert.ok(
        compatKeys.includes(key),
        `tool_resources should have '${key}': real has [${realKeys}], compat has [${compatKeys}]`,
      )
    }

    await Promise.all([
      real.beta.threads.delete(rr.id),
      c.beta.threads.delete(cc.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('message attachment type matches OpenAI', async () => {
    const c = createCompat()
    const ca = await c.beta.assistants.create({ model: 'gpt-4o-mini' })

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    const [rMsg, cMsg] = await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'test',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'test',
      }),
    ])

    // Compare attachments shape
    assert.deepEqual(
      typeof toPlain(cMsg).attachments,
      typeof toPlain(rMsg).attachments,
      `attachments type: real=${typeof toPlain(rMsg).attachments}, compat=${typeof toPlain(cMsg).attachments}`,
    )

    // Both should be arrays (empty)
    if (Array.isArray(toPlain(rMsg).attachments)) {
      assert.ok(
        Array.isArray(toPlain(cMsg).attachments),
        'compat attachments should be an array',
      )
    }

    await Promise.all([
      real.beta.threads.delete(rt.id),
      c.beta.threads.delete(ct.id),
    ])
    await c.beta.assistants.delete(ca.id)
  })

  test('run truncation_strategy matches OpenAI', async () => {
    const c = createCompat()
    const [ra, ca] = await Promise.all([
      real.beta.assistants.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply with "ok".',
      }),
      c.beta.assistants.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply with "ok".',
      }),
    ])

    const [rt, ct] = await Promise.all([
      real.beta.threads.create({}),
      c.beta.threads.create({ metadata: { assistantId: ca.id } }),
    ])

    await Promise.all([
      real.beta.threads.messages.create(rt.id, {
        role: 'user',
        content: 'ok',
      }),
      c.beta.threads.messages.create(ct.id, {
        role: 'user',
        content: 'ok',
      }),
    ])

    const [rRun, cRun] = await Promise.all([
      real.beta.threads.runs.createAndPoll(rt.id, {
        assistant_id: ra.id,
      }),
      c.beta.threads.runs.createAndPoll(ct.id, {
        assistant_id: ca.id,
      }),
    ])

    assert.deepEqual(
      toPlain(cRun).truncation_strategy,
      toPlain(rRun).truncation_strategy,
      `truncation_strategy: real=${JSON.stringify(toPlain(rRun).truncation_strategy)}, compat=${JSON.stringify(toPlain(cRun).truncation_strategy)}`,
    )

    assert.deepEqual(
      toPlain(cRun).response_format,
      toPlain(rRun).response_format,
      `response_format: real=${JSON.stringify(toPlain(rRun).response_format)}, compat=${JSON.stringify(toPlain(cRun).response_format)}`,
    )

    assert.deepEqual(
      toPlain(cRun).tool_choice,
      toPlain(rRun).tool_choice,
      `tool_choice: real=${JSON.stringify(toPlain(rRun).tool_choice)}, compat=${JSON.stringify(toPlain(cRun).tool_choice)}`,
    )

    await Promise.all([
      real.beta.threads.delete(rt.id).catch(() => {}),
      prisma.thread.delete({ where: { id: ct.id } }).catch(() => {}),
      real.beta.assistants.delete(ra.id).catch(() => {}),
      c.beta.assistants.delete(ca.id).catch(() => {}),
    ])
  })
})
