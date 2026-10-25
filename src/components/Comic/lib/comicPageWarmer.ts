export type ComicWarmupDimensions = {
  width: number;
  height: number;
};

export type ComicWarmupTask = {
  key: string;
  urgent: boolean;
  /** Resolves with intrinsic dimensions when the loader can read them cheaply. */
  load: (signal: AbortSignal) => Promise<ComicWarmupDimensions | undefined>;
};

/** Concurrent downloads while the next pages to read are still missing. */
export const COMIC_URGENT_WARMUP_CONCURRENCY = 4;
/** Concurrent background downloads; leaves connections free for on-screen images. */
export const COMIC_BACKGROUND_WARMUP_CONCURRENCY = 2;

/**
 * Downloads comic pages ahead of display, in a caller-provided order. Re-planning
 * keeps in-flight downloads that are still wanted, so scrolling never restarts work,
 * and pages already warmed are skipped.
 */
export class ComicPageWarmer {
  private queue: ComicWarmupTask[] = [];
  private readonly active = new Map<string, AbortController>();
  /** Failed pages are not retried by the warmer; the mounted image has its own retry. */
  private readonly failed = new Set<string>();
  private disposed = false;

  /**
   * @param warmed Shared record of warmed keys, or `undefined` when the backing cache
   * can evict entries and pages must be re-requested (cache hits resolve immediately).
   */
  constructor(
    private readonly warmed: Set<string> | undefined,
    private readonly onWarmed: (key: string, dimensions: ComicWarmupDimensions | undefined) => void
  ) {}

  plan(tasks: readonly ComicWarmupTask[]) {
    if (this.disposed) return;
    const wanted = new Set(tasks.map((task) => task.key));
    this.active.forEach((controller, key) => {
      if (!wanted.has(key)) controller.abort();
    });
    this.queue = tasks.filter(
      (task) => !this.warmed?.has(task.key) && !this.failed.has(task.key) && !this.active.has(task.key)
    );
    this.pump();
  }

  dispose() {
    this.disposed = true;
    this.queue = [];
    this.active.forEach((controller) => controller.abort());
    this.active.clear();
  }

  private pump() {
    while (!this.disposed && this.queue.length > 0) {
      const next = this.queue[0];
      const limit = next.urgent ? COMIC_URGENT_WARMUP_CONCURRENCY : COMIC_BACKGROUND_WARMUP_CONCURRENCY;
      if (this.active.size >= limit) return;
      this.queue.shift();
      this.start(next);
    }
  }

  private start(task: ComicWarmupTask) {
    const controller = new AbortController();
    this.active.set(task.key, controller);
    task
      .load(controller.signal)
      .then(
        (dimensions) => {
          if (controller.signal.aborted) return;
          this.warmed?.add(task.key);
          this.onWarmed(task.key, dimensions);
        },
        () => {
          if (!controller.signal.aborted) this.failed.add(task.key);
        }
      )
      .finally(() => {
        if (this.active.get(task.key) === controller) this.active.delete(task.key);
        this.pump();
      });
  }
}

/**
 * Warms the browser cache for a direct HTTP image. Only the header is parsed for
 * dimensions; the bitmap is decoded later, when the page is actually mounted.
 */
export const warmComicHttpImage = (
  href: string,
  urgent: boolean,
  signal: AbortSignal
): Promise<ComicWarmupDimensions | undefined> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Warmup cancelled.", "AbortError"));
      return;
    }
    const img = new Image();
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      signal.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      img.src = "";
      reject(new DOMException("Warmup cancelled.", "AbortError"));
    };
    img.onload = () => {
      cleanup();
      resolve(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : undefined
      );
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to warm image."));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    img.decoding = "async";
    img.fetchPriority = urgent ? "high" : "low";
    img.src = href;
  });
