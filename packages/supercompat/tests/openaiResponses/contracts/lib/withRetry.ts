/**
 * Retry wrapper for flaky LLM API tests.
 *
 * Retries the test function up to `maxRetries` times with exponential backoff.
 * Only the last attempt's error is surfaced — earlier failures are logged but swallowed.
 *
 * Use this to wrap individual contract invocations in provider test files
 * when transient API errors (rate limits, model hiccups) cause false failures.
 */
export async function withRetry(
  fn: () => Promise<void>,
  { maxRetries = 2, label, delayMs = 2000 }: { maxRetries?: number; label?: string; delayMs?: number } = {},
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err
      const tag = label ? ` [${label}]` : ''
      console.log(`  ↻ retry ${attempt + 1}/${maxRetries}${tag}: ${(err as Error).message?.slice(0, 120)}`)
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)))
    }
  }
}
