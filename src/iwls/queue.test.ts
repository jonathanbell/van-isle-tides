import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitedQueue } from './queue';

describe('RateLimitedQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('enforces minimum spacing between dispatches', async () => {
    const q = new RateLimitedQueue({ minSpacingMs: 200, windowMax: 100, timeoutMs: 10_000 });
    const timestamps: number[] = [];
    const task = () => {
      timestamps.push(Date.now());
      return Promise.resolve('ok');
    };

    const p1 = q.run(task);
    const p2 = q.run(task);
    const p3 = q.run(task);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([p1, p2, p3]);

    expect(timestamps).toHaveLength(3);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(200);
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(200);
  });

  it('respects the sliding window limit', async () => {
    const q = new RateLimitedQueue({
      minSpacingMs: 0,
      windowMs: 1000,
      windowMax: 3,
      timeoutMs: 10_000,
    });
    const starts: number[] = [];
    const promises = Array.from({ length: 5 }, () =>
      q.run(() => {
        starts.push(Date.now());
        return Promise.resolve(1);
      }),
    );

    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all(promises);

    expect(starts).toHaveLength(5);
    // The 4th dispatch must be in a later window than the 1st.
    expect(starts[3] - starts[0]).toBeGreaterThanOrEqual(1000);
  });

  it('retries on 429 with backoff', async () => {
    const q = new RateLimitedQueue({ minSpacingMs: 0, timeoutMs: 10_000, maxRetries: 3 });
    let attempts = 0;
    const task = () => {
      attempts++;
      if (attempts < 3) {
        const err = Object.assign(new Error('rate limited'), { status: 429 });
        return Promise.reject(err);
      }
      return Promise.resolve('ok');
    };

    const promise = q.run(task);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(promise).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });
});
