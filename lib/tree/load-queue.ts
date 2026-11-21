/**
 * Loads jobs with a fixed concurrency, always starting the highest-priority
 * pending job next (priority is re-read at dequeue time, so it can follow the
 * tree's current rotation). Cancelled jobs are aborted.
 */
export type LoadQueue<Job> = {
  add(key: string, job: Job): void;
  cancel(key: string): void;
  dispose(): void;
  readonly pending: number;
  readonly active: number;
};

export function createLoadQueue<Job>(options: {
  concurrency: number;
  priority: (job: Job) => number;
  load: (job: Job, signal: AbortSignal) => Promise<void>;
}): LoadQueue<Job> {
  const pending = new Map<string, Job>();
  const active = new Map<string, AbortController>();
  let disposed = false;

  const pump = () => {
    while (!disposed && active.size < options.concurrency && pending.size) {
      let bestKey = "";
      let bestScore = -Infinity;
      for (const [key, job] of pending) {
        const score = options.priority(job);
        if (score > bestScore) {
          bestScore = score;
          bestKey = key;
        }
      }
      const job = pending.get(bestKey)!;
      pending.delete(bestKey);
      const controller = new AbortController();
      active.set(bestKey, controller);
      options
        .load(job, controller.signal)
        .catch(() => undefined)
        .finally(() => {
          if (active.get(bestKey) === controller) active.delete(bestKey);
          pump();
        });
    }
  };

  return {
    add(key, job) {
      if (disposed) return;
      this.cancel(key);
      pending.set(key, job);
      queueMicrotask(pump);
    },
    cancel(key) {
      pending.delete(key);
      const controller = active.get(key);
      if (controller) {
        controller.abort();
        active.delete(key);
        queueMicrotask(pump);
      }
    },
    dispose() {
      disposed = true;
      pending.clear();
      for (const controller of active.values()) controller.abort();
      active.clear();
    },
    get pending() {
      return pending.size;
    },
    get active() {
      return active.size;
    },
  };
}
