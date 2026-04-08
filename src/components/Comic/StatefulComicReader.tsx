"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Publication } from "@readium/shared";

import { StatefulReaderProps } from "../Reader/StatefulReaderWrapper";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  ComicInvertTapZones,
  ComicReadingDirection,
  ComicReadingMode,
  ComicScaleType,
  ComicTapZones,
  defaultComicSettings,
  setComicActiveKey,
} from "@/lib/comicSettingsReducer";
import { setHovering, toggleImmersive } from "@/lib/readerReducer";
import { ThPluginRegistry } from "../Plugins/PluginRegistry";
import { ThPluginProvider } from "../Plugins/PluginProvider";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { StatefulSettingsTrigger } from "../Actions/Settings/StatefulSettingsTrigger";
import { StatefulSettingsContainer } from "../Actions/Settings/StatefulSettingsContainer";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";

type ComicPage = {
  index: number;
  link: Link;
};

const getReadingOrderImages = (publication: Publication): ComicPage[] => {
  const items = publication.readingOrder?.items ?? [];

  return items
    .filter((item) => !item.templated)
    .filter((item) => typeof item.type === "string" && item.type.startsWith("image/"))
    .map((link, index) => ({ index, link }));
};

const useObjectUrl = (publication: Publication, link: Link | undefined) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    const run = async () => {
      setError(null);
      if (!link) {
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }

      setIsLoading(true);
      try {
        const bytes = await publication.get(link).read();
        if (cancelled) return;
        if (!bytes) {
          setError("Failed to load image bytes.");
          return;
        }
        const mime = link.type || "image/jpeg";
        const blob = new Blob([bytes], { type: mime });
        created = URL.createObjectURL(blob);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return created;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load image.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [publication, link]);

  return { objectUrl, error, isLoading };
};

const getEffectiveReadingMode = (mode: ComicReadingMode): ComicReadingMode => {
  if (mode === ComicReadingMode.default) return ComicReadingMode.singlePage;
  return mode;
};

const getEffectiveScaleType = (mode: ComicReadingMode, scale: ComicScaleType): ComicScaleType => {
  if (scale !== ComicScaleType.default) return scale;
  if (mode === ComicReadingMode.webtoon) return ComicScaleType.fitWidth;
  return ComicScaleType.fitScreen;
};

