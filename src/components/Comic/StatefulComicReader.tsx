"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Publication } from "@readium/shared";
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
import { updateComicPosition } from "@/lib/comicPositionReducer";
import { setHovering, setLoading, toggleImmersive } from "@/lib/readerReducer";
import { ThPluginRegistry } from "../Plugins/PluginRegistry";
import { ThPluginProvider } from "../Plugins/PluginProvider";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { StatefulSettingsContainer } from "../Actions/Settings/StatefulSettingsContainer";
import { ComicReaderOverlay } from "./components/ComicReaderOverlay";
import { ComicReaderViewport } from "./components/ComicReaderViewport";
import { useComicKeyboardShortcuts } from "./hooks/useComicKeyboardShortcuts";
import { applyInvertTapZones, resolveTapAction } from "./hooks/useComicTapNavigation";
import { ComicPage, useComicReaderController } from "./hooks/useComicReaderController";

const getReadingOrderImages = (publication: Publication): ComicPage[] => {
  const items = publication.readingOrder?.items ?? [];
  return items
    .filter((item) => !item.templated)
    .filter((item) => typeof item.type === "string" && item.type.startsWith("image/"))
    .map((link, index) => ({ index, link, href: link.href, title: link.title || `Page ${index + 1}` }));
};

const StatefulComicReaderInner = ({ publication, localDataKey }: StatefulReaderProps) => {
  const pages = useMemo(() => getReadingOrderImages(publication), [publication]);
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const settingsTriggerRef = useRef<HTMLElement | null>(null);

  const activeKey = useMemo(
    () => localDataKey ?? (publication.baseURL ? `${publication.baseURL}-comic-settings` : "comic:ephemeral"),
    [localDataKey, publication.baseURL]
  );
  const settings = useAppSelector((s) => (activeKey ? s.comicSettings.byKey[activeKey] : undefined));
  const savedPosition = useAppSelector((s) => (activeKey ? s.comicPosition.byKey[activeKey]?.pageIndex : undefined));
  const isImmersive = useAppSelector((s) => s.reader.isImmersive);
  const merged = settings ?? defaultComicSettings;

  const { mode, direction, scaleType, cursorIndex, setCursorIndex, canGoPrev, canGoNext, goPrev, goNext } =
    useComicReaderController({
      pages,
      settings: merged,
      savedPosition,
      onPersistPosition: (index) => dispatch(updateComicPosition({ key: activeKey, pageIndex: index })),
    });

  const toggleMenu = useCallback(() => {
    dispatch(toggleImmersive());
    dispatch(setHovering(false));
  }, [dispatch]);

  const updateSettings = useCallback(
    (patch: Partial<typeof defaultComicSettings>) => {
      dispatch(updateComicSettings({ key: activeKey, patch }));
    },
    [activeKey, dispatch]
  );

  const cycleOption = useCallback(<T,>(options: readonly T[], current: T) => {
    const idx = options.findIndex((item) => item === current);
    return options[(Math.max(0, idx) + 1) % options.length];
  }, []);

  const cycleReadingMode = useCallback(() => {
    const next = cycleOption(
      [
        ComicReadingMode.singlePage,
        ComicReadingMode.doublePage,
        ComicReadingMode.continuousVertical,
        ComicReadingMode.continuousHorizontal,
        ComicReadingMode.webtoon,
      ] as const,
      mode
    );
    updateSettings({ readingMode: next });
  }, [cycleOption, mode, updateSettings]);

  const cycleScaleType = useCallback(() => {
    const next = cycleOption(
      [ComicScaleType.fitWidth, ComicScaleType.fitHeight, ComicScaleType.fitScreen, ComicScaleType.originalSize] as const,
      scaleType
    );
    updateSettings({ scaleType: next });
  }, [cycleOption, scaleType, updateSettings]);

  const cycleDirection = useCallback(() => {
    const next = cycleOption([ComicReadingDirection.ltr, ComicReadingDirection.rtl] as const, direction);
    updateSettings({ direction: next });
  }, [cycleOption, direction, updateSettings]);

  useComicKeyboardShortcuts({
    onPrev: goPrev,
    onNext: goNext,
    onToggleMenu: toggleMenu,
    onCycleScaleType: cycleScaleType,
    onCycleReadingMode: cycleReadingMode,
    onCycleDirection: cycleDirection,
    onToggleAutoScroll: () => updateSettings({ autoScrollEnabled: !merged.autoScrollEnabled }),
  });

  useEffect(() => {
    dispatch(setComicActiveKey(activeKey));
  }, [activeKey, dispatch]);

  useEffect(() => {
    dispatch(setLoading(false));
  }, [dispatch]);

  const onTap = useCallback(
    (event: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rawX = (event.clientX - rect.left) / rect.width;
      const rawY = (event.clientY - rect.top) / rect.height;
      const invert = merged.invertTapZones === ComicInvertTapZones.default ? ComicInvertTapZones.none : merged.invertTapZones;
      const zones = merged.tapZones === ComicTapZones.default ? ComicTapZones.rightAndLeft : merged.tapZones;
      const { x, y } = applyInvertTapZones(rawX, rawY, invert);
      const action = resolveTapAction({ x, y, zones, direction });
      if (action === "toggle") {
        if (merged.overlayMode === "auto") toggleMenu();
      } else if (action === "next") goNext();
      else goPrev();
    },
    [direction, goNext, goPrev, merged.invertTapZones, merged.overlayMode, merged.tapZones, toggleMenu]
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (mode !== ComicReadingMode.continuousHorizontal) return;
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && !event.shiftKey) {
        event.currentTarget.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    },
    [mode]
  );

  const showOverlay = merged.overlayMode === "pinned" || !isImmersive;
  const showTapZoneDebugOverlay = import.meta.env.DEV;
  const tapZoneDebugCells = useMemo(() => {
    if (!showTapZoneDebugOverlay) return [];
    const invert = merged.invertTapZones === ComicInvertTapZones.default ? ComicInvertTapZones.none : merged.invertTapZones;
    const zones = merged.tapZones === ComicTapZones.default ? ComicTapZones.rightAndLeft : merged.tapZones;
    const steps = 12;
    const cells: Array<{ row: number; col: number; action: "prev" | "next" | "toggle" }> = [];
    for (let row = 0; row < steps; row += 1) {
      for (let col = 0; col < steps; col += 1) {
        const rawX = (col + 0.5) / steps;
        const rawY = (row + 0.5) / steps;
        const { x, y } = applyInvertTapZones(rawX, rawY, invert);
        const action = resolveTapAction({ x, y, zones, direction });
        cells.push({ row, col, action });
      }
    }
    return cells;
  }, [direction, merged.invertTapZones, merged.tapZones, showTapZoneDebugOverlay]);

  return (
    <div style={{ height: "100vh", width: "100vw", background: "var(--th-theme-background, #111)", color: "var(--th-theme-text, #fff)" }}>
      <div style={{ height: "100%", width: "100%", position: "relative" }} onWheel={onWheel}>
        <ComicReaderViewport
          publication={publication}
          pages={pages}
          mode={mode}
          direction={direction}
          scaleType={scaleType}
          cursorIndex={cursorIndex}
          setCursorIndex={setCursorIndex}
          pageGapPx={merged.pageGapPx}
          stretchSmallPages={merged.stretchSmallPages}
          widthLimitEnabled={merged.widthLimitEnabled}
          widthLimitPercent={merged.widthLimitPercent}
          imagePreloadAmount={merged.imagePreloadAmount}
          onTap={onTap}
          containerRef={containerRef}
        />
        <ComicReaderOverlay
          pageCount={pages.length}
          cursorIndex={cursorIndex}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
          onJumpTo={setCursorIndex}
          settings={merged}
          isVisible={showOverlay}
          settingsTriggerRef={settingsTriggerRef}
        />
        {showTapZoneDebugOverlay ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gridTemplateRows: "repeat(12, 1fr)",
              zIndex: 25,
            }}
          >
            {tapZoneDebugCells.map((cell) => (
              <div
                key={`${cell.row}-${cell.col}`}
                style={{
                  background:
                    cell.action === "prev"
                      ? "rgba(255, 80, 80, 0.18)"
                      : cell.action === "next"
                        ? "rgba(80, 180, 255, 0.18)"
                        : "rgba(90, 255, 120, 0.16)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      <StatefulSettingsContainer triggerRef={settingsTriggerRef} />
    </div>
  );
};

export const StatefulComicReader = ({ plugins, ...props }: StatefulReaderProps) => {
  const [pluginsRegistered, setPluginsRegistered] = useState(false);

  useLayoutEffect(() => {
    if (plugins && plugins.length > 0) {
      plugins.forEach((plugin) => ThPluginRegistry.register(plugin));
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

