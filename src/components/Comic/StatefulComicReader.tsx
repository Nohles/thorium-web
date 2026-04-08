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
  updateComicSettings,
} from "@/lib/comicSettingsReducer";
import { setHovering, toggleImmersive } from "@/lib/readerReducer";
import { ThPluginRegistry } from "../Plugins/PluginRegistry";
import { ThPluginProvider } from "../Plugins/PluginProvider";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { StatefulSettingsTrigger } from "../Actions/Settings/StatefulSettingsTrigger";
import { StatefulSettingsContainer } from "../Actions/Settings/StatefulSettingsContainer";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";
import { StatefulBackLink } from "../StatefulBackLink";
import { StatefulFullscreenTrigger } from "../Actions/Fullscreen/StatefulFullscreenTrigger";
import { ThNavigationButton } from "@/core/Components/Buttons/ThNavigationButton";

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
        const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const normalizedBytes = new Uint8Array(byteArray.byteLength);
        normalizedBytes.set(byteArray);
        const blob = new Blob([normalizedBytes], { type: mime });
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
  const [sidebarDockMode, setSidebarDockMode] = useState<"left" | "right" | "window">("left");
  const [isSidebarModeMenuOpen, setIsSidebarModeMenuOpen] = useState(false);

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
        if (sidebarDockMode === "window") {
          dispatch(toggleImmersive());
          dispatch(setHovering(false));
        }
      } else if (action === "next") {
        goNext();
      } else {
        goPrev();
      }
    },
    [direction, dispatch, goNext, goPrev, invertTapZones, sidebarDockMode, tapZones]
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
  const tocTriggerRef = useRef<HTMLElement | null>(null);
  const sidebarModeMenuRef = useRef<HTMLDivElement | null>(null);

  const showArrows =
    tapZones !== ComicTapZones.disabled &&
    mode !== ComicReadingMode.continuousVertical &&
    mode !== ComicReadingMode.webtoon;

  const arrowSize = "var(--th-arrow-size, 40px)";
  const arrowOffset = "var(--th-arrow-offset, 5px)";

  const navLabelPrev = direction === ComicReadingDirection.rtl ? "Next" : "Previous";
  const navLabelNext = direction === ComicReadingDirection.rtl ? "Previous" : "Next";

  const showSidebar = !headerHidden;
  const comicTitle = String(publication.metadata?.title || "Untitled Comic");
  const cbzFileTitle = useMemo(() => {
    const source = publication.baseURL || localDataKey || "";
    if (!source) return "Unknown file";
    const normalized = source.split(/[?#]/)[0] || source;
    const parts = normalized.split("/");
    const lastPart = parts[parts.length - 1] || normalized;
    return lastPart || "Unknown file";
  }, [localDataKey, publication.baseURL]);
  const updateSettings = useCallback(
    (patch: Partial<typeof defaultComicSettings>) => {
      dispatch(updateComicSettings({ key: activeKey, patch }));
    },
    [activeKey, dispatch]
  );

  const selectedReadingMode = mode;
  const selectedScaleType = scaleType;
  const selectedDirection = direction;
  const readingModeOptions = [
    ComicReadingMode.singlePage,
    ComicReadingMode.doublePage,
    ComicReadingMode.continuousVertical,
    ComicReadingMode.continuousHorizontal,
    ComicReadingMode.webtoon,
  ] as const;
  const scaleTypeOptions = [
    ComicScaleType.fitWidth,
    ComicScaleType.fitHeight,
    ComicScaleType.fitScreen,
    ComicScaleType.originalSize,
  ] as const;
  const directionOptions = [ComicReadingDirection.ltr, ComicReadingDirection.rtl] as const;
  const readingModeLabels: Record<ComicReadingMode, string> = {
    [ComicReadingMode.default]: "Default",
    [ComicReadingMode.singlePage]: "Single page",
    [ComicReadingMode.doublePage]: "Double page",
    [ComicReadingMode.continuousVertical]: "Continuous vertical",
    [ComicReadingMode.continuousHorizontal]: "Continuous horizontal",
    [ComicReadingMode.webtoon]: "Webtoon",
  };
  const scaleTypeLabels: Record<ComicScaleType, string> = {
    [ComicScaleType.default]: "Default",
    [ComicScaleType.fitWidth]: "Fit width",
    [ComicScaleType.fitHeight]: "Fit height",
    [ComicScaleType.fitScreen]: "Fit screen",
    [ComicScaleType.originalSize]: "Original size",
  };
  const directionLabels: Record<ComicReadingDirection, string> = {
    [ComicReadingDirection.ltr]: "Left to right",
    [ComicReadingDirection.rtl]: "Right to left",
  };
  const getNextOption = useCallback(<T,>(current: T, options: readonly T[]) => {
    const currentIndex = options.findIndex((option) => option === current);
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    return options[(safeIndex + 1) % options.length];
  }, []);
  const cycleReadingMode = useCallback(() => {
    const next = getNextOption(selectedReadingMode, readingModeOptions);
    updateSettings({ readingMode: next });
  }, [getNextOption, readingModeOptions, selectedReadingMode, updateSettings]);
  const cycleScaleType = useCallback(() => {
    const next = getNextOption(selectedScaleType, scaleTypeOptions);
    updateSettings({ scaleType: next });
  }, [getNextOption, scaleTypeOptions, selectedScaleType, updateSettings]);
  const cycleDirection = useCallback(() => {
    const next = getNextOption(selectedDirection, directionOptions);
    updateSettings({ direction: next });
  }, [directionOptions, getNextOption, selectedDirection, updateSettings]);
  const placeholderChapters = useMemo(
    () => [
      { id: "chapter-1", label: "Chapter 1 (placeholder)" },
      { id: "chapter-2", label: "Chapter 2 (placeholder)" },
      { id: "chapter-3", label: "Chapter 3 (placeholder)" },
    ],
    []
  );
  const [selectedChapter, setSelectedChapter] = useState(placeholderChapters[0]?.id ?? "");
  const selectedChapterIndex = Math.max(
    0,
    placeholderChapters.findIndex((chapter) => chapter.id === selectedChapter)
  );
  const canGoPrevChapter = selectedChapterIndex > 0;
  const canGoNextChapter = selectedChapterIndex < placeholderChapters.length - 1;
  const goPrevChapter = useCallback(() => {
    setSelectedChapter((current) => {
      const currentIndex = placeholderChapters.findIndex((chapter) => chapter.id === current);
      const safeIndex = currentIndex < 0 ? 0 : currentIndex;
      const nextIndex = Math.max(0, safeIndex - 1);
      return placeholderChapters[nextIndex]?.id ?? current;
    });
  }, [placeholderChapters]);
  const goNextChapter = useCallback(() => {
    setSelectedChapter((current) => {
      const currentIndex = placeholderChapters.findIndex((chapter) => chapter.id === current);
      const safeIndex = currentIndex < 0 ? 0 : currentIndex;
      const nextIndex = Math.min(placeholderChapters.length - 1, safeIndex + 1);
      return placeholderChapters[nextIndex]?.id ?? current;
    });
  }, [placeholderChapters]);

  const mutedLabelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    opacity: 0.68,
    fontWeight: 700,
  };

  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 8,
    borderBottom: "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 35%, transparent)",
  };

  const surfaceButtonStyle: React.CSSProperties = {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 40%, transparent)",
    background: "color-mix(in srgb, var(--th-theme-surface, rgba(0,0,0,0.85)) 85%, var(--th-theme-text, #fff) 15%)",
    color: "var(--th-theme-text, #fff)",
    fontWeight: 600,
    padding: "0 10px",
    cursor: "pointer",
  };

  const makeDockButtonStyle = (dock: "left" | "right" | "window"): React.CSSProperties => ({
    ...surfaceButtonStyle,
    minHeight: 32,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    background:
      sidebarDockMode === dock
        ? "var(--th-theme-text, #fff)"
        : "color-mix(in srgb, var(--th-theme-surface, rgba(0,0,0,0.85)) 85%, transparent)",
    color: sidebarDockMode === dock ? "var(--th-theme-background, #111)" : "var(--th-theme-text, #fff)",
  });

  useEffect(() => {
    if (!isSidebarModeMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!sidebarModeMenuRef.current?.contains(target)) setIsSidebarModeMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isSidebarModeMenuOpen]);

  const sidebarContent = (
    <aside
      style={{
        width: 300,
        maxWidth: "80vw",
        height: "100%",
        background: "var(--th-theme-surface, rgba(0,0,0,0.9))",
        color: "var(--th-theme-text, #fff)",
        borderInlineEnd:
          sidebarDockMode === "left"
            ? "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 55%, transparent)"
            : undefined,
        borderInlineStart:
          sidebarDockMode === "right"
            ? "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 55%, transparent)"
            : undefined,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        overflow: "auto",
        zIndex: sidebarDockMode === "window" ? 20 : 2,
        position: sidebarDockMode === "window" ? "absolute" : "relative",
        left: sidebarDockMode === "window" ? 16 : undefined,
        right: undefined,
        top: sidebarDockMode === "window" ? 16 : undefined,
        maxHeight: sidebarDockMode === "window" ? "calc(100% - 32px)" : undefined,
        border:
          sidebarDockMode === "window"
            ? "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 70%, transparent)"
            : undefined,
        borderRadius: sidebarDockMode === "window" ? 14 : 0,
        boxShadow: sidebarDockMode === "window" ? "0 18px 40px rgba(0, 0, 0, 0.45)" : undefined,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 30 }}>
        <StatefulBackLink />
        <div ref={sidebarModeMenuRef} style={{ display: "inline-flex", alignItems: "center", gap: 6, position: "relative" }}>
          <button
            type="button"
            aria-label="Sidebar mode menu"
            aria-haspopup="menu"
            aria-expanded={isSidebarModeMenuOpen}
            onClick={() => setIsSidebarModeMenuOpen((open) => !open)}
            style={{
              ...surfaceButtonStyle,
              minHeight: 32,
              width: 32,
              minWidth: 32,
              padding: 0,
              borderRadius: 999,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            &#8942;
          </button>
          {isSidebarModeMenuOpen && (
            <div
              role="menu"
              aria-label="Select sidebar mode"
              style={{
                position: "absolute",
                insetInlineEnd: 0,
                top: "calc(100% + 6px)",
                minWidth: 136,
                padding: 6,
                borderRadius: 10,
                border: "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 55%, transparent)",
                background: "var(--th-theme-surface, rgba(0,0,0,0.92))",
                boxShadow: "0 12px 24px rgba(0,0,0,0.32)",
                zIndex: 30,
                display: "grid",
                gap: 4,
              }}
            >
              {([
                { id: "left", label: "Dock left" },
                { id: "right", label: "Dock right" },
                { id: "window", label: "Windowed" },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  role="menuitemradio"
                  aria-checked={sidebarDockMode === option.id}
                  type="button"
                  onClick={() => {
                    setSidebarDockMode(option.id);
                    setIsSidebarModeMenuOpen(false);
                  }}
                  style={{
                    ...surfaceButtonStyle,
                    minHeight: 30,
                    justifyContent: "flex-start",
                    borderRadius: 8,
                    paddingInline: 10,
                    textAlign: "left",
                    background:
                      sidebarDockMode === option.id
                        ? "var(--th-theme-text, #fff)"
                        : "color-mix(in srgb, var(--th-theme-surface, rgba(0,0,0,0.9)) 94%, transparent)",
                    color:
                      sidebarDockMode === option.id ? "var(--th-theme-background, #111)" : "var(--th-theme-text, #fff)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <span style={{ display: "inline-flex" }}>
            <StatefulFullscreenTrigger variant={ThActionsTriggerVariant.button} />
          </span>
        </div>
      </div>

      <section style={sectionStyle}>
        <div>
          <div style={mutedLabelStyle}>Comic Title</div>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{comicTitle}</div>
        </div>
        <div>
          <div style={mutedLabelStyle}>CBZ File</div>
          <div style={{ fontSize: 13, opacity: 0.9, wordBreak: "break-word" }}>{cbzFileTitle}</div>
        </div>
      </section>

      

        <label htmlFor="comic-page-select" style={{ fontWeight: 600, fontSize: 13 }}>
          Page
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            aria-label="Previous page"
            onClick={goPrev}
            disabled={!canGoPrev}
            style={surfaceButtonStyle}
          >
            &#8249;
          </button>
          <select
            id="comic-page-select"
            aria-label="Select page"
            value={String(cursorIndex)}
            onChange={(event) => setCursorIndex(Number(event.target.value))}
            style={{
              width: "100%",
              minHeight: 40,
              borderRadius: 10,
              border: "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 40%, transparent)",
              background:
                "color-mix(in srgb, var(--th-theme-surface, rgba(0,0,0,0.85)) 84%, var(--th-theme-text, #fff) 16%)",
              color: "var(--th-theme-text, #fff)",
              paddingInline: 10,
              fontWeight: 600,
            }}
          >
            {pages.map((page) => (
              <option key={page.link.href} value={page.index}>
                Page {page.index + 1}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Next page"
            onClick={goNext}
            disabled={!canGoNext}
            style={surfaceButtonStyle}
          >
            &#8250;
          </button>
        </div>
 

      <section style={sectionStyle}>
        <label htmlFor="comic-chapter-select" style={{ fontWeight: 600, fontSize: 13 }}>
          Chapter
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            aria-label="Previous chapter"
            onClick={goPrevChapter}
            disabled={!canGoPrevChapter}
            style={surfaceButtonStyle}
          >
            &#8249;
          </button>
          <select
            id="comic-chapter-select"
            aria-label="Select chapter"
            value={selectedChapter}
            onChange={(event) => setSelectedChapter(event.target.value)}
            style={{
              width: "100%",
              minHeight: 40,
              borderRadius: 10,
              border: "1px solid color-mix(in srgb, var(--th-theme-subdue, rgba(255,255,255,0.25)) 40%, transparent)",
              background:
                "color-mix(in srgb, var(--th-theme-surface, rgba(0,0,0,0.85)) 84%, var(--th-theme-text, #fff) 16%)",
              color: "var(--th-theme-text, #fff)",
              paddingInline: 10,
              fontWeight: 600,
            }}
          >
            {placeholderChapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Next chapter"
            onClick={goNextChapter}
            disabled={!canGoNextChapter}
            style={surfaceButtonStyle}
          >
            &#8250;
          </button>
        </div>
      </section>

      <section style={{ ...sectionStyle, borderBottom: "none", paddingBottom: 0 }}>
        <div style={mutedLabelStyle}>Common settings</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            onClick={cycleReadingMode}
            aria-label="Cycle reading mode"
            title={`Reading mode`}
            style={{ ...surfaceButtonStyle, width: "100%" }}
          >
            {readingModeLabels[selectedReadingMode]}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            onClick={cycleScaleType}
            aria-label="Cycle image scale type"
            title={`Image scale type`}
            style={{ ...surfaceButtonStyle, width: "100%" }}
          >
            {scaleTypeLabels[selectedScaleType]}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            onClick={cycleDirection}
            aria-label="Cycle reading direction"
            title={`Reading direction`}
            style={{ ...surfaceButtonStyle, width: "100%" }}
          >
            {directionLabels[selectedDirection]}
          </button>
        </div>

        <div style={{ display: "inline-flex", alignItems: "center" }}>
          <span
            ref={settingsTriggerRef as any}
            style={{ display: "inline-flex" }}
            title="Open settings menu"
            aria-label="Open settings menu"
          >
            <StatefulSettingsTrigger variant={ThActionsTriggerVariant.button} />
          </span>
        </div>
      </section>
    </aside>
  );

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        background: "var(--th-theme-background, #fff)",
        color: "var(--th-theme-text, #111)",
      }}
    >
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>
        {showSidebar && sidebarDockMode === "left" && sidebarContent}

        <div
          ref={containerRef}
          onPointerUp={onTap}
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
          }}
        >
        {showArrows && (
          <>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: arrowOffset,
                transform: "translateY(-50%)",
                zIndex: 5,
                pointerEvents: "auto",
              }}
            >
              <ThNavigationButton
                direction="left"
                aria-label={navLabelPrev}
                isDisabled={!canGoPrev}
                onPress={goPrev}
                style={{ width: arrowSize, height: arrowSize }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                top: "50%",
                right: arrowOffset,
                transform: "translateY(-50%)",
                zIndex: 5,
                pointerEvents: "auto",
              }}
            >
              <ThNavigationButton
                direction="right"
                aria-label={navLabelNext}
                isDisabled={!canGoNext}
                onPress={goNext}
                style={{ width: arrowSize, height: arrowSize }}
              />
            </div>
          </>
        )}

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

        {showSidebar && sidebarDockMode === "right" && sidebarContent}
        {showSidebar && sidebarDockMode === "window" && sidebarContent}
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

