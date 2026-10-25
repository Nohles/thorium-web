"use client";

import { HttpResource, Link, Publication } from "@readium/shared";
import {
  CSSProperties,
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "../assets/styles/thorium-web.comic.module.css";
import {
  ComicReadingDirection,
  ComicReadingMode,
  ComicScaleType,
} from "@/lib/comicSettingsReducer";
import { useI18n } from "@/i18n/useI18n";
import { useAppSelector } from "@/lib/hooks";
import {
  ComicPageLayoutMode,
  getImagePlaceholderStyling,
  getPageWidthFraction,
  getReaderImageStyling,
  isWidthDrivenScaleMode,
  stretchAllowedForScale,
} from "@/components/Comic/lib/comicReaderLayout";
import { ComicPage } from "../hooks/useComicReaderController";
import { ComicPageLoadState } from "../lib/comicProgress";
import {
  COMIC_MOUNT_AHEAD_PAGES,
  getComicPageLoadSet,
  getComicPageWarmupOrder,
} from "../lib/comicPageLoadWindow";
import { ComicPageWarmer, warmComicHttpImage } from "../lib/comicPageWarmer";
import {
  acquireComicImageMount,
  recordComicImageDecode,
  recordComicImageFetch,
  recordComicImageRetry,
  releaseComicImageMount,
} from "../lib/comicReaderTelemetry";

/** Webtoon pages can be extremely large once decoded; keep concurrent reads low. */
const MAX_CONCURRENT_COMIC_IMAGE_READS = 3;
/** Keep encoded blob data bounded for publications that cannot use direct HTTP URLs. */
const MAX_COMIC_IMAGE_BLOB_CACHE = 12;
const COMIC_IMAGE_LOAD_TIMEOUT_MS = 15_000;
/** Automatic retries for transient network failures and 5xx; auth errors surface immediately. */
const COMIC_IMAGE_RETRY_LIMIT = 2;
const COMIC_IMAGE_RETRY_BASE_DELAY_MS = 400;

type QueuedImageRead = {
  priority: number;
  signal: AbortSignal;
  run: () => void;
  cancel: () => void;
};

const comicImageBlobCache = new WeakMap<Publication, Map<string, Blob>>();
type ComicImageDimensions = {
  width: number;
  height: number;
};

const comicImageDimensionsCache = new WeakMap<Publication, Map<string, ComicImageDimensions>>();
const comicImageInFlightReads = new WeakMap<Publication, Map<string, Promise<Blob>>>();
const comicImageReadQueue: QueuedImageRead[] = [];
let activeComicImageReads = 0;
let comicImageReadDrainScheduled = false;

const drainComicImageReadQueue = () => {
  comicImageReadQueue.sort((left, right) => right.priority - left.priority);
  while (activeComicImageReads < MAX_CONCURRENT_COMIC_IMAGE_READS && comicImageReadQueue.length > 0) {
    const next = comicImageReadQueue.shift();
    if (!next) return;
    if (next.signal.aborted) {
      next.cancel();
      continue;
    }
    activeComicImageReads += 1;
    next.run();
  }
};

const scheduleComicImageReadDrain = () => {
  if (comicImageReadDrainScheduled) return;
  comicImageReadDrainScheduled = true;
  queueMicrotask(() => {
    comicImageReadDrainScheduled = false;
    drainComicImageReadQueue();
  });
};

const enqueueComicImageRead = <T,>(
  read: () => Promise<T>,
  priority: number,
  signal: AbortSignal
): Promise<T> =>
  new Promise((resolve, reject) => {
    let started = false;
    const abortError = new DOMException("Image read cancelled.", "AbortError");
    const queuedRead: QueuedImageRead = {
      priority,
      signal,
      cancel: () => reject(abortError),
      run: () => {
        started = true;
        signal.removeEventListener("abort", handleAbort);
        read()
          .then(resolve, reject)
          .finally(() => {
            activeComicImageReads = Math.max(0, activeComicImageReads - 1);
            drainComicImageReadQueue();
          });
      },
    };
    const handleAbort = () => {
      if (started) return;
      const queueIndex = comicImageReadQueue.indexOf(queuedRead);
      if (queueIndex >= 0) comicImageReadQueue.splice(queueIndex, 1);
      reject(abortError);
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    comicImageReadQueue.push(queuedRead);
    scheduleComicImageReadDrain();
  });

const touchComicImageBlobCache = (cache: Map<string, Blob>, href: string, value: Blob) => {
  cache.delete(href);
  cache.set(href, value);
  while (cache.size > MAX_COMIC_IMAGE_BLOB_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const isRetryableComicImageError = (error: unknown): boolean => {
  if (isAbortError(error)) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const match = /Failed to load image \((\d{3})\)/.exec(error.message);
    const status = match ? Number(match[1]) : undefined;
    return status !== undefined && (status >= 500 || status === 429);
  }
  return false;
};

const delayComicImageRetry = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Image read cancelled.", "AbortError"));
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const handleAbort = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      reject(new DOMException("Image read cancelled.", "AbortError"));
    };
    timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", handleAbort, { once: true });
  });

