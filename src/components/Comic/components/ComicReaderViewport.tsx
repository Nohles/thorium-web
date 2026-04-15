"use client";

import { Link, Publication } from "@readium/shared";
import {
  CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
import {
  ComicPageLayoutMode,
  getImagePlaceholderStyling,
  getPageWidthFraction,
  getReaderImageStyling,
  stretchAllowedForScale,
} from "@/components/Comic/lib/comicReaderLayout";
import { ComicPage } from "../hooks/useComicReaderController";

const useObjectUrl = (publication: Publication, link: Link | undefined, preload = false) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    const run = async () => {
      setError(null);
      if (!link) {
        setObjectUrl(null);
        return;
      }
      setIsLoading(true);
      try {
        const bytes = await publication.get(link).read();
        if (cancelled) return;
        if (!bytes) {
          setError("Failed to load image bytes.");
          setObjectUrl(null);
          return;
        }
        const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const blob = new Blob([new Uint8Array(byteArray)], { type: link.type || "image/jpeg" });
        created = URL.createObjectURL(blob);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return created;
        });
      } catch (e) {
        if (!cancelled) {
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
      if (created) URL.revokeObjectURL(created);
    };
  }, [publication, link]);

  void preload;
  return { objectUrl, error, isLoading };
};

const getPageFrameStyle = (
  widthLimitEnabled: boolean,
  widthLimitPercent: number,
  scaleType: ComicScaleType,
  layoutMode: ComicPageLayoutMode,
  isDoublePageCell: boolean
): CSSProperties => {
  const fraction = getPageWidthFraction(widthLimitEnabled, widthLimitPercent, scaleType, isDoublePageCell);
  const wPct = fraction * 100;
  const base: CSSProperties = {
    width: `${wPct}%`,
    maxWidth: "100%",
    marginLeft: "auto",
    marginRight: "auto",
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

const getImageAreaStyle = (layoutMode: ComicPageLayoutMode): CSSProperties =>
  layoutMode === "verticalStack"
    ? {
        width: "100%",
        height: "auto",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }
    : {
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      };

const ComicImage = ({
  publication,
  link,
  scaleType,
  stretchSmallPages,
  widthLimitEnabled,
  widthLimitPercent,
  layoutMode,
  isDoublePageCell,
  preload,
}: {
  publication: Publication;
  link: Link;
  scaleType: ComicScaleType;
  stretchSmallPages: boolean;
  widthLimitEnabled: boolean;
  widthLimitPercent: number;
  layoutMode: ComicPageLayoutMode;
  isDoublePageCell: boolean;
  preload: boolean;
}) => {
  const { objectUrl, error, isLoading } = useObjectUrl(publication, link, preload);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    setNaturalSize({ w: 0, h: 0 });
  }, [objectUrl]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setFrameWidth(el.clientWidth);
    });
    ro.observe(el);
    setFrameWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [objectUrl]);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const stretchOk = stretchSmallPages && stretchAllowedForScale(scaleType);

  const shouldStretch = useMemo(() => {
    if (!stretchOk || naturalSize.w <= 0 || frameWidth <= 0) return false;
    return naturalSize.w < frameWidth;
  }, [stretchOk, naturalSize.w, frameWidth]);

  const imgStyle = useMemo(
    () => getReaderImageStyling(scaleType, shouldStretch, layoutMode),
    [scaleType, shouldStretch, layoutMode]
  );

  const placeholderStyle = useMemo(
    () => getImagePlaceholderStyling(scaleType, shouldStretch, layoutMode),
    [scaleType, shouldStretch, layoutMode]
  );

  if (error) return <div style={{ opacity: 0.7, fontSize: 12 }}>{error}</div>;
  if (!objectUrl) {
    return (
      <div style={getPageFrameStyle(widthLimitEnabled, widthLimitPercent, scaleType, layoutMode, isDoublePageCell)}>
        <div ref={frameRef} style={getImageAreaStyle(layoutMode)}>
          {isLoading ? (
            <div style={placeholderStyle} aria-busy="true" />
          ) : (
            <div style={{ opacity: 0.65, fontSize: 12 }}>No image to display.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={getPageFrameStyle(widthLimitEnabled, widthLimitPercent, scaleType, layoutMode, isDoublePageCell)}>
      <div ref={frameRef} style={getImageAreaStyle(layoutMode)}>
        <img src={objectUrl} alt={link.title || "Comic page"} onLoad={onImgLoad} style={imgStyle} />
      </div>
    </div>
  );
};

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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

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

const verticalScrollProgress = (el: HTMLDivElement): number => {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return 0;
  return clamp01(el.scrollTop / max);
};

export type ComicReaderViewportHandle = {
  getScrollProgress: () => number;
  setScrollProgress: (fraction: number) => void;
};

export type ComicReaderViewportProps = {
  publication: Publication;
  pages: ComicPage[];
  mode: ComicReadingMode;
  direction: ComicReadingDirection;
  scaleType: ComicScaleType;
  cursorIndex: number;
  setCursorIndex: (index: number) => void;
  pageGapPx: number;
  stretchSmallPages: boolean;
  widthLimitEnabled: boolean;
  widthLimitPercent: number;
  imagePreloadAmount: number;
  onTap: (event: React.PointerEvent) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Fired while vertically scrolling (continuous vertical / webtoon). */
  onScrollProgress?: (progress: number) => void;
};

export const ComicReaderViewport = forwardRef<ComicReaderViewportHandle, ComicReaderViewportProps>(
  function ComicReaderViewport(
    {
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
      onScrollProgress,
    },
    ref
  ) {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** When true, `cursorIndex` was updated from scroll measurement — skip `scrollIntoView`. */
  const syncFromScrollRef = useRef(false);

  const isVerticalScrollMode =
    mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon;

  const updateActivePageFromScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    let idx: number;
    if (isVerticalScrollMode) {
      idx = getActivePageIndexVertical(root, itemRefs.current);
    } else if (mode === ComicReadingMode.continuousHorizontal) {
      idx = getActivePageIndexHorizontal(root, itemRefs.current);
    } else {
      return;
    }
    setCursorIndex((prev) => {
      if (prev === idx) return prev;
      syncFromScrollRef.current = true;
      return idx;
    });
  }, [isVerticalScrollMode, mode, setCursorIndex]);

  const reportScrollProgress = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !isVerticalScrollMode) return;
    onScrollProgress?.(verticalScrollProgress(el));
  }, [isVerticalScrollMode, onScrollProgress]);

  useImperativeHandle(
    ref,
    () => ({
      getScrollProgress: () => {
        const el = scrollRef.current;
        if (!el || !isVerticalScrollMode) return 0;
        return verticalScrollProgress(el);
      },
      setScrollProgress: (fraction: number) => {
        const el = scrollRef.current;
        if (!el || !isVerticalScrollMode) return;
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = max <= 0 ? 0 : clamp01(fraction) * max;
      },
    }),
    [isVerticalScrollMode]
  );

  useEffect(() => {
    if (!isVerticalScrollMode) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      reportScrollProgress();
      updateActivePageFromScroll();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      reportScrollProgress();
      updateActivePageFromScroll();
    });
    ro.observe(el);
    reportScrollProgress();
    updateActivePageFromScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [isVerticalScrollMode, reportScrollProgress, updateActivePageFromScroll, pages.length]);

  useEffect(() => {
    if (mode !== ComicReadingMode.continuousHorizontal) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateActivePageFromScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateActivePageFromScroll());
    ro.observe(el);
    updateActivePageFromScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [mode, updateActivePageFromScroll, pages.length]);

  useEffect(() => {
    if (mode !== ComicReadingMode.continuousVertical && mode !== ComicReadingMode.continuousHorizontal && mode !== ComicReadingMode.webtoon) {
      return;
    }
    if (syncFromScrollRef.current) {
      syncFromScrollRef.current = false;
      return;
    }
    const el = itemRefs.current.get(cursorIndex);
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [cursorIndex, mode]);

  const current = pages[cursorIndex];
  const nextPage = pages[cursorIndex + 1];
  const prevPage = pages[cursorIndex - 1];
  const doublePages = useMemo(() => {
    if (mode !== ComicReadingMode.doublePage) return [];
    return direction === ComicReadingDirection.rtl
      ? [current, prevPage].filter(Boolean)
      : [current, nextPage].filter(Boolean);
  }, [current, direction, mode, nextPage, prevPage]);

  const isContinuous =
    mode === ComicReadingMode.continuousVertical ||
    mode === ComicReadingMode.continuousHorizontal ||
    mode === ComicReadingMode.webtoon;

  const isOriginalDouble = mode === ComicReadingMode.doublePage && scaleType === ComicScaleType.originalSize;

  return (
    <div
      ref={containerRef}
      onPointerUp={onTap}
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
          ref={scrollRef}
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
          {pages.map((page) => (
            <div
              key={page.href}
              data-page-index={page.index}
              ref={(el) => {
                if (el) itemRefs.current.set(page.index, el);
                else itemRefs.current.delete(page.index);
              }}
              style={pageCellStyleVertical}
            >
              <ComicImage
                publication={publication}
                link={page.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                layoutMode="verticalStack"
                isDoublePageCell={false}
                preload={Math.abs(page.index - cursorIndex) <= imagePreloadAmount}
              />
            </div>
          ))}
        </div>
      ) : mode === ComicReadingMode.continuousHorizontal ? (
        <div
          ref={scrollRef}
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
          {pages.map((page) => (
            <div
              key={page.href}
              data-page-index={page.index}
              ref={(el) => {
                if (el) itemRefs.current.set(page.index, el);
                else itemRefs.current.delete(page.index);
              }}
              style={pageCellStyleHorizontal}
            >
              <ComicImage
                publication={publication}
                link={page.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                layoutMode="viewportBound"
                isDoublePageCell={false}
                preload={Math.abs(page.index - cursorIndex) <= imagePreloadAmount}
              />
            </div>
          ))}
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
                  publication={publication}
                  link={page.link}
                  scaleType={scaleType}
                  stretchSmallPages={stretchSmallPages}
                  widthLimitEnabled={widthLimitEnabled}
                  widthLimitPercent={widthLimitPercent}
                  layoutMode="viewportBound"
                  isDoublePageCell
                  preload={Math.abs(page.index - cursorIndex) <= imagePreloadAmount}
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
            {doublePages.map((page) => (
              <div key={page.href} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%" }}>
                <ComicImage
                  publication={publication}
                  link={page.link}
                  scaleType={scaleType}
                  stretchSmallPages={stretchSmallPages}
                  widthLimitEnabled={widthLimitEnabled}
                  widthLimitPercent={widthLimitPercent}
                  layoutMode="viewportBound"
                  isDoublePageCell
                  preload={Math.abs(page.index - cursorIndex) <= imagePreloadAmount}
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
                publication={publication}
                link={current.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                layoutMode="viewportBound"
                isDoublePageCell={false}
                preload={isContinuous}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
  }
);