const getScaleStyle = (scale: ComicScaleType): React.CSSProperties => {
  switch (scale) {
    case ComicScaleType.fitWidth:
      return { width: "100%", height: "auto", objectFit: "contain" };
    case ComicScaleType.fitHeight:
      return { height: "100%", width: "auto", objectFit: "contain" };
    case ComicScaleType.originalSize:
      return { width: "auto", height: "auto", objectFit: "contain" };
    case ComicScaleType.fitScreen:
    default:
      return { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain" };
  }
};

const applyInvertTapZones = (
  x: number,
  y: number,
  invert: ComicInvertTapZones
): { x: number; y: number } => {
  if (invert === ComicInvertTapZones.horizontal || invert === ComicInvertTapZones.both) x = 1 - x;
  if (invert === ComicInvertTapZones.vertical || invert === ComicInvertTapZones.both) y = 1 - y;
  return { x, y };
};

const resolveTapAction = (params: {
  x: number;
  y: number;
  zones: ComicTapZones;
  direction: ComicReadingDirection;
}): "prev" | "next" | "toggle" => {
  const { x, y, zones, direction } = params;

  // Center tap always toggles UI (unless zones are disabled and user wants strict disabling later).
  const isCenter = x >= 0.33 && x <= 0.66 && y >= 0.33 && y <= 0.66;
  if (isCenter) return "toggle";

  if (zones === ComicTapZones.disabled) return "toggle";

  const sideToAction = (side: "left" | "right") => {
    if (direction === ComicReadingDirection.rtl) {
      // RTL inverts next/prev semantics.
      return side === "left" ? "next" : "prev";
    }
    return side === "left" ? "prev" : "next";
  };

  const sideFromX = (split: number) => (x < split ? "left" : "right");

  switch (zones) {
    case ComicTapZones.edge: {
      if (x < 0.2) return sideToAction("left");
      if (x > 0.8) return sideToAction("right");
      return "toggle";
    }
    case ComicTapZones.kindle: {
      return sideToAction(sideFromX(0.5));
    }
    case ComicTapZones.lShape: {
      // Approximation: edges + bottom bar are navigation, center is toggle.
      const bottom = y > 0.75;
      if (x < 0.2 || (bottom && x < 0.5)) return sideToAction("left");
      if (x > 0.8 || (bottom && x >= 0.5)) return sideToAction("right");
      return "toggle";
    }
    case ComicTapZones.rightAndLeft: {
      return sideToAction(sideFromX(0.5));
    }
    case ComicTapZones.default:
    default: {
      // Default behaves like Edge, but slightly wider navigation zones.
      if (x < 0.25) return sideToAction("left");
      if (x > 0.75) return sideToAction("right");
      return "toggle";
    }
  }
};

const ComicImage = ({
  publication,
  page,
  scaleType,
  heightMode,
}: {
  publication: Publication;
  page: ComicPage;
  scaleType: ComicScaleType;
  heightMode: "viewport" | "natural";
}) => {
  const { objectUrl, error, isLoading } = useObjectUrl(publication, page.link);
  const style = getScaleStyle(scaleType);

  if (error) {
    return (
      <div style={{ maxWidth: 720, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Unable to render this page</div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>{error}</div>
      </div>
    );
  }

  if (!objectUrl) {
    return <div style={{ opacity: 0.7, fontSize: 13 }}>{isLoading ? "Loading…" : "No image to display."}</div>;
  }

  return (
    <img
      src={objectUrl}
      alt={page.link.title || `Page ${page.index + 1}`}
      style={{
        ...style,
        ...(heightMode === "viewport" ? { maxHeight: "100%" } : {}),
      }}
    />
  );
};

const StatefulComicReaderInner = ({ publication, localDataKey }: StatefulReaderProps) => {
  const pages = useMemo(() => getReadingOrderImages(publication), [publication]);
  const dispatch = useAppDispatch();

  const activeKey = useMemo(
    () => localDataKey ?? (publication.baseURL ? `${publication.baseURL}-comic-settings` : "comic:ephemeral"),
    [localDataKey, publication.baseURL]
  );

  const settings = useAppSelector((s) => (activeKey ? s.comicSettings.byKey[activeKey] : undefined));
  const isImmersive = useAppSelector((s) => s.reader.isImmersive);

  const merged = settings ?? defaultComicSettings;
  const mode = getEffectiveReadingMode(merged.readingMode);
  const scaleType = getEffectiveScaleType(mode, merged.scaleType);
  const direction = merged.direction;
  const tapZones = merged.tapZones === ComicTapZones.default ? ComicTapZones.rightAndLeft : merged.tapZones;
  const invertTapZones = merged.invertTapZones === ComicInvertTapZones.default ? ComicInvertTapZones.none : merged.invertTapZones;
  const pageGapPx = merged.pageGapPx ?? 5;

  const initialIndex = useMemo(() => {
    if (direction === ComicReadingDirection.rtl) return Math.max(0, pages.length - 1);
    return 0;
  }, [direction, pages.length]);

  const [cursorIndex, setCursorIndex] = useState(initialIndex);

  const canGoPrev = useMemo(() => {
    if (pages.length === 0) return false;
    if (direction === ComicReadingDirection.rtl) return cursorIndex < pages.length - 1;
    return cursorIndex > 0;
  }, [cursorIndex, direction, pages.length]);

  const canGoNext = useMemo(() => {
    if (pages.length === 0) return false;
    if (direction === ComicReadingDirection.rtl) return cursorIndex > 0;
    return cursorIndex < pages.length - 1;
  }, [cursorIndex, direction, pages.length]);

  const step = mode === ComicReadingMode.doublePage ? 2 : 1;

  const goPrev = useCallback(() => {
    setCursorIndex((i) => {
      const delta = direction === ComicReadingDirection.rtl ? step : -step;
      const next = i + delta;
      return Math.max(0, Math.min(pages.length - 1, next));
    });
  }, [direction, pages.length, step]);

  const goNext = useCallback(() => {
    setCursorIndex((i) => {
      const delta = direction === ComicReadingDirection.rtl ? -step : step;
      const next = i + delta;
      return Math.max(0, Math.min(pages.length - 1, next));
    });
  }, [direction, pages.length, step]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const scrollToIndex = useCallback((index: number) => {
    const el = itemRefs.current.get(index);
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, []);

  useEffect(() => {
    dispatch(setComicActiveKey(activeKey));
  }, [activeKey, dispatch]);

  useEffect(() => {
    setCursorIndex(initialIndex);
  }, [publication, initialIndex]);

  useEffect(() => {
    if (
      mode === ComicReadingMode.continuousVertical ||
      mode === ComicReadingMode.continuousHorizontal ||
      mode === ComicReadingMode.webtoon
    ) {
      scrollToIndex(cursorIndex);
    }
  }, [cursorIndex, mode, scrollToIndex]);

  const onTap = useCallback(
    (event: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rawX = (event.clientX - rect.left) / rect.width;
      const rawY = (event.clientY - rect.top) / rect.height;
      const { x, y } = applyInvertTapZones(rawX, rawY, invertTapZones);

      const action = resolveTapAction({
        x,
        y,
        zones: tapZones,
        direction,
      });

      if (action === "toggle") {
        dispatch(toggleImmersive());
        dispatch(setHovering(false));
      } else if (action === "next") {
        goNext();
      } else {
        goPrev();
      }
    },
    [direction, dispatch, goNext, goPrev, invertTapZones, tapZones]
  );

  const headerHidden = isImmersive;
  const heightMode: "viewport" | "natural" =
    mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon ? "natural" : "viewport";

  const current = pages[cursorIndex];
  const nextPage = pages[cursorIndex + 1];
  const prevPage = pages[cursorIndex - 1];

  const doublePages = useMemo(() => {
    if (mode !== ComicReadingMode.doublePage) return [];
    if (direction === ComicReadingDirection.rtl) {
      // In RTL, the visual order is typically right page then left page.
      return [current, prevPage].filter(Boolean) as ComicPage[];
    }
    return [current, nextPage].filter(Boolean) as ComicPage[];
  }, [current, direction, mode, nextPage, prevPage]);

  const settingsTriggerRef = useRef<HTMLElement | null>(null);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        background: "var(--th-color-bg, #fff)",
        color: "var(--th-color-text, #111)",
      }}
    >
      {!headerHidden && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            gap: 12,
          }}
        >
          <span ref={settingsTriggerRef as any} style={{ display: "inline-flex" }}>
            <StatefulSettingsTrigger variant={ThActionsTriggerVariant.icon} />
          </span>

          <button type="button" onClick={goPrev} disabled={!canGoPrev}>
            Previous
          </button>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {pages.length > 0 ? `${cursorIndex + 1} / ${pages.length}` : "No pages"}
          </div>

          <button type="button" onClick={goNext} disabled={!canGoNext}>
            Next
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        onPointerUp={onTap}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon ? (
          <div
            style={{
              height: "100%",
              overflowY: "auto",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: pageGapPx,
            }}
          >
            {pages.map((page) => (
              <div
                key={page.link.href}
                ref={(el) => {
                  if (!el) return;
                  itemRefs.current.set(page.index, el);
                }}
                style={{
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <ComicImage publication={publication} page={page} scaleType={scaleType} heightMode={heightMode} />
              </div>
            ))}
          </div>
        ) : mode === ComicReadingMode.continuousHorizontal ? (
          <div
            style={{
              height: "100%",
              overflowX: "auto",
              overflowY: "hidden",
              padding: 8,
              display: "flex",
              flexDirection: "row",
              gap: pageGapPx,
              scrollSnapType: "x mandatory",
            }}
          >
            {pages.map((page) => (
              <div
                key={page.link.href}
                ref={(el) => {
                  if (!el) return;
                  itemRefs.current.set(page.index, el);
                }}
                style={{
                  flex: "0 0 100%",
                  display: "grid",
                  placeItems: "center",
                  scrollSnapAlign: "center",
                }}
              >
                <ComicImage publication={publication} page={page} scaleType={scaleType} heightMode={heightMode} />
              </div>
            ))}
          </div>
        ) : mode === ComicReadingMode.doublePage ? (
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "grid",
              placeItems: "center",
              padding: 8,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "grid",
                gridAutoFlow: "column",
                gridAutoColumns: "1fr",
                gap: pageGapPx,
                alignItems: "center",
              }}
            >
              {doublePages.length > 0 ? (
                doublePages.map((page) => (
                  <div key={page.link.href} style={{ height: "100%", display: "grid", placeItems: "center" }}>
                    <ComicImage publication={publication} page={page} scaleType={scaleType} heightMode="viewport" />
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.7, fontSize: 13 }}>No image to display.</div>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "grid",
              placeItems: "center",
              padding: 8,
            }}
          >
            {current ? (
              <ComicImage publication={publication} page={current} scaleType={scaleType} heightMode="viewport" />
            ) : (
              <div style={{ opacity: 0.7, fontSize: 13 }}>No image to display.</div>
            )}
          </div>
        )}
      </div>

      <StatefulSettingsContainer triggerRef={settingsTriggerRef} />
    </div>
  );
};

export const StatefulComicReader = ({ plugins, ...props }: StatefulReaderProps) => {
  const [pluginsRegistered, setPluginsRegistered] = useState(false);

  useLayoutEffect(() => {
    if (plugins && plugins.length > 0) {
      plugins.forEach((plugin) => {
        ThPluginRegistry.register(plugin);
      });
    } else {
      ThPluginRegistry.register(createDefaultPlugin());
    }
    setPluginsRegistered(true);
  }, [plugins]);

  if (!pluginsRegistered) return null;

  return (
    <ThPluginProvider>
      <StatefulComicReaderInner {...props} plugins={plugins} />
    </ThPluginProvider>
  );
};