const readComicImageBytesWithRetries = async (
  publication: Publication,
  link: Link,
  signal: AbortSignal
): Promise<Uint8Array> => {
  let attempt = 0;
  for (;;) {
    try {
      const bytes = await publication.get(link).read();
      if (!bytes) throw new Error("Failed to load image bytes.");
      return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw error;
      attempt += 1;
      if (attempt > COMIC_IMAGE_RETRY_LIMIT || !isRetryableComicImageError(error)) throw error;
      recordComicImageRetry(link.href, `publication.read retry ${attempt}`);
      await delayComicImageRetry(COMIC_IMAGE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
    }
  }
};

const getComicImageBlob = async (
  publication: Publication,
  link: Link,
  signal: AbortSignal
): Promise<Blob> => {
  let publicationCache = comicImageBlobCache.get(publication);
  if (!publicationCache) {
    publicationCache = new Map();
    comicImageBlobCache.set(publication, publicationCache);
  }

  const cached = publicationCache.get(link.href);
  if (cached) {
    touchComicImageBlobCache(publicationCache, link.href, cached);
    return cached;
  }

  let inFlight = comicImageInFlightReads.get(publication);
  if (!inFlight) {
    inFlight = new Map();
    comicImageInFlightReads.set(publication, inFlight);
  }
  const pending = inFlight.get(link.href);
  if (pending) {
    const blob = await pending;
    if (signal.aborted) throw new DOMException("Image read cancelled.", "AbortError");
    return blob;
  }

  const readPromise = (async () => {
    try {
      const byteArray = await readComicImageBytesWithRetries(publication, link, signal);
      const blob = new Blob([new Uint8Array(byteArray)], { type: link.type || "image/jpeg" });
      touchComicImageBlobCache(publicationCache!, link.href, blob);
      return blob;
    } finally {
      const current = comicImageInFlightReads.get(publication);
      current?.delete(link.href);
    }
  })();
  inFlight.set(link.href, readPromise);

  const blob = await readPromise;
  if (signal.aborted) throw new DOMException("Image read cancelled.", "AbortError");
  return blob;
};

const invalidateComicImageBlob = (publication: Publication, href: string) => {
  comicImageBlobCache.get(publication)?.delete(href);
};

const getComicImageDimensions = (
  publication: Publication,
  link: Link
): ComicImageDimensions | undefined => {
  if (
    typeof link.width === "number" &&
    link.width > 0 &&
    typeof link.height === "number" &&
    link.height > 0
  ) {
    return { width: link.width, height: link.height };
  }
  return comicImageDimensionsCache.get(publication)?.get(link.href);
};

const comicImageDimensionListeners = new WeakMap<Publication, Map<string, Set<() => void>>>();

/** Notifies a mounted page when warmup learns its size, so its placeholder stops guessing. */
const subscribeComicImageDimensions = (publication: Publication, href: string, listener: () => void) => {
  let publicationListeners = comicImageDimensionListeners.get(publication);
  if (!publicationListeners) {
    publicationListeners = new Map();
    comicImageDimensionListeners.set(publication, publicationListeners);
  }
  let hrefListeners = publicationListeners.get(href);
  if (!hrefListeners) {
    hrefListeners = new Set();
    publicationListeners.set(href, hrefListeners);
  }
  hrefListeners.add(listener);
  return () => {
    hrefListeners.delete(listener);
    if (hrefListeners.size === 0) publicationListeners.delete(href);
  };
};

const rememberComicImageDimensions = (
  publication: Publication,
  href: string,
  dimensions: ComicImageDimensions
) => {
  if (
    !Number.isFinite(dimensions.width) ||
    dimensions.width <= 0 ||
    !Number.isFinite(dimensions.height) ||
    dimensions.height <= 0
  ) {
    return;
  }
  let publicationCache = comicImageDimensionsCache.get(publication);
  if (!publicationCache) {
    publicationCache = new Map();
    comicImageDimensionsCache.set(publication, publicationCache);
  }
  const previous = publicationCache.get(href);
  if (previous?.width === dimensions.width && previous.height === dimensions.height) return;
  publicationCache.set(href, dimensions);
  comicImageDimensionListeners.get(publication)?.get(href)?.forEach((listener) => listener());
};

const isHttpUrl = (href: string | undefined): href is string => {
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const comicDirectImageUrls = new WeakMap<Link, string | null>();

/**
 * Absolute URL for an image the browser can load itself. Manifests usually use
 * relative hrefs; when the publication is fetched over plain HTTP, resolve them the
 * same way its fetcher does so pages skip the Blob copy and use the HTTP cache.
 * Custom fetchers (e.g. ones adding auth headers) keep the publication-read path.
 */
const getComicDirectImageUrl = (publication: Publication, link: Link): string | undefined => {
  if (isHttpUrl(link.href)) return link.href;
  let cached = comicDirectImageUrls.get(link);
  if (cached === undefined) {
    cached = null;
    try {
      if (publication.get(link) instanceof HttpResource) {
        const selfHref = publication.manifest.links?.findWithRel("self")?.href;
        const url = link.toURL(selfHref);
        if (isHttpUrl(url)) cached = url;
      }
    } catch {
      cached = null;
    }
    comicDirectImageUrls.set(link, cached);
  }
  return cached ?? undefined;
};

/** Below every on-screen read so warming never delays the visible page. */
const COMIC_PREFETCH_PRIORITY = -10;

/** Pages warmed ahead when reads go through the bounded blob cache rather than HTTP. */
const COMIC_BLOB_WARMUP_AHEAD = 6;

/** Direct HTTP images already downloaded into the browser cache, per publication. */
const comicWarmedHttpImages = new WeakMap<Publication, Set<string>>();

/**
 * Downloads every page of the current slice in reading order: the next few pages
 * urgently, then the rest in the background with low priority. Direct HTTP images
 * warm the browser cache (and report their size so placeholders match the page);
 * publication-read images warm the bounded blob cache a few pages ahead.
 */
const useComicPageWarmup = ({
  publication,
  pages,
  cursorIndex,
  loadDirection,
}: {
  publication: Publication;
  pages: readonly ComicPage[];
  cursorIndex: number;
  loadDirection: 1 | -1;
}) => {
  const warmerRef = useRef<ComicPageWarmer | null>(null);
  const firstPage = pages[0];
  const isDirect = !!firstPage && !!getComicDirectImageUrl(publication, firstPage.link);

  useEffect(() => {
    let warmed: Set<string> | undefined;
    if (isDirect) {
      warmed = comicWarmedHttpImages.get(publication);
      if (!warmed) {
        warmed = new Set();
        comicWarmedHttpImages.set(publication, warmed);
      }
    }
    const warmer = new ComicPageWarmer(warmed, (href, dimensions) => {
      if (dimensions) rememberComicImageDimensions(publication, href, dimensions);
    });
    warmerRef.current = warmer;
    return () => {
      warmer.dispose();
      if (warmerRef.current === warmer) warmerRef.current = null;
    };
  }, [isDirect, publication]);

  useEffect(() => {
    const warmer = warmerRef.current;
    if (!warmer) return;
    const order = getComicPageWarmupOrder(
      pages,
      cursorIndex,
      loadDirection,
      isDirect ? undefined : { aheadLimit: COMIC_BLOB_WARMUP_AHEAD, behindLimit: 1 }
    );
    warmer.plan(
      order.map(({ page, urgent }) => ({
        key: page.href,
        urgent,
        load: (signal: AbortSignal) =>
          isDirect
            ? warmComicHttpImage(getComicDirectImageUrl(publication, page.link) ?? page.href, urgent, signal)
            : enqueueComicImageRead(
                () => getComicImageBlob(publication, page.link, signal),
                COMIC_PREFETCH_PRIORITY,
                signal
              ).then(() => undefined),
      }))
    );
  }, [cursorIndex, isDirect, loadDirection, pages, publication]);
};

/** How far beyond the viewport scroll-mode pages stay mounted (and decoded). */
const COMIC_MOUNT_ROOT_MARGIN_VERTICAL = "150% 0px";
const COMIC_MOUNT_ROOT_MARGIN_HORIZONTAL = "0px 150%";

const withComicImageTimeout = <T,>(
  operation: () => Promise<T>,
  abortController: AbortController
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new DOMException("Image loading timed out.", "TimeoutError");
      reject(timeoutError);
      abortController.abort(timeoutError);
    }, COMIC_IMAGE_LOAD_TIMEOUT_MS);
    operation().then(resolve, reject);
  }).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
};

