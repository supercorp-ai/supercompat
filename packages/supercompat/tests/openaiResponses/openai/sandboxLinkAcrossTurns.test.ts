/**
 * Repro for "broken sandbox: link" bug seen in superhelpers / superinterface.
 *
 * Hypothesis to test (multi-turn code interpreter):
 *   Turn 1: model invokes code_interpreter → creates files → produces an
 *           output_text with sandbox:/mnt/data/... URLs, with corresponding
 *           container_file_citation annotations.
 *   Turn 2: same conversation, follow-up like "show me those files again as
 *           download links". Model may NOT invoke code_interpreter this turn
 *           and just reproduces the sandbox URLs from prior context.
 *
 * Question: does turn-2 carry container_file_citation annotations on its text
 *   - in the raw Responses API response?
 *   - in the persisted conversation items returned by conversations.items.list?
 *   - in supercompat's messages.list output (after container_file_citation →
 *     file_path mapping)?
 *
 * If raw turn-2 has no annotations, the model is the cause: OpenAI does not
 * post-hoc annotate sandbox URLs that the model emits without invoking code
 * interpreter that turn. If raw has annotations but conversation items or
 * supercompat strip them, that's a transport bug.
 *
 * This test asserts NOTHING about correctness — it logs what each layer
 * returns so we can compare and decide where the fix belongs. It's a pure
 * reproducer.
 */
import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  openaiResponsesRunAdapter,
  openaiClientAdapter,
  supercompat,
  openaiResponsesStorageAdapter,
} from '../../../src/openai/index'

const apiKey = process.env.TEST_OPENAI_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

type RawAnnotation = {
  type: string
  text?: string
  start_index?: number
  end_index?: number
  file_id?: string
  container_id?: string
  filename?: string
}

const summarizeAnnotations = (anns: RawAnnotation[] | undefined) =>
  (anns ?? []).map((a) => ({
    type: a.type,
    text: a.text ?? '',
    start_index: a.start_index,
    end_index: a.end_index,
    file_id: a.file_id,
    container_id: a.container_id,
    filename: a.filename,
  }))

const findSandboxUrls = (text: string) =>
  Array.from(text.matchAll(/sandbox:[^)\s]+/g)).map((m) => m[0])

