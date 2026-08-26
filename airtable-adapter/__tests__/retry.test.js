const { withRetry, defaultIsRetryable } = require('../src/retry');

describe('defaultIsRetryable', () => {
  it('treats network errors (no status code) as retryable', () => {
    expect(defaultIsRetryable(new Error('ECONNRESET'))).toBe(true);
  });

  it('treats 429 and 5xx as retryable', () => {
    expect(defaultIsRetryable({ statusCode: 429 })).toBe(true);
    expect(defaultIsRetryable({ statusCode: 500 })).toBe(true);
    expect(defaultIsRetryable({ statusCode: 503 })).toBe(true);
  });

  it('treats 400/401/403/404/422 as permanent', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(defaultIsRetryable({ statusCode: status })).toBe(false);
    }
  });
});

describe('withRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors until success', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValueOnce('ok');

    const onRetry = jest.fn();
    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 2, onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent errors', async () => {
    const fn = jest.fn().mockRejectedValue({ statusCode: 422, message: 'invalid' });

    await expect(withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1 })).rejects.toEqual({
      statusCode: 422,
      message: 'invalid',
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured number of retries', async () => {
    const fn = jest.fn().mockRejectedValue({ statusCode: 500 });

    await expect(
      withRetry(fn, { retries: 3, baseDelayMs: 1, maxDelayMs: 1 }),
    ).rejects.toEqual({ statusCode: 500 });
    expect(fn).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
  });
});