const useObjectUrl = (
  publication: Publication,
  link: Link | undefined,
  shouldLoad = true,
  reloadKey = 0,
  loadPriority = 0
) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const href = link?.href;
  const mediaType = link?.type;
  const linkRef = useRef(link);
  const loadPriorityRef = useRef(loadPriority);

  useEffect(() => {
    linkRef.current = link;
  }, [link]);

  useEffect(() => {
    loadPriorityRef.current = loadPriority;
  }, [loadPriority]);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    let handedOffObjectUrl = false;
    const abortController = new AbortController();

    const run = async () => {
      setError(null);
      const currentLink = linkRef.current;
      if (!currentLink) {
        setIsLoading(false);
        setObjectUrl(null);
        return;
      }
      if (!shouldLoad) {
        // Outside the directional load window: release the mounted source so
        // its decoded bitmap can be reclaimed. The measured aspect ratio is
        // retained, so scroll geometry stays stable if the page re-enters.
        setIsLoading(false);
        setObjectUrl(null);
        return;
      }

      // HTTP(S) resources go straight to <img>: native loading/prioritization,
      // no intermediate Blob copies, no manual object-URL lifetime. Only
      // resources requiring Publication.read() use the queued blob path below.
      const directUrl = getComicDirectImageUrl(publication, currentLink);
      if (directUrl) {
        setIsLoading(false);
        setObjectUrl(directUrl);
        return;
      }

      setIsLoading(true);
      const startedAt = performance.now();
      try {
        const sourceUrl = await enqueueComicImageRead(
          () =>
            withComicImageTimeout(async () => {
              const blob = await getComicImageBlob(publication, currentLink, abortController.signal);
              if (abortController.signal.aborted) {
                throw new DOMException("Image read cancelled.", "AbortError");
              }
              created = URL.createObjectURL(blob);
              return created;
            }, abortController),
          loadPriorityRef.current,
          abortController.signal
        );
        if (cancelled) return;
        handedOffObjectUrl = true;
        recordComicImageFetch(performance.now() - startedAt, true, currentLink.href);
        setObjectUrl(sourceUrl);
      } catch (e) {
        const wasAborted = e instanceof DOMException && e.name === "AbortError";
        recordComicImageFetch(
          performance.now() - startedAt,
          false,
          currentLink.href,
          e instanceof Error ? e.message : String(e)
        );
        if (!cancelled && !wasAborted) {
          setObjectUrl(null);
          setError(e instanceof Error ? e.message : "Failed to load image.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run().catch(() => undefined);
    return () => {
      cancelled = true;
      abortController.abort();
      if (!handedOffObjectUrl && created?.startsWith("blob:")) URL.revokeObjectURL(created);
    };
  }, [publication, href, mediaType, shouldLoad, reloadKey]);

  useEffect(
    () => () => {
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl]
  );

  useEffect(() => {
    if (!objectUrl) return;
    acquireComicImageMount(href);
    return () => {
      releaseComicImageMount();
    };
  }, [href, objectUrl]);

  return { objectUrl, error, isLoading };
};

type ComicPageHorizontalAlignment = "start" | "center" | "end";

const comicPageJustifyContent: Record<ComicPageHorizontalAlignment, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
};

const ComicImagePlaceholder = ({
  style,
  showSpinner,
  isBusy,
}: {
  style: CSSProperties;
  showSpinner: boolean;
  isBusy: boolean;
}) => (
  <div style={style} aria-busy={isBusy}>
    {showSpinner ? (
      <div className={styles.imagePlaceholderInner}>
        <span className={styles.imageSpinner} aria-hidden />
      </div>
    ) : null}
  </div>
);

const ComicImageLoadError = ({
  message,
  onRetry,
  frameStyle,
  areaStyle,
}: {
  message: string;
  onRetry: () => void;
  frameStyle: CSSProperties;
  areaStyle: CSSProperties;
}) => {
  const { t } = useI18n();

  return (
    <div style={frameStyle}>
      {/* The card's padding stays inside the page cell (border-box), or it overflows and scrolls the reader. */}
      <div className={styles.imageError} style={areaStyle} role="alert">
        <p className={styles.imageErrorMessage}>{message}</p>
        <button
          type="button"
          className={styles.actionButton}
          data-size="compact"
          onPointerUp={(event) => event.stopPropagation()}
          onClick={onRetry}
        >
          {t("reader.comic.imageLoad.retry")}
        </button>
      </div>
    </div>
  );
};

const getPageFrameStyle = (
  widthLimitEnabled: boolean,
  widthLimitPercent: number,
  scaleType: ComicScaleType,
  layoutMode: ComicPageLayoutMode,
  isDoublePageCell: boolean,
  horizontalAlignment: ComicPageHorizontalAlignment
): CSSProperties => {
  const fraction = getPageWidthFraction(widthLimitEnabled, widthLimitPercent, scaleType, isDoublePageCell);
  const wPct = fraction * 100;
  const base: CSSProperties = {
    width: `${wPct}%`,
    maxWidth: "100%",
    marginLeft: horizontalAlignment === "start" ? 0 : "auto",
    marginRight: horizontalAlignment === "end" ? 0 : "auto",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  };

  if (layoutMode === "verticalStack") {
    return {
      ...base,
      height: "auto",
      alignSelf: "center",
    };
  }

  return {
    ...base,
    height: "100%",
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  };
};

