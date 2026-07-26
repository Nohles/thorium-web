"use client";

import { Link, Publication } from "@readium/shared";
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
import readerStyles from "@/components/assets/styles/thorium-web.reader.app.module.css";
import {
  ComicReadingDirection,
  ComicReadingMode,
  ComicScaleType,
} from "@/lib/comicSettingsReducer";
import { useI18n } from "@/i18n/useI18n";
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

const MAX_CONCURRENT_COMIC_IMAGE_READS = 5;
/** Keep encoded blob data bounded for publications that cannot use direct HTTP URLs. */
const MAX_COMIC_IMAGE_BLOB_CACHE = 12;
const COMIC_IMAGE_LOAD_TIMEOUT_MS = 15_000;

type QueuedImageRead = {
  priority: number;
  signal: AbortSignal;
  run: () => void;
  cancel: () => void;
};

const comicImageBlobCache = new WeakMap<Publication, Map<string, Blob>>();
const comicImageAspectRatioCache = new WeakMap<Publication, Map<string, number>>();
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

  const bytes = await publication.get(link).read();
  if (!bytes) {
    throw new Error("Failed to load image bytes.");
  }
  if (signal.aborted) throw new DOMException("Image read cancelled.", "AbortError");
  const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const blob = new Blob([new Uint8Array(byteArray)], { type: link.type || "image/jpeg" });

  if (!signal.aborted) touchComicImageBlobCache(publicationCache, link.href, blob);
  return blob;
};

const invalidateComicImageBlob = (publication: Publication, href: string) => {
  comicImageBlobCache.get(publication)?.delete(href);
};

const getComicImageAspectRatio = (publication: Publication, link: Link): number | undefined => {
  if (link.width && link.height) return link.width / link.height;
  return comicImageAspectRatioCache.get(publication)?.get(link.href);
};

const rememberComicImageAspectRatio = (publication: Publication, link: Link, ratio: number) => {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  let publicationCache = comicImageAspectRatioCache.get(publication);
  if (!publicationCache) {
    publicationCache = new Map();
    comicImageAspectRatioCache.set(publication, publicationCache);
  }
  publicationCache.set(link.href, ratio);
};

const getDirectionalLoadSet = (
  pages: readonly ComicPage[],
  cursorIndex: number,
  previousCursorIndex: number,
  imagePreloadAmount: number
): Set<number> => {
  if (pages.length === 0) return new Set();

  const positionByIndex = new Map(pages.map((page, position) => [page.index, position]));
  const cursorPosition = positionByIndex.get(cursorIndex) ?? 0;
  const direction = previousCursorIndex <= cursorIndex ? 1 : -1;
  const selected = new Set<number>();
  const preloadAmount = Math.max(0, imagePreloadAmount);
  for (let offset = 0; offset <= preloadAmount; offset += 1) {
    const position = cursorPosition + offset * direction;
    const page = pages[position];
    if (!page) continue;
    selected.add(page.index);
  }
  return selected;
};

