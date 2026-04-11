/**
 * Rate-limit-friendly FIFO queue for IWLS API calls.
 *
 * Enforces:
 *  - Minimum spacing between dispatches (default 350ms ≈ 3 req/s)
 *  - Sliding 60s window (default 30 req/min)
 *  - Per-request timeout via AbortController (default 15s)
 *  - 429 exponential backoff (2s, 4s, 8s… capped)
 */

export interface QueueOptions {
  minSpacingMs?: number;
  windowMs?: number;
  windowMax?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

interface Job<T> {
  run: (signal: AbortSignal) => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  attempts: number;
}

export class RateLimitedQueue {
  private readonly opts: Required<QueueOptions>;
  private readonly jobs: Job<unknown>[] = [];
  private readonly windowHits: number[] = [];
  private lastDispatch = 0;
  private running = false;

  constructor(opts: QueueOptions = {}) {
    this.opts = {
      minSpacingMs: opts.minSpacingMs ?? 350,
      windowMs: opts.windowMs ?? 60_000,
      windowMax: opts.windowMax ?? 30,
      timeoutMs: opts.timeoutMs ?? 15_000,
      maxRetries: opts.maxRetries ?? 4,
    };
  }

  run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({
        run: task as (signal: AbortSignal) => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
        attempts: 0,
      });
      void this.tick();
    });
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        await this.waitForSlot();
        const job = this.jobs.shift()!;
        this.lastDispatch = Date.now();
        this.windowHits.push(this.lastDispatch);
        this.dispatch(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async waitForSlot(): Promise<void> {
    while (true) {
      const now = Date.now();
      while (this.windowHits.length && now - this.windowHits[0] >= this.opts.windowMs) {
        this.windowHits.shift();
      }
      const spacingWait = Math.max(0, this.opts.minSpacingMs - (now - this.lastDispatch));
      let windowWait = 0;
      if (this.windowHits.length >= this.opts.windowMax) {
        windowWait = this.opts.windowMs - (now - this.windowHits[0]);
      }
      const wait = Math.max(spacingWait, windowWait);
      if (wait <= 0) return;
      await sleep(wait);
    }
  }

  private dispatch(job: Job<unknown>): void {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), this.opts.timeoutMs);
    job.attempts += 1;
    job
      .run(controller.signal)
      .then((value) => {
        clearTimeout(timeout);
        job.resolve(value);
      })
      .catch(async (err: unknown) => {
        clearTimeout(timeout);
        if (isRateLimitError(err) && job.attempts <= this.opts.maxRetries) {
          const delay = Math.min(60_000, 2_000 * 2 ** (job.attempts - 1));
          await sleep(delay);
          this.jobs.unshift(job);
          void this.tick();
          return;
        }
        job.reject(err);
      });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface HttpError extends Error {
  status?: number;
}

export function isRateLimitError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as HttpError).status === 429;
}

export const iwlsQueue = new RateLimitedQueue();