const getImageAreaStyle = (
  layoutMode: ComicPageLayoutMode,
  horizontalAlignment: ComicPageHorizontalAlignment
): CSSProperties =>
  layoutMode === "verticalStack"
    ? {
        width: "100%",
        height: "auto",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: comicPageJustifyContent[horizontalAlignment],
      }
    : {
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: comicPageJustifyContent[horizontalAlignment],
      };

const getComicImagePlaceholderHeight = ({
  dimensions,
  frameWidth,
  scaleType,
  layoutMode,
  stretchSmallPages,
}: {
  dimensions: ComicImageDimensions | undefined;
  frameWidth: number;
  scaleType: ComicScaleType;
  layoutMode: ComicPageLayoutMode;
  stretchSmallPages: boolean;
}): number | undefined => {
  if (layoutMode !== "verticalStack" || !dimensions || frameWidth <= 0) return undefined;

  const ratio = dimensions.width / dimensions.height;
  if (!Number.isFinite(ratio) || ratio <= 0) return undefined;

  const isWidthDriven = isWidthDrivenScaleMode(scaleType);
  const shouldStretch =
    !isWidthDriven &&
    stretchSmallPages &&
    stretchAllowedForScale(scaleType) &&
    dimensions.width < frameWidth;
  const renderedWidth = isWidthDriven || shouldStretch
    ? frameWidth
    : Math.min(dimensions.width, frameWidth);
  let renderedHeight = renderedWidth / ratio;

  if (scaleType === ComicScaleType.fitHeight && typeof window !== "undefined") {
    renderedHeight = Math.min(renderedHeight, window.innerHeight);
  }

  return Number.isFinite(renderedHeight) && renderedHeight > 0 ? renderedHeight : undefined;
};

const ComicImage = memo(function ComicImage({
  pageIndex,
  publication,
  link,
  alt,
  scaleType,
  stretchSmallPages,
  widthLimitEnabled,
  widthLimitPercent,
  layoutMode,
  isDoublePageCell,
  shouldLoad,
  loadPriority = 0,
  onPageLoadStateChange,
  horizontalAlignment = "center",
}: {
  pageIndex: number;
  publication: Publication;
  link: Link;
  alt: string;
  scaleType: ComicScaleType;
  stretchSmallPages: boolean;
  widthLimitEnabled: boolean;
  widthLimitPercent: number;
  layoutMode: ComicPageLayoutMode;
  isDoublePageCell: boolean;
  shouldLoad: boolean;
  loadPriority?: number;
  onPageLoadStateChange?: (pageIndex: number, state: ComicPageLoadState) => void;
  horizontalAlignment?: ComicPageHorizontalAlignment;
}) {
  const { t } = useI18n();
  const [reloadKey, setReloadKey] = useState(0);
  const { objectUrl, error, isLoading } = useObjectUrl(
    publication,
    link,
    shouldLoad,
    reloadKey,
    loadPriority
  );
  const frameRef = useRef<HTMLDivElement | null>(null);
  const shouldStretchRef = useRef(false);
  const [isImageReady, setIsImageReady] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isPlaceholderVisible, setIsPlaceholderVisible] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<ComicImageDimensions | undefined>(() =>
    getComicImageDimensions(publication, link)
  );
  const [placeholderHeight, setPlaceholderHeight] = useState<number | undefined>();
  const failedMessage = t("reader.comic.imageLoad.failed");

  const stretchOk = stretchSmallPages && stretchAllowedForScale(scaleType);
  const shouldStretch = isImageReady && shouldStretchRef.current;

  useEffect(() => {
    shouldStretchRef.current = false;
    setIsImageReady(false);
    setImageError(null);
  }, [link.href, reloadKey]);

  // When a page leaves the load window its src is released; drop ready/stretch
  // state so the placeholder (with the retained geometry) takes over again.
  useEffect(() => {
    if (!objectUrl) {
      shouldStretchRef.current = false;
      setIsImageReady(false);
    }
  }, [objectUrl]);

  const decodeStartRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    decodeStartRef.current = objectUrl ? performance.now() : undefined;
  }, [objectUrl]);

  useEffect(() => {
    setImageDimensions(getComicImageDimensions(publication, link));
    setPlaceholderHeight(undefined);
  }, [link, publication]);

  useEffect(() => {
    if (imageDimensions) return;
    return subscribeComicImageDimensions(publication, link.href, () =>
      setImageDimensions(getComicImageDimensions(publication, link))
    );
  }, [imageDimensions, link, publication]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !imageDimensions) return;

    const updatePlaceholderHeight = () => {
      const nextHeight = getComicImagePlaceholderHeight({
        dimensions: imageDimensions,
        frameWidth: frame.clientWidth,
        scaleType,
        layoutMode,
        stretchSmallPages,
      });
      if (nextHeight === undefined) return;
      setPlaceholderHeight((previous) =>
        previous !== undefined && Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
      );
    };

    updatePlaceholderHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updatePlaceholderHeight);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [imageDimensions, layoutMode, scaleType, stretchSmallPages]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element || !shouldLoad || isImageReady) {
      setIsPlaceholderVisible(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setIsPlaceholderVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isImageReady, shouldLoad]);

  useEffect(() => {
    if (!objectUrl || isImageReady || error || imageError || !shouldLoad) return;
    const timeoutId = setTimeout(() => {
      setImageError(failedMessage);
    }, COMIC_IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [error, failedMessage, imageError, isImageReady, objectUrl, shouldLoad]);

  const onImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      let stretch = false;
      if (stretchOk && !isWidthDrivenScaleMode(scaleType)) {
        const nw = img.naturalWidth;
        const fw = frameRef.current?.clientWidth ?? 0;
        stretch = nw > 0 && fw > 0 && nw < fw;
      }
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const nextDimensions = {
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        rememberComicImageDimensions(publication, link.href, nextDimensions);
        setImageDimensions(nextDimensions);
        const nextPlaceholderHeight = getComicImagePlaceholderHeight({
          dimensions: nextDimensions,
          frameWidth: frameRef.current?.clientWidth ?? 0,
          scaleType,
          layoutMode,
          stretchSmallPages,
        });
        if (nextPlaceholderHeight !== undefined) setPlaceholderHeight(nextPlaceholderHeight);
      }
      // Reveal only once the bitmap is decoded off the main thread, so a large page
      // never decodes synchronously in the middle of a scroll.
      const loadedSrc = img.src;
      const reveal = () => {
        if (!img.isConnected || img.src !== loadedSrc) return;
        if (decodeStartRef.current !== undefined) {
          recordComicImageDecode(performance.now() - decodeStartRef.current, link.href);
          decodeStartRef.current = undefined;
        }
        shouldStretchRef.current = stretch;
        setIsImageReady(true);
      };
      if (typeof img.decode === "function") img.decode().then(reveal, reveal);
      else reveal();
    },
    [layoutMode, link, publication, scaleType, stretchOk, stretchSmallPages]
  );

  const onImgError = useCallback(() => {
    setIsImageReady(false);
    setImageError(failedMessage);
  }, [failedMessage]);

  const handleRetry = useCallback(() => {
    if (link.href) invalidateComicImageBlob(publication, link.href);
    setImageError(null);
    setIsImageReady(false);
    setReloadKey((key) => key + 1);
  }, [link.href, publication]);

  const imgStyle = useMemo(
    () => ({
      ...getReaderImageStyling(scaleType, shouldStretch, layoutMode),
      userSelect: "none" as const,
    }),
    [scaleType, shouldStretch, layoutMode]
  );

  const placeholderStyle = useMemo(
    () => ({
      ...getImagePlaceholderStyling(scaleType, shouldStretch, layoutMode),
      ...(placeholderHeight !== undefined
        ? { height: `${placeholderHeight}px`, minHeight: 0 }
        : {}),
    }),
    [layoutMode, placeholderHeight, scaleType, shouldStretch]
  );

  const loadState = useMemo<ComicPageLoadState>(() => {
    if (error || imageError) return "error";
    if (!shouldLoad) return "idle";
    if (isLoading || (objectUrl && !isImageReady)) return "loading";
    if (objectUrl && isImageReady) return "loaded";
    return "idle";
  }, [error, imageError, isImageReady, isLoading, objectUrl, shouldLoad]);

  useEffect(() => {
    onPageLoadStateChange?.(pageIndex, loadState);
  }, [loadState, onPageLoadStateChange, pageIndex]);

  useEffect(
    () => () => {
      onPageLoadStateChange?.(pageIndex, "idle");
    },
    [onPageLoadStateChange, pageIndex]
  );

  const frameStyle: CSSProperties = {
    ...getPageFrameStyle(
      widthLimitEnabled,
      widthLimitPercent,
      scaleType,
      layoutMode,
      isDoublePageCell,
      horizontalAlignment
    ),
    ...(layoutMode === "verticalStack" && isWidthDrivenScaleMode(scaleType) && imageDimensions
      ? { aspectRatio: imageDimensions.width / imageDimensions.height }
      : {}),
  };
  const areaStyle: CSSProperties = {
    ...getImageAreaStyle(layoutMode, horizontalAlignment),
    position: "relative",
  };

  if (error || imageError) {
    return (
      <ComicImageLoadError
        // Raw fetch/decode messages are browser-specific English; telemetry keeps them.
        message={failedMessage}
        onRetry={handleRetry}
        frameStyle={frameStyle}
        areaStyle={areaStyle}
      />
    );
  }

  return (
    <div style={frameStyle}>
      <div ref={frameRef} style={areaStyle}>
        {!isImageReady ? (
          <ComicImagePlaceholder
            style={placeholderStyle}
            showSpinner={loadState === "loading" && isPlaceholderVisible}
            isBusy={loadState === "loading"}
          />
        ) : null}
        {objectUrl ? (
          <img
            key={reloadKey}
            src={objectUrl}
            alt={alt}
            className={styles.image}
            data-ready={isImageReady}
            draggable={false}
            decoding="async"
            fetchPriority={loadPriority >= 100 ? "high" : "auto"}
            onLoad={onImgLoad}
            onError={onImgError}
            style={
              isImageReady
                ? imgStyle
                : { ...imgStyle, position: "absolute", inset: 0, width: "100%", height: "100%" }
            }
          />
        ) : null}
      </div>
    </div>
  );
});

