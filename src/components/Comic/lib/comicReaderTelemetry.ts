/**
 * Lightweight in-memory telemetry for comic image loading.
 * No network reporting: counters and a small ring of recent events are
 * exposed for debugging via `getComicReaderTelemetry()`.
 */

export type ComicImageTelemetryEvent = {
  at: number;
  kind: "fetch" | "decode" | "mounted";
  href?: string;
  durationMs?: number;
  status?: "ok" | "error";
  detail?: string;
  mountedImages?: number;
};

type ComicReaderTelemetryState = {
  fetchCount: number;
  fetchErrorCount: number;
  fetchDurationMsTotal: number;
  decodeCount: number;
  decodeDurationMsTotal: number;
  retryCount: number;
  mountedImageCount: number;
  recent: ComicImageTelemetryEvent[];
};

const RECENT_EVENT_LIMIT = 50;

const state: ComicReaderTelemetryState = {
  fetchCount: 0,
  fetchErrorCount: 0,
  fetchDurationMsTotal: 0,
  decodeCount: 0,
  decodeDurationMsTotal: 0,
  retryCount: 0,
  mountedImageCount: 0,
  recent: [],
};

const push = (event: ComicImageTelemetryEvent) => {
  state.recent.push(event);
  if (state.recent.length > RECENT_EVENT_LIMIT) {
    state.recent.shift();
  }
};

export const recordComicImageFetch = (
  durationMs: number,
  ok: boolean,
  href?: string,
  detail?: string
) => {
  state.fetchCount += 1;
  if (!ok) state.fetchErrorCount += 1;
  state.fetchDurationMsTotal += Math.max(0, durationMs);
  push({ at: Date.now(), kind: "fetch", durationMs, status: ok ? "ok" : "error", href, detail });
};

export const recordComicImageDecode = (durationMs: number, href?: string) => {
  state.decodeCount += 1;
  state.decodeDurationMsTotal += Math.max(0, durationMs);
  push({ at: Date.now(), kind: "decode", durationMs, status: "ok", href });
};

export const recordComicImageRetry = (href?: string, detail?: string) => {
  state.retryCount += 1;
  push({ at: Date.now(), kind: "fetch", status: "error", href, detail: detail || "retry" });
};

/** Mounted = holding a usable src (blob or direct URL). */
export const acquireComicImageMount = (href?: string) => {
  state.mountedImageCount += 1;
  push({ at: Date.now(), kind: "mounted", status: "ok", href, mountedImages: state.mountedImageCount });
};

export const releaseComicImageMount = () => {
  state.mountedImageCount = Math.max(0, state.mountedImageCount - 1);
};

export const getComicReaderTelemetry = (): Readonly<ComicReaderTelemetryState> & {
  averageFetchMs: number | null;
  averageDecodeMs: number | null;
} => ({
  ...state,
  recent: [...state.recent],
  averageFetchMs: state.fetchCount > 0 ? state.fetchDurationMsTotal / state.fetchCount : null,
  averageDecodeMs: state.decodeCount > 0 ? state.decodeDurationMsTotal / state.decodeCount : null,
});
