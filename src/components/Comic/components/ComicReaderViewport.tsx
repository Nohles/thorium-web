"use client";

import { Link, Publication } from "@readium/shared";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  ComicReadingDirection,
  ComicReadingMode,
  ComicScaleType,
} from "@/lib/comicSettingsReducer";
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
        const blob = new Blob([byteArray], { type: link.type || "image/jpeg" });
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

  // Keep hook signature stable for callers even if preloading is tuned later.
  void preload;
  return { objectUrl, error, isLoading };
};

const getScaleStyle = (
  scale: ComicScaleType,
  stretchSmallPages: boolean,
  widthLimitEnabled: boolean,
  widthLimitPercent: number
): CSSProperties => {
  const widthConstraint = widthLimitEnabled ? `${widthLimitPercent}%` : "100%";
  switch (scale) {
    case ComicScaleType.fitWidth:
      return { width: widthConstraint, height: "auto", objectFit: "contain" };
    case ComicScaleType.fitHeight:
      return { height: "100%", width: "auto", objectFit: "contain", maxWidth: widthConstraint };
    case ComicScaleType.originalSize:
      return {
        width: "auto",
        height: "auto",
        objectFit: "contain",
        maxWidth: widthConstraint,
        ...(stretchSmallPages ? { minWidth: "40%" } : {}),
      };
    case ComicScaleType.fitScreen:
    default:
      return {
        maxWidth: widthConstraint,
        maxHeight: "100%",
        width: "auto",
        height: "auto",
        objectFit: "contain",
      };
  }
};

const ComicImage = ({
  publication,
  link,
  scaleType,
  stretchSmallPages,
  widthLimitEnabled,
  widthLimitPercent,
  preload,
}: {
  publication: Publication;
  link: Link;
  scaleType: ComicScaleType;
  stretchSmallPages: boolean;
  widthLimitEnabled: boolean;
  widthLimitPercent: number;
  preload: boolean;
}) => {
  const { objectUrl, error, isLoading } = useObjectUrl(publication, link, preload);
  if (error) return <div style={{ opacity: 0.7, fontSize: 12 }}>{error}</div>;
  if (!objectUrl) return <div style={{ opacity: 0.65, fontSize: 12 }}>{isLoading ? "Loading…" : "No image to display."}</div>;
  return (
    <img
      src={objectUrl}
      alt={link.title || "Comic page"}
      style={getScaleStyle(scaleType, stretchSmallPages, widthLimitEnabled, widthLimitPercent)}
    />
  );
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
}: {
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
}) => {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode !== ComicReadingMode.continuousVertical && mode !== ComicReadingMode.continuousHorizontal && mode !== ComicReadingMode.webtoon) {
      return;
    }
    const el = itemRefs.current.get(cursorIndex);
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [cursorIndex, mode]);

  useEffect(() => {
    if (mode !== ComicReadingMode.continuousVertical && mode !== ComicReadingMode.continuousHorizontal && mode !== ComicReadingMode.webtoon) {
      return;
    }
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const idx = Number((visible?.target as HTMLElement | undefined)?.dataset.pageIndex ?? -1);
        if (idx >= 0) setCursorIndex(idx);
      },
      { root, threshold: [0.3, 0.6, 0.9] }
    );
    itemRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [mode, setCursorIndex]);

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

  return (
    <div ref={containerRef} onPointerUp={onTap} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      {mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon ? (
        <div ref={scrollRef} style={{ height: "100%", overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: pageGapPx }}>
          {pages.map((page) => (
            <div
              key={page.href}
              data-page-index={page.index}
              ref={(el) => {
                if (el) itemRefs.current.set(page.index, el);
              }}
              style={{ display: "grid", placeItems: "center" }}
            >
              <ComicImage
                publication={publication}
                link={page.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                preload={Math.abs(page.index - cursorIndex) <= imagePreloadAmount}
              />
            </div>
          ))}
        </div>
      ) : mode === ComicReadingMode.continuousHorizontal ? (
        <div ref={scrollRef} style={{ height: "100%", overflowX: "auto", overflowY: "hidden", padding: 8, display: "flex", gap: pageGapPx }}>
          {pages.map((page) => (
            <div
              key={page.href}
              data-page-index={page.index}
              ref={(el) => {
                if (el) itemRefs.current.set(page.index, el);
              }}
              style={{ flex: "0 0 100%", display: "grid", placeItems: "center" }}
            >
              <ComicImage
                publication={publication}
                link={page.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                preload={Math.abs(page.index - cursorIndex) <= imagePreloadAmount}
              />
            </div>
          ))}
        </div>
      ) : mode === ComicReadingMode.doublePage ? (
        <div style={{ height: "100%", width: "100%", display: "grid", gridAutoFlow: "column", gridAutoColumns: "1fr", gap: pageGapPx, padding: 8 }}>
          {doublePages.map((page) => (
            <div key={page.href} style={{ display: "grid", placeItems: "center" }}>
              <ComicImage
                publication={publication}
                link={page.link}
                scaleType={scaleType}
                stretchSmallPages={stretchSmallPages}
                widthLimitEnabled={widthLimitEnabled}
                widthLimitPercent={widthLimitPercent}
                preload={Math.abs(page.index - cursorIndex) <= imagePreloadAmount}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ height: "100%", width: "100%", display: "grid", placeItems: "center", padding: 8 }}>
          {current ? (
            <ComicImage
              publication={publication}
              link={current.link}
              scaleType={scaleType}
              stretchSmallPages={stretchSmallPages}
              widthLimitEnabled={widthLimitEnabled}
              widthLimitPercent={widthLimitPercent}
              preload={isContinuous}
            />
          ) : null}
        </div>
      )}
    </div>
  );
};