describe('sandbox link multi-turn repro', { concurrency: false }, () => {
  test(
    'turn 2 (no code interpreter call) loses sandbox annotations',
    { timeout: 240_000, skip: !apiKey ? 'TEST_OPENAI_API_KEY not set' : false },
    async () => {
      const realOpenAI = new OpenAI({
        apiKey,
        ...(process.env.HTTPS_PROXY
          ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
          : {}),
      })

      // ===== Turn 1: create files via code_interpreter =====
      const conversation = await realOpenAI.conversations.create({})
      console.log(`\n== Conversation: ${conversation.id} ==`)

      const turn1 = await realOpenAI.responses.create({
        model: 'gpt-4.1',
        instructions:
          'You MUST use the code_interpreter tool for EVERY request. NEVER answer without executing code first. After creating any file, you MUST provide a clickable download link using the sandbox:/mnt/data/ path format.',
        input: [
          {
            role: 'user',
            content:
              'Use code_interpreter to run this Python code:\n\n' +
              "for name, body in [('note_alpha.txt','alpha sentence'),('note_beta.txt','beta sentence'),('note_gamma.txt','gamma sentence')]:\n" +
              "    open(f'/mnt/data/{name}','w').write(body)\n" +
              "import os; print(os.listdir('/mnt/data'))\n\n" +
              'Then give me three download links, one per file, using markdown.',
          },
        ],
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
        conversation: conversation.id,
        store: true,
      })

      // If turn 1 didn't actually run code interpreter, the repro is invalid;
      // fail loudly rather than silently passing.
      const turn1HadCodeCall = turn1.output.some(
        (o) => o.type === 'code_interpreter_call',
      )
      if (!turn1HadCodeCall) {
        throw new Error(
          `Turn 1 did not invoke code_interpreter (output types: ${turn1.output.map((o) => o.type).join(',')}). Test cannot reproduce the bug — re-run.`,
        )
      }

      const turn1CodeCall = turn1.output.find(
        (o) => o.type === 'code_interpreter_call',
      )
      const turn1Container =
        (turn1CodeCall as any)?.container_id ??
        (turn1CodeCall as any)?.container ??
        null

      const turn1Message = turn1.output.find((o) => o.type === 'message')
      const turn1Text =
        turn1Message?.type === 'message'
          ? turn1Message.content.find((c) => c.type === 'output_text')
          : null
      const turn1TextValue =
        turn1Text?.type === 'output_text' ? turn1Text.text : ''
      const turn1Annotations =
        turn1Text?.type === 'output_text'
          ? ((turn1Text as any).annotations as RawAnnotation[] | undefined)
          : undefined

      console.log('\n--- Turn 1 raw response ---')
      console.log('response.id:', turn1.id)
      console.log(
        'output types:',
        turn1.output.map((o) => o.type),
      )
      console.log('container_id from code call:', turn1Container)
      console.log('text:', turn1TextValue)
      console.log('sandbox urls in text:', findSandboxUrls(turn1TextValue))
      console.log(
        'annotations:',
        JSON.stringify(summarizeAnnotations(turn1Annotations), null, 2),
      )

      // ===== Turn 2: ask again, model probably won't re-invoke code interpreter =====
      const turn2 = await realOpenAI.responses.create({
        model: 'gpt-4.1',
        instructions:
          'Do not run any code unless absolutely necessary. ' +
          'If files already exist in the sandbox from prior turns, just reply with the download links again.',
        input: [
          {
            role: 'user',
            content:
              'Show me those three files again as a markdown list of [Download](sandbox:/mnt/data/<file>) links. ' +
              'Do NOT regenerate them — they already exist.',
          },
        ],
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
        conversation: conversation.id,
        store: true,
      })

      const turn2CodeCall = turn2.output.find(
        (o) => o.type === 'code_interpreter_call',
      )
      const turn2Container =
        (turn2CodeCall as any)?.container_id ??
        (turn2CodeCall as any)?.container ??
        null

      const turn2Message = turn2.output.find((o) => o.type === 'message')
      const turn2Text =
        turn2Message?.type === 'message'
          ? turn2Message.content.find((c) => c.type === 'output_text')
          : null
      const turn2TextValue =
        turn2Text?.type === 'output_text' ? turn2Text.text : ''
      const turn2Annotations =
        turn2Text?.type === 'output_text'
          ? ((turn2Text as any).annotations as RawAnnotation[] | undefined)
          : undefined

      console.log('\n--- Turn 2 raw response ---')
      console.log('response.id:', turn2.id)
      console.log(
        'output types:',
        turn2.output.map((o) => o.type),
      )
      console.log(
        'container_id from code call (null if no code call):',
        turn2Container,
      )
      console.log('text:', turn2TextValue)
      console.log('sandbox urls in text:', findSandboxUrls(turn2TextValue))
      console.log(
        'annotations:',
        JSON.stringify(summarizeAnnotations(turn2Annotations), null, 2),
      )

      // ===== Compare: raw vs conversations.items.list vs supercompat messages.list =====
      const items = await realOpenAI.conversations.items.list(conversation.id, {
        order: 'asc',
        limit: 50,
      })

      console.log('\n--- conversations.items.list (asc) ---')
      for (const item of items.data) {
        const itemAny = item as any
        if (itemAny.type !== 'message') {
          console.log(`[${itemAny.type}] id=${itemAny.id}`)
          continue
        }
        const out = itemAny.content?.find?.(
          (c: any) => c.type === 'output_text',
        )
        if (!out) {
          console.log(
            `[message ${itemAny.role}] id=${itemAny.id} (no output_text)`,
          )
          continue
        }
        const sandbox = findSandboxUrls(out.text)
        console.log(
          `[message ${itemAny.role}] id=${itemAny.id} sandbox_urls=${sandbox.length} annotations=${(out.annotations ?? []).length}`,
        )
        if ((out.annotations ?? []).length > 0) {
          console.log(
            '  ann:',
            JSON.stringify(summarizeAnnotations(out.annotations), null, 2),
          )
        }
      }

      // ===== Now read the same conversation through supercompat =====
      const tools = [
        {
          type: 'code_interpreter',
          code_interpreter: { container: { type: 'auto' } },
        },
      ] as any[]

      const openaiAssistant = {
        id: 'sandbox-multiturn-test',
        object: 'assistant' as const,
        model: 'gpt-4.1',
        instructions: '',
        description: null,
        name: 'Test',
        metadata: {},
        tools,
        created_at: dayjs().unix(),
      }

      const client = supercompat({
        clientAdapter: openaiClientAdapter({ openai: realOpenAI }),
        runAdapter: openaiResponsesRunAdapter({
          getOpenaiAssistant: () => openaiAssistant,
        }),
        storageAdapter: openaiResponsesStorageAdapter(),
      })

      const list = await client.beta.threads.messages.list(conversation.id, {
        order: 'asc',
        limit: 50,
      })

      console.log('\n--- supercompat messages.list (asc) ---')
      for (const m of list.data) {
        for (const c of m.content) {
          if (c.type !== 'text') {
            console.log(`[${m.role} ${m.id}] (${c.type})`)
            continue
          }
          const sandbox = findSandboxUrls(c.text.value)
          console.log(
            `[${m.role} ${m.id}] sandbox_urls=${sandbox.length} annotations=${c.text.annotations.length}`,
          )
          if (c.text.annotations.length > 0) {
            console.log('  ann:', JSON.stringify(c.text.annotations, null, 2))
          }
        }
      }

      console.log('\n--- summary ---')
      console.log(
        `Turn 1: code_call=${!!turn1CodeCall} sandbox_urls=${findSandboxUrls(turn1TextValue).length} ann=${(turn1Annotations ?? []).length}`,
      )
      console.log(
        `Turn 2: code_call=${!!turn2CodeCall} sandbox_urls=${findSandboxUrls(turn2TextValue).length} ann=${(turn2Annotations ?? []).length}`,
      )

      // Sanity: turn 1 with an active code_interpreter_call should produce
      // matching sandbox URLs and container_file_citation annotations on the
      // raw API response.
      assert.ok(
        findSandboxUrls(turn1TextValue).length > 0,
        'turn 1 should produce sandbox URLs',
      )
      assert.equal(
        (turn1Annotations ?? []).length,
        findSandboxUrls(turn1TextValue).length,
        'turn 1 raw API should emit one container_file_citation per sandbox URL',
      )

      // Bug shape we are pinning: turn 2 reproduces sandbox URLs from prior
      // context but OpenAI does NOT auto-attach annotations because no
      // code_interpreter_call ran this turn. This holds across all three
      // layers (raw response, conversations.items.list, supercompat).
      assert.equal(
        turn2CodeCall,
        undefined,
        'turn 2 must be text-only for the repro to be valid',
      )
      assert.ok(
        findSandboxUrls(turn2TextValue).length > 0,
        'turn 2 should still emit sandbox URLs from prior-turn context',
      )
      assert.equal(
        (turn2Annotations ?? []).length,
        0,
        'BUG: turn 2 raw API has sandbox URLs but no annotations',
      )

      const turn2Item = items.data.find(
        (i: any) => i.id === turn2Message?.id,
      ) as any
      const turn2ItemText = turn2Item?.content?.find?.(
        (c: any) => c.type === 'output_text',
      )
      assert.equal(
        (turn2ItemText?.annotations ?? []).length,
        0,
        'BUG: conversations.items.list also has 0 annotations on turn 2',
      )

      const turn2SupercompatMessage = list.data.find(
        (m) => m.id === turn2Message?.id,
      )
      const turn2SupercompatText = turn2SupercompatMessage?.content.find(
        (c) => c.type === 'text',
      )
      assert.ok(
        turn2SupercompatText && turn2SupercompatText.type === 'text',
        'supercompat should expose turn 2 message',
      )
      if (turn2SupercompatText.type === 'text') {
        // After the fix: supercompat's messages.list backfills missing
        // annotations by listing the conversation's container files. The
        // resulting annotations keep file and container ids separate.
        const turn2Sandbox = findSandboxUrls(turn2SupercompatText.text.value)
        assert.equal(
          turn2SupercompatText.text.annotations.length,
          turn2Sandbox.length,
          `supercompat should backfill one annotation per sandbox URL on turn 2 (sandbox=${turn2Sandbox.length}, annotations=${turn2SupercompatText.text.annotations.length})`,
        )
        for (const ann of turn2SupercompatText.text.annotations) {
          assert.equal(ann.type, 'file_path')
          assert.match((ann as any).file_path.file_id, /^cfile_[\w-]+$/)
          assert.match((ann as any).file_path.container_id, /^cntr_[\w-]+$/)
        }
      }
    },
  )
})