/** Match Suwayomi's continuous reader: load the current page plus a directional preload batch. */
const useDirectionalLoadSet = (
  enabled: boolean,
  pages: readonly ComicPage[],
  cursorIndex: number,
  imagePreloadAmount: number,
  loadDirection: 1 | -1
) => {
  const allowed = useMemo(
    () =>
      enabled
        ? getDirectionalLoadSet(
            pages,
            cursorIndex,
            cursorIndex - loadDirection,
            imagePreloadAmount
          )
        : new Set([cursorIndex]),
    [cursorIndex, enabled, imagePreloadAmount, loadDirection, pages]
  );
  return useCallback((pageIndex: number) => allowed.has(pageIndex), [allowed]);
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

const isSameOriginHttpUrl = (href: string): boolean => {
  if (!isHttpUrl(href) || typeof window === "undefined") return false;
  return new URL(href).origin === window.location.origin;
};

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
        setIsLoading(false);
        return;
      }

      // Cross-origin images may not allow fetch(), so retain the direct DOM path
      // for them. Reader-server assets are same-origin and use the queued blob path.
      if (isHttpUrl(currentLink.href) && !isSameOriginHttpUrl(currentLink.href)) {
        setIsLoading(false);
        setObjectUrl(currentLink.href);
        return;
      }

      setIsLoading(true);
      try {
        const sourceUrl = await enqueueComicImageRead(
          () =>
            withComicImageTimeout(async () => {
              const blob = isHttpUrl(currentLink.href)
                ? await fetch(currentLink.href, { signal: abortController.signal }).then(
                    async (response) => {
                      if (!response.ok) {
                        throw new Error(`Failed to load image (${response.status}).`);
                      }
                      return response.blob();
                    }
                  )
                : await getComicImageBlob(publication, currentLink, abortController.signal);
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
        setObjectUrl(sourceUrl);
      } catch (e) {
        const wasAborted = e instanceof DOMException && e.name === "AbortError";
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

  return { objectUrl, error, isLoading };
};

const comicImageRetryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid rgba(255, 255, 255, 0.25)",
  background: "rgba(30, 30, 30, 0.9)",
  color: "var(--th-theme-text, #fff)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const comicImagePlaceholderInnerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
      <div style={comicImagePlaceholderInnerStyle}>
        <span className={readerStyles.comicImageSpinner} aria-hidden />
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
      <div
        style={{
          ...areaStyle,
          flexDirection: "column",
          gap: 12,
          padding: 16,
          textAlign: "center",
        }}
        role="alert"
      >
        <p style={{ margin: 0, opacity: 0.85, fontSize: 13, lineHeight: 1.4 }}>{message}</p>
        <button type="button" style={comicImageRetryButtonStyle} onClick={onRetry}>
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

const ComicImage = memo(function ComicImage({
  pageIndex,
  publication,
  link,
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
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(() =>
    getComicImageAspectRatio(publication, link)
  );
  const failedMessage = t("reader.comic.imageLoad.failed");

  const stretchOk = stretchSmallPages && stretchAllowedForScale(scaleType);
  const shouldStretch = isImageReady && shouldStretchRef.current;

  useEffect(() => {
    shouldStretchRef.current = false;
    setIsImageReady(false);
    setImageError(null);
  }, [link.href, reloadKey]);

  useEffect(() => {
    setAspectRatio(getComicImageAspectRatio(publication, link));
  }, [link, publication]);

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
        const nextAspectRatio = img.naturalWidth / img.naturalHeight;
        rememberComicImageAspectRatio(publication, link, nextAspectRatio);
        setAspectRatio(nextAspectRatio);
      }
      shouldStretchRef.current = stretch;
      setIsImageReady(true);
    },
    [link, publication, scaleType, stretchOk]
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
    () => getImagePlaceholderStyling(scaleType, shouldStretch, layoutMode),
    [scaleType, shouldStretch, layoutMode]
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
    ...(layoutMode === "verticalStack" && isWidthDrivenScaleMode(scaleType) && aspectRatio
      ? { aspectRatio }
      : {}),
  };
  const areaStyle: CSSProperties = {
    ...getImageAreaStyle(layoutMode, horizontalAlignment),
    position: "relative",
  };

  if (error || imageError) {
    return (
      <ComicImageLoadError
        message={error || imageError || failedMessage}
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
            alt={link.title || "Comic page"}
            className={readerStyles.comicImage}
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

/** Full width of the scroll area so every row shares the same percentage basis (avoid shrink-to-fit per image). */
const pageCellStyleVertical: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
};

const pageCellStyleHorizontal: CSSProperties = {
  flex: "0 0 100%",
  height: "100%",
  minHeight: 0,
  width: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};

export type ComicBoundaryPageData = {
  currentTitle?: string;
  adjacentTitle?: string;
  onNavigate: () => void;
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
  isHorizontal,
}: ComicBoundaryPageData & {
  kind: ComicBoundaryPageKind;
  isHorizontal: boolean;
}) => {
  const { t } = useI18n();
  const actionLabel =
    kind === "next"
      ? t("reader.comic.chapterBoundaries.nextChapter")
      : t("reader.comic.chapterBoundaries.previousChapter");

  return (
    <div
      style={{
        flex: isHorizontal ? "0 0 100%" : "0 0 auto",
        width: "100%",
        height: isHorizontal ? "100%" : "100vh",
        minHeight: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div style={{ width: "min(90vw, 360px)", display: "grid", gap: 48 }}>
        <section style={{ display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 18 }}>{t("reader.comic.chapterBoundaries.finished")}</strong>
          {currentTitle ? <span style={{ fontSize: 22, fontWeight: 700 }}>{currentTitle}</span> : null}
        </section>
        <section style={{ display: "grid", gap: 12 }}>
          {adjacentTitle ? <span style={{ fontSize: 22, fontWeight: 700 }}>{adjacentTitle}</span> : null}
          <button
            type="button"
            onPointerUp={(event) => event.stopPropagation()}
            onClick={onNavigate}
            style={{
              padding: "12px 18px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(30,30,30,0.92)",
              color: "var(--th-theme-text, #fff)",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {actionLabel}
          </button>
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
  imagePreloadAmount: number;
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
  imagePreloadAmount,
  onTap,
  containerRef,
  onPageLoadStateChange,
  boundaryPages,
  onBoundaryPageChange,
  boundaryScrollControlsRef,
}: ComicReaderViewportProps) => {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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

  const shouldLoadPage = useDirectionalLoadSet(
    isContinuousScrollMode,
    pages,
    cursorIndex,
    imagePreloadAmount,
    loadDirection
  );

  const setPageRef = useCallback((pageIndex: number, element: HTMLDivElement | null) => {
    if (element) itemRefs.current.set(pageIndex, element);
    else itemRefs.current.delete(pageIndex);
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

        root.scrollTo({ top: target, behavior: "smooth" });
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
  }, [boundaryScrollControlsRef, mode, updateActivePageFromScroll]);

  return (
    <div
      ref={containerRef}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => activePointersRef.current.delete(event.pointerId)}
      style={{
        flex: 1,
        minHeight: 0,
        height: "100%",
        width: "100%",
        position: "relative",
        overflow: "hidden",
        touchAction: "manipulation",
      }}
    >
      {mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon ? (
        <div
          ref={setScrollRef}
          className={readerStyles.hiddenScrollbar}
          style={{
            height: "100%",
            overflowY: "auto",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: pageGapPx,
          }}
        >
          {boundaryPages?.previous ? (
            <div ref={setBoundaryRef("prev")} style={pageCellStyleVertical}>
              <ComicChapterBoundaryPage kind="prev" isHorizontal={false} {...boundaryPages.previous} />
            </div>
          ) : null}
          {pages.map((page) => (
            <div
              key={page.href}
              data-page-index={page.index}
              ref={(element) => setPageRef(page.index, element)}
              style={pageCellStyleVertical}
            >
              <ComicImage
                pageIndex={page.index}
                publication={publication}
                link={page.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                layoutMode="verticalStack"
                isDoublePageCell={false}
                shouldLoad={shouldLoadPage(page.index)}
                loadPriority={page.index === cursorIndex ? 100 : 10 - Math.abs(page.index - cursorIndex)}
                onPageLoadStateChange={onPageLoadStateChange}
              />
            </div>
          ))}
          {boundaryPages?.next ? (
            <div ref={setBoundaryRef("next")} style={pageCellStyleVertical}>
              <ComicChapterBoundaryPage kind="next" isHorizontal={false} {...boundaryPages.next} />
            </div>
          ) : null}
        </div>
      ) : mode === ComicReadingMode.continuousHorizontal ? (
        <div
          ref={setScrollRef}
          className={readerStyles.hiddenScrollbar}
          style={{
            height: "100%",
            overflowX: "auto",
            overflowY: "hidden",
            overscrollBehavior: "contain",
            touchAction: "pan-x",
            padding: 8,
            display: "flex",
            gap: pageGapPx,
          }}
        >
          {boundaryPages?.previous ? (
            <div ref={setBoundaryRef("prev")} style={pageCellStyleHorizontal}>
              <ComicChapterBoundaryPage kind="prev" isHorizontal {...boundaryPages.previous} />
            </div>
          ) : null}
          {pages.map((page) => (
            <div
              key={page.href}
              data-page-index={page.index}
              ref={(element) => setPageRef(page.index, element)}
              style={pageCellStyleHorizontal}
            >
              <ComicImage
                pageIndex={page.index}
                publication={publication}
                link={page.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                layoutMode="viewportBound"
                isDoublePageCell={false}
                shouldLoad={shouldLoadPage(page.index)}
                loadPriority={page.index === cursorIndex ? 100 : 10 - Math.abs(page.index - cursorIndex)}
                onPageLoadStateChange={onPageLoadStateChange}
              />
            </div>
          ))}
          {boundaryPages?.next ? (
            <div ref={setBoundaryRef("next")} style={pageCellStyleHorizontal}>
              <ComicChapterBoundaryPage kind="next" isHorizontal {...boundaryPages.next} />
            </div>
          ) : null}
        </div>
      ) : mode === ComicReadingMode.doublePage ? (
        isOriginalDouble ? (
          <div
            className={readerStyles.hiddenScrollbar}
            style={{
              height: "100%",
              width: "100%",
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              justifyContent: "center",
              alignItems: "center",
              gap: pageGapPx,
              padding: 8,
              minHeight: 0,
              overflow: "auto",
              margin: "auto",
              minWidth: "fit-content",
            }}
          >
            {doublePages.map((page) => (
              <div
                key={page.href}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: "0 0 auto",
                  margin: "auto",
                  minWidth: "min-content",
                  minHeight: 0,
                  maxHeight: "100%",
                }}
              >
                <ComicImage
                  pageIndex={page.index}
                  publication={publication}
                  link={page.link}
                  scaleType={scaleType}
                  stretchSmallPages={stretchSmallPages}
                  widthLimitEnabled={widthLimitEnabled}
                  widthLimitPercent={widthLimitPercent}
                  layoutMode="viewportBound"
                  isDoublePageCell
                  shouldLoad
                  onPageLoadStateChange={onPageLoadStateChange}
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "1fr",
              gap: pageGapPx,
              padding: 8,
              minHeight: 0,
            }}
          >
            {doublePages.map((page, pagePosition) => (
              <div key={page.href} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%" }}>
                <ComicImage
                  pageIndex={page.index}
                  publication={publication}
                  link={page.link}
                  scaleType={scaleType}
                  stretchSmallPages={stretchSmallPages}
                  widthLimitEnabled={widthLimitEnabled}
                  widthLimitPercent={widthLimitPercent}
                  layoutMode="viewportBound"
                  isDoublePageCell={false}
                  horizontalAlignment={pagePosition === 0 ? "end" : "start"}
                  shouldLoad
                  onPageLoadStateChange={onPageLoadStateChange}
                />
              </div>
            ))}
          </div>
        )
      ) : (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: 8,
            boxSizing: "border-box",
          }}
        >
          {current ? (
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <ComicImage
                pageIndex={current.index}
                publication={publication}
                link={current.link}
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
