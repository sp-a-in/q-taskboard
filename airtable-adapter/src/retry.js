function defaultIsRetryable(err) {
  const status = err && (err.statusCode || err.status);
  if (status === undefined || status === null) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded exponential backoff with full jitter.
 * Retries `fn` while `isRetryable(err)` is true, up to `retries` extra attempts.
 */
async function withRetry(fn, options = {}) {
  const {
    retries = 4,
    baseDelayMs = 100,
    maxDelayMs = 3000,
    isRetryable = defaultIsRetryable,
    onRetry = null,
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) {
        throw err;
      }
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.random() * cap;
      if (onRetry) onRetry(err, attempt, delay);
      await sleep(delay);
    }
  }
}

module.exports = { withRetry, defaultIsRetryable, sleep };