export type ComicBoundaryPageData = {
  currentTitle?: string;
  adjacentTitle?: string;
  /** Navigate to the adjacent chapter. Omit on the last-chapter exit page. */
  onNavigate?: () => void;
  /**
   * Last-chapter exit page: leave the reader the same way as the header back link.
   * `href` is the fallback target when there is no history to return to.
   */
  goBack?: {
    href: string;
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  };
  /** Optional continue action when another source has later chapters. */
  continueElsewhere?: {
    label: string;
    onContinue: () => void;
  };
};

export type ComicBoundaryPageKind = "prev" | "next";

export type ComicBoundaryScrollControls = {
  scrollByViewport: (kind: ComicBoundaryPageKind, amountPercent: number) => boolean;
  scrollToBoundary: (kind: ComicBoundaryPageKind) => boolean;
};

const ComicChapterBoundaryPage = ({
  kind,
  currentTitle,
  adjacentTitle,
  onNavigate,
  goBack,
  continueElsewhere,
}: ComicBoundaryPageData & {
  kind: ComicBoundaryPageKind;
}) => {
  const { t } = useI18n();
  const isExitPage = !onNavigate && (!!goBack || !!continueElsewhere);
  const actionLabel =
    kind === "next"
      ? t("reader.comic.chapterBoundaries.nextChapter")
      : t("reader.comic.chapterBoundaries.previousChapter");

  return (
    <div className={styles.boundaryPage}>
      <div className={styles.boundaryContent}>
        {/* Before the first page of a chapter there is nothing finished yet. */}
        {kind === "next" ? (
          <section className={styles.boundarySection}>
            <strong className={styles.boundaryLabel}>{t("reader.comic.chapterBoundaries.finished")}</strong>
            {currentTitle ? <span className={styles.boundaryTitle}>{currentTitle}</span> : null}
          </section>
        ) : null}
        <section className={styles.boundarySection}>
          {isExitPage ? (
            <>
              <strong className={styles.boundaryTitle}>
                {t("reader.comic.chapterBoundaries.noChaptersLeft")}
              </strong>
              {continueElsewhere ? (
                <button
                  type="button"
                  className={styles.actionButton}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={continueElsewhere.onContinue}
                >
                  {continueElsewhere.label}
                </button>
              ) : null}
              {goBack ? (
                <a
                  href={goBack.href}
                  className={styles.actionButton}
                  data-variant={continueElsewhere ? "secondary" : undefined}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={goBack.onClick}
                >
                  {t("reader.comic.chapterBoundaries.goBack")}
                </a>
              ) : null}
            </>
          ) : (
            <>
              {adjacentTitle ? (
                <>
                  <strong className={styles.boundaryLabel}>
                    {kind === "next"
                      ? t("reader.comic.chapterBoundaries.next")
                      : t("reader.comic.chapterBoundaries.previous")}
                  </strong>
                  <span className={styles.boundaryTitle}>{adjacentTitle}</span>
                </>
              ) : null}
              {onNavigate ? (
                <button
                  type="button"
                  className={styles.actionButton}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={onNavigate}
                >
                  {actionLabel}
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

/** Page that contains the viewport center line; if none (gap), closest by page-mid distance. */
const getActivePageIndexVertical = (root: HTMLDivElement, itemRefs: Map<number, HTMLDivElement>): number => {
  const rootRect = root.getBoundingClientRect();
  const yMid = rootRect.top + rootRect.height / 2;
  const ordered = [...itemRefs.entries()].sort((a, b) => a[0] - b[0]);
  for (const [idx, el] of ordered) {
    const r = el.getBoundingClientRect();
    if (r.top <= yMid && r.bottom >= yMid) return idx;
  }
  let bestIdx = ordered[0]?.[0] ?? 0;
  let bestDist = Infinity;
  itemRefs.forEach((el, idx) => {
    const r = el.getBoundingClientRect();
    const pageMid = r.top + r.height / 2;
    const dist = Math.abs(pageMid - yMid);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });
  return bestIdx;
};

/** Same as vertical but for horizontal continuous scroll. */
const getActivePageIndexHorizontal = (root: HTMLDivElement, itemRefs: Map<number, HTMLDivElement>): number => {
  const rootRect = root.getBoundingClientRect();
  const xMid = rootRect.left + rootRect.width / 2;
  const ordered = [...itemRefs.entries()].sort((a, b) => a[0] - b[0]);
  for (const [idx, el] of ordered) {
    const r = el.getBoundingClientRect();
    if (r.left <= xMid && r.right >= xMid) return idx;
  }
  let bestIdx = ordered[0]?.[0] ?? 0;
  let bestDist = Infinity;
  itemRefs.forEach((el, idx) => {
    const r = el.getBoundingClientRect();
    const pageMid = r.left + r.width / 2;
    const dist = Math.abs(pageMid - xMid);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });
  return bestIdx;
};

export type ComicReaderViewportProps = {
  publication: Publication;
  pages: ComicPage[];
  mode: ComicReadingMode;
  direction: ComicReadingDirection;
  scaleType: ComicScaleType;
  cursorIndex: number;
  setCursorIndex: Dispatch<SetStateAction<number>>;
  pageGapPx: number;
  stretchSmallPages: boolean;
  widthLimitEnabled: boolean;
  widthLimitPercent: number;
  onTap: (event: React.PointerEvent) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPageLoadStateChange?: (pageIndex: number, state: ComicPageLoadState) => void;
  boundaryPages?: {
    previous?: ComicBoundaryPageData;
    next?: ComicBoundaryPageData;
  };
  onBoundaryPageChange?: (kind: ComicBoundaryPageKind | null) => void;
  boundaryScrollControlsRef?: MutableRefObject<ComicBoundaryScrollControls | null>;
};

export const ComicReaderViewport = ({
  publication,
  pages,
  mode,
  direction,
  scaleType,
  cursorIndex,
  setCursorIndex,
  pageGapPx,
  stretchSmallPages,
  widthLimitEnabled,
  widthLimitPercent,
  onTap,
  containerRef,
  onPageLoadStateChange,
  boundaryPages,
  onBoundaryPageChange,
  boundaryScrollControlsRef,
}: ComicReaderViewportProps) => {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const reducedMotion = useAppSelector((state) => state.theming.prefersReducedMotion);
  const boundaryRefs = useRef<Map<ComicBoundaryPageKind, HTMLDivElement>>(new Map());
  const activePointersRef = useRef<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [loadDirection, setLoadDirection] = useState<1 | -1>(1);
  /** When true, `cursorIndex` was updated from scroll measurement — skip `scrollIntoView`. */
  const syncFromScrollRef = useRef(false);
  const programmaticScrollRafRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const scrollMeasurementRafRef = useRef<number | null>(null);
  const firstViewportPageIndexRef = useRef<number | undefined>(undefined);
  const activeBoundaryPageRef = useRef<ComicBoundaryPageKind | null>(null);
  /** Briefly ignore scroll measurement after the visible chapter slice changes. */
  const scrollSyncSuppressUntilRef = useRef(0);

  const isVerticalScrollMode =
    mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon;
  const isContinuousScrollMode =
    isVerticalScrollMode || mode === ComicReadingMode.continuousHorizontal;

  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
  }, []);

  useComicPageWarmup({ publication, pages, cursorIndex, loadDirection });

  // Scroll modes mount (and decode) only pages near the viewport; everything else
  // is already downloaded by warmup, so mounting is a cache hit plus a decode.
  const nearObserverRef = useRef<IntersectionObserver | null>(null);
  const [nearPages, setNearPages] = useState<ReadonlySet<number>>(() => new Set());

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!isContinuousScrollMode || !root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNearPages((previous) => {
          let next: Set<number> | null = null;
          for (const entry of entries) {
            const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex);
            if (!Number.isFinite(pageIndex)) continue;
            const isNear = (next ?? previous).has(pageIndex);
            if (entry.isIntersecting === isNear) continue;
            next ??= new Set(previous);
            if (entry.isIntersecting) next.add(pageIndex);
            else next.delete(pageIndex);
          }
          return next ?? previous;
        });
      },
      {
        root,
        rootMargin: isVerticalScrollMode
          ? COMIC_MOUNT_ROOT_MARGIN_VERTICAL
          : COMIC_MOUNT_ROOT_MARGIN_HORIZONTAL,
      }
    );
    nearObserverRef.current = observer;
    itemRefs.current.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      nearObserverRef.current = null;
      setNearPages(new Set());
    };
  }, [isContinuousScrollMode, isVerticalScrollMode]);

  // A jump (slider, TOC, restored position) mounts its target before the observer reports.
  const cursorMountWindow = useMemo(
    () => getComicPageLoadSet(pages, cursorIndex, COMIC_MOUNT_AHEAD_PAGES, loadDirection),
    [cursorIndex, loadDirection, pages]
  );
  const shouldLoadPage = useCallback(
    (pageIndex: number) =>
      !isContinuousScrollMode || nearPages.has(pageIndex) || cursorMountWindow.has(pageIndex),
    [cursorMountWindow, isContinuousScrollMode, nearPages]
  );

  // Stable per-page ref callbacks: a fresh callback each render would detach and
  // re-attach every page, re-observing it on every cursor change.
  const pageRefCallbacks = useRef<Map<number, (element: HTMLDivElement | null) => void>>(new Map());
  const getPageRef = useCallback((pageIndex: number) => {
    let callback = pageRefCallbacks.current.get(pageIndex);
    if (!callback) {
      callback = (element: HTMLDivElement | null) => {
        const previous = itemRefs.current.get(pageIndex);
        if (previous && previous !== element) nearObserverRef.current?.unobserve(previous);
        if (element) {
          itemRefs.current.set(pageIndex, element);
          nearObserverRef.current?.observe(element);
        } else {
          itemRefs.current.delete(pageIndex);
          pageRefCallbacks.current.delete(pageIndex);
        }
      };
      pageRefCallbacks.current.set(pageIndex, callback);
    }
    return callback;
  }, []);

  const getActiveBoundaryPage = useCallback(
    (root: HTMLDivElement): ComicBoundaryPageKind | null => {
      const rootRect = root.getBoundingClientRect();
      const yMid = rootRect.top + rootRect.height / 2;
      const xMid = rootRect.left + rootRect.width / 2;
      const edgeTolerance = 2;
      const isAtStart =
        mode === ComicReadingMode.continuousHorizontal
          ? root.scrollLeft <= edgeTolerance
          : root.scrollTop <= edgeTolerance;
      const isAtEnd =
        mode === ComicReadingMode.continuousHorizontal
          ? root.scrollLeft + root.clientWidth >= root.scrollWidth - edgeTolerance
          : root.scrollTop + root.clientHeight >= root.scrollHeight - edgeTolerance;
      for (const kind of ["prev", "next"] as const) {
        const el = boundaryRefs.current.get(kind);
        if (!el) continue;
        if (kind === "prev" && !isAtStart) continue;
        if (kind === "next" && !isAtEnd) continue;
        const r = el.getBoundingClientRect();
        const containsMidpoint =
          mode === ComicReadingMode.continuousHorizontal
            ? r.left <= xMid && r.right >= xMid
            : r.top <= yMid && r.bottom >= yMid;
        if (containsMidpoint) return kind;
      }
      return null;
    },
    [mode]
  );

  const suppressScrollSync = useCallback(() => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollRafRef.current !== null) {
      cancelAnimationFrame(programmaticScrollRafRef.current);
    }
    programmaticScrollRafRef.current = requestAnimationFrame(() => {
      programmaticScrollRafRef.current = requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
        programmaticScrollRafRef.current = null;
      });
    });
  }, []);

  const emitBoundaryPageChange = useCallback(
    (kind: ComicBoundaryPageKind | null) => {
      if (activeBoundaryPageRef.current === kind) return;
      activeBoundaryPageRef.current = kind;
      onBoundaryPageChange?.(kind);
    },
    [onBoundaryPageChange]
  );

  const updateActivePageFromScroll = useCallback(() => {
    const root = scrollRef.current;
    if (isProgrammaticScrollRef.current) return;
    if (performance.now() < scrollSyncSuppressUntilRef.current) return;
    if (!root) return;
    if (itemRefs.current.size === 0) return;
    const activeBoundary = getActiveBoundaryPage(root);
    if (activeBoundary) {
      emitBoundaryPageChange(activeBoundary);
      return;
    }
    emitBoundaryPageChange(null);
    let idx: number;
    if (isVerticalScrollMode) {
      idx = getActivePageIndexVertical(root, itemRefs.current);
    } else if (mode === ComicReadingMode.continuousHorizontal) {
      idx = getActivePageIndexHorizontal(root, itemRefs.current);
    } else {
      return;
    }
    if (idx !== cursorIndex) setLoadDirection(idx > cursorIndex ? 1 : -1);
    setCursorIndex((prev) => {
      if (prev === idx) return prev;
      syncFromScrollRef.current = true;
      return idx;
    });
  }, [cursorIndex, emitBoundaryPageChange, getActiveBoundaryPage, isVerticalScrollMode, mode, setCursorIndex]);

  const scheduleActivePageUpdate = useCallback(() => {
    if (scrollMeasurementRafRef.current !== null) return;
    scrollMeasurementRafRef.current = requestAnimationFrame(() => {
      scrollMeasurementRafRef.current = null;
      updateActivePageFromScroll();
    });
  }, [updateActivePageFromScroll]);

  useEffect(() => {
    if (!isVerticalScrollMode) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = scheduleActivePageUpdate;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [isVerticalScrollMode, scheduleActivePageUpdate]);

  useLayoutEffect(() => {
    const first = pages[0]?.index;
    if (typeof first !== "number") return;
    const prevFirst = firstViewportPageIndexRef.current;
    firstViewportPageIndexRef.current = first;
    if (prevFirst === undefined || prevFirst === first) return;
    scrollSyncSuppressUntilRef.current = performance.now() + 600;
    const el = scrollRef.current;
    if (!el) return;
    suppressScrollSync();
    syncFromScrollRef.current = true;
    const firstPage = itemRefs.current.get(first);
    if (mode === ComicReadingMode.continuousHorizontal) {
      el.scrollLeft = firstPage
        ? el.scrollLeft + firstPage.getBoundingClientRect().left - el.getBoundingClientRect().left
        : 0;
      return;
    }
    el.scrollTop = firstPage
      ? el.scrollTop + firstPage.getBoundingClientRect().top - el.getBoundingClientRect().top
      : 0;
  }, [mode, pages, suppressScrollSync]);

  useEffect(() => {
    if (mode !== ComicReadingMode.continuousHorizontal) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = scheduleActivePageUpdate;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [mode, scheduleActivePageUpdate]);

  useEffect(() => {
    if (mode !== ComicReadingMode.continuousVertical && mode !== ComicReadingMode.continuousHorizontal && mode !== ComicReadingMode.webtoon) {
      return;
    }
    if (syncFromScrollRef.current) {
      syncFromScrollRef.current = false;
      return;
    }
    const root = scrollRef.current;
    const el = itemRefs.current.get(cursorIndex);
    if (!el) return;
    const atChapterStart =
      pages[0]?.index === cursorIndex &&
      root != null &&
      (mode === ComicReadingMode.continuousHorizontal ? root.scrollLeft <= 2 : root.scrollTop <= 2);
    if (atChapterStart) return;
    suppressScrollSync();
    el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  }, [cursorIndex, mode, pages, suppressScrollSync]);

  useEffect(() => {
    return () => {
      if (programmaticScrollRafRef.current !== null) {
        cancelAnimationFrame(programmaticScrollRafRef.current);
      }
      if (scrollMeasurementRafRef.current !== null) {
        cancelAnimationFrame(scrollMeasurementRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container?.contains(event.target as Node)) {
        activePointersRef.current.add(event.pointerId);
      } else {
        activePointersRef.current.delete(event.pointerId);
      }
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  }, [containerRef]);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.delete(event.pointerId)) return;
      onTap(event);
    },
    [onTap]
  );

  const pagePos = useMemo(() => pages.findIndex((p) => p.index === cursorIndex), [pages, cursorIndex]);
  const current = pagePos >= 0 ? pages[pagePos] : undefined;
  const prevPage = pagePos > 0 ? pages[pagePos - 1] : undefined;
  const nextPage = pagePos >= 0 && pagePos < pages.length - 1 ? pages[pagePos + 1] : undefined;
  const doublePages = useMemo((): ComicPage[] => {
    if (mode !== ComicReadingMode.doublePage) return [];
    return direction === ComicReadingDirection.rtl
      ? [current, prevPage].filter((p): p is ComicPage => p != null)
      : [current, nextPage].filter((p): p is ComicPage => p != null);
  }, [current, direction, mode, nextPage, prevPage]);

  const isOriginalDouble = mode === ComicReadingMode.doublePage && scaleType === ComicScaleType.originalSize;
  const setBoundaryRef = useCallback(
    (kind: ComicBoundaryPageKind) => (el: HTMLDivElement | null) => {
      if (el) boundaryRefs.current.set(kind, el);
      else boundaryRefs.current.delete(kind);
    },
    []
  );

  useEffect(() => {
    if (!boundaryScrollControlsRef) return;
    boundaryScrollControlsRef.current = {
      scrollByViewport: (kind, amountPercent) => {
        const root = scrollRef.current;
        if (!root || mode !== ComicReadingMode.webtoon) return false;

        const maxScrollTop = root.scrollHeight - root.clientHeight;
        const direction = kind === "next" ? 1 : -1;
        const distance = (root.clientHeight * Math.min(100, Math.max(1, amountPercent))) / 100;
        const target = Math.min(maxScrollTop, Math.max(0, root.scrollTop + direction * distance));
        if (Math.abs(target - root.scrollTop) < 1) return false;

        root.scrollTo({ top: target, behavior: reducedMotion ? "auto" : "smooth" });
        return true;
      },
      scrollToBoundary: (kind) => {
        const el = boundaryRefs.current.get(kind);
        if (!el) return false;
        el.scrollIntoView({
          block: kind === "next" ? "end" : "start",
          inline: kind === "next" ? "end" : "start",
          behavior: "auto",
        });
        window.requestAnimationFrame(updateActivePageFromScroll);
        return true;
      },
    };
    return () => {
      boundaryScrollControlsRef.current = null;
    };
  }, [boundaryScrollControlsRef, mode, reducedMotion, updateActivePageFromScroll]);

  const renderScrollPage = (page: ComicPage) => (
    <div
      key={page.href}
      data-page-index={page.index}
      ref={getPageRef(page.index)}
      className={styles.scrollCell}
    >
      <ComicImage
        pageIndex={page.index}
        publication={publication}
        link={page.link}
        alt={page.title}
        scaleType={scaleType}
        stretchSmallPages={stretchSmallPages}
        widthLimitEnabled={widthLimitEnabled}
        widthLimitPercent={widthLimitPercent}
        layoutMode={isVerticalScrollMode ? "verticalStack" : "viewportBound"}
        isDoublePageCell={false}
        shouldLoad={shouldLoadPage(page.index)}
        // Clamped so pages far from the cursor keep identical props and skip re-rendering.
        loadPriority={page.index === cursorIndex ? 100 : Math.max(0, 10 - Math.abs(page.index - cursorIndex))}
        onPageLoadStateChange={onPageLoadStateChange}
      />
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={styles.viewport}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => activePointersRef.current.delete(event.pointerId)}
    >
      {isContinuousScrollMode ? (
        <div
          ref={setScrollRef}
          className={styles.scroller}
          data-orientation={isVerticalScrollMode ? "vertical" : "horizontal"}
          style={{ gap: pageGapPx }}
        >
          {boundaryPages?.previous ? (
            <div ref={setBoundaryRef("prev")} className={styles.scrollCell} data-boundary="prev">
              <ComicChapterBoundaryPage kind="prev" {...boundaryPages.previous} />
            </div>
          ) : null}
          {pages.map(renderScrollPage)}
          {boundaryPages?.next ? (
            <div ref={setBoundaryRef("next")} className={styles.scrollCell} data-boundary="next">
              <ComicChapterBoundaryPage kind="next" {...boundaryPages.next} />
            </div>
          ) : null}
        </div>
      ) : mode === ComicReadingMode.doublePage ? (
        <div
          className={styles.spread}
          data-scale={isOriginalDouble ? "original" : undefined}
          style={{ gap: pageGapPx }}
        >
          {doublePages.map((page, pagePosition) => (
            <div key={page.href} className={styles.spreadCell}>
              <ComicImage
                pageIndex={page.index}
                publication={publication}
                link={page.link}
                alt={page.title}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                layoutMode="viewportBound"
                isDoublePageCell={isOriginalDouble}
                horizontalAlignment={isOriginalDouble ? undefined : pagePosition === 0 ? "end" : "start"}
                shouldLoad
                onPageLoadStateChange={onPageLoadStateChange}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.paged}>
          {current ? (
            <div className={styles.pagedCell}>
              <ComicImage
                pageIndex={current.index}
                publication={publication}
                link={current.link}
                alt={current.title}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                layoutMode="viewportBound"
                isDoublePageCell={false}
                shouldLoad
                onPageLoadStateChange={onPageLoadStateChange}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
