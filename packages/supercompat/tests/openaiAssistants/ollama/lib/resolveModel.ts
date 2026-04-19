/**
 * Resolve which Ollama model to use for a test run.
 *
 * Priority:
 *   1. `OLLAMA_MODEL` env var (exact id, e.g. `gemma4:26b`)
 *   2. Smallest pulled model from the preferred family list (Gemma 4, Gemma 3,
 *      Qwen 2.5 VL). Ollama doesn't auto-alias `gemma4` to `gemma4:latest`
 *      unless you've pulled that specific tag, so we probe `/v1/models`, then
 *      within the matching family we pick the smallest available variant (e2b
 *      < e4b < 4b < 12b < 26b < 31b < latest). Smaller is dramatically faster
 *      for local inference — e4b runs 5-8x quicker than 26b per token — and
 *      the loose content assertions (a regex checking for any Supercorp
 *      product name) still pass on the smaller variants.
 *   3. `null` — caller should skip with a clear message.
 */

export const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1'

export async function ollamaReachable(): Promise<boolean> {
  const healthUrl = ollamaBaseUrl.replace(/\/v1\/?$/, '') + '/api/tags'
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function listPulledModels(): Promise<string[]> {
  try {
    const res = await fetch(ollamaBaseUrl + '/models', { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.data ?? []).map((m: { id: string }) => m.id)
  } catch {
    return []
  }
}

// Ordered by desirability for computer-use testing. First family with a
// pulled model wins; within that family we pick the smallest variant.
const PREFERRED_PREFIXES = ['gemma4', 'gemma3', 'qwen2.5vl', 'qwen2.5-vl']

// Smaller is faster. Rank models by the size tag in their id — "e2b" beats
// "e4b" beats "4b" beats "12b" beats "26b" beats "31b" beats untagged/latest.
// Unknown tags rank last so explicit sizes always win.
const SIZE_TAG_RANKS: [RegExp, number][] = [
  [/:e2b\b/i, 0],
  [/:e4b\b/i, 1],
  [/:1b\b/i, 2],
  [/:2b\b/i, 3],
  [/:4b\b/i, 4],
  [/:7b\b/i, 5],
  [/:8b\b/i, 6],
  [/:12b\b/i, 7],
  [/:26b\b/i, 8],
  [/:27b\b/i, 9],
  [/:31b\b/i, 10],
  [/:70b\b/i, 11],
  [/:72b\b/i, 12],
  [/:latest\b/i, 20],
]

function sizeRank(id: string): number {
  for (const [rx, rank] of SIZE_TAG_RANKS) {
    if (rx.test(id)) return rank
  }
  return 99
}

export async function resolveOllamaModel(): Promise<string | null> {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL

  const available = await listPulledModels()
  if (available.length === 0) return null

  for (const prefix of PREFERRED_PREFIXES) {
    const matches = available.filter((id) => id.startsWith(prefix))
    if (matches.length > 0) {
      // Smallest available variant within the matched family.
      return matches.slice().sort((a, b) => sizeRank(a) - sizeRank(b))[0]
    }
  }
  return null
}

export async function skipIfNoModel(): Promise<string> {
  if (!(await ollamaReachable())) {
    console.log(`Skipping: Ollama not reachable at ${ollamaBaseUrl} (start with "ollama serve")`)
    process.exit(0)
  }
  const model = await resolveOllamaModel()
  if (!model) {
    const available = await listPulledModels()
    console.log(
      `Skipping: no suitable Ollama model found. Pulled models: ${available.join(', ') || '(none)'}. ` +
      `Set OLLAMA_MODEL to override, or "ollama pull gemma4".`,
    )
    process.exit(0)
  }
  return model
}
