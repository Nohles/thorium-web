"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { I18nProvider } from "react-aria";
import { Publication } from "@readium/shared";

import readerStyles from "../assets/styles/thorium-web.reader.app.module.css";

import { NavigatorProvider } from "@/core/Navigator";
import { useComicNavigator } from "@/core/Hooks/Comic/useComicNavigator";
import { StatefulReaderProps } from "../Reader/StatefulReaderWrapper";
import { StatefulDockingWrapper } from "../Docking/StatefulDockingWrapper";
import { StatefulReaderHeader } from "../StatefulReaderHeader";
import { StatefulReaderFooter } from "../StatefulReaderFooter";
import { getReaderClassNames } from "../Helpers/getReaderClassNames";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  ComicProgressBarPosition,
  ComicProgressBarType,
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
import { setPublicationEnd, setPublicationStart, setTimeline } from "@/lib/publicationReducer";
import { ThPluginRegistry } from "../Plugins/PluginRegistry";
import { ThPluginProvider } from "../Plugins/PluginProvider";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { ComicReaderOverlay } from "./components/ComicReaderOverlay";
import { ComicReaderViewport, ComicReaderViewportHandle } from "./components/ComicReaderViewport";
import { useComicKeyboardShortcuts } from "./hooks/useComicKeyboardShortcuts";
import { resolveTapAction } from "./hooks/useComicTapNavigation";
import { ComicPage, useComicReaderController } from "./hooks/useComicReaderController";
import { buildComicTimeline, buildComicTocTree } from "./buildComicTimeline";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { ThLayoutUI, ThProgressionFormat } from "@/preferences/models";
import { useI18n } from "@/i18n/useI18n";

const getReadingOrderImages = (publication: Publication): ComicPage[] => {
  const items = publication.readingOrder?.items ?? [];
  return items
    .filter((item) => !item.templated)
    .filter((item) => typeof item.type === "string" && item.type.startsWith("image/"))
    .map((link, index) => ({ index, link, href: link.href, title: link.title || `Page ${index + 1}` }));
};

const StatefulComicReaderInner = ({ publication, localDataKey }: StatefulReaderProps) => {
  const { preferences } = usePreferences();
  const { t } = useI18n();
  const pages = useMemo(() => getReadingOrderImages(publication), [publication]);
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const comicViewportRef = useRef<ComicReaderViewportHandle>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const comicNavigator = useComicNavigator();

  const activeKey = useMemo(
    () => localDataKey ?? (publication.baseURL ? `${publication.baseURL}-comic-settings` : "comic:ephemeral"),
    [localDataKey, publication.baseURL]
  );
  const settings = useAppSelector((s) => (activeKey ? s.comicSettings.byKey[activeKey] : undefined));
  const savedPosition = useAppSelector((s) => (activeKey ? s.comicPosition.byKey[activeKey]?.pageIndex : undefined));
  const isImmersive = useAppSelector((s) => s.reader.isImmersive);
  const isHovering = useAppSelector((s) => s.reader.isHovering);
  const breakpoint = useAppSelector((s) => s.theming.breakpoint);
  const merged = settings ?? defaultComicSettings;

  const layoutUI = preferences.theming.layout.ui?.fxl ?? ThLayoutUI.layered;

  const { mode, direction, scaleType, step, cursorIndex, setCursorIndex, canGoPrev, canGoNext, goPrev, goNext } =
    useComicReaderController({
      pages,
      settings: merged,
      savedPosition,
      onPersistPosition: (index) => dispatch(updateComicPosition({ key: activeKey, pageIndex: index })),
    });

  useLayoutEffect(() => {
    comicNavigator.bind({
      publication,
      links: pages.map((p) => p.link),
      cursorIndex,
      setCursorIndex,
      step,
    });
  }, [comicNavigator, publication, pages, cursorIndex, setCursorIndex, step]);

  const tocTree = useMemo(() => buildComicTocTree(publication, pages), [publication, pages]);

  useEffect(() => {
    const timeline = buildComicTimeline(publication, pages, cursorIndex, tocTree);
    dispatch(setTimeline(timeline));
    dispatch(setPublicationStart(cursorIndex <= 0));
    dispatch(setPublicationEnd(cursorIndex >= pages.length - 1));
  }, [cursorIndex, dispatch, pages, publication, tocTree]);

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
    direction,
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

  useEffect(() => {
    if (mode !== ComicReadingMode.continuousVertical && mode !== ComicReadingMode.webtoon) {
      setScrollProgress(0);
    }
  }, [mode]);

  const onSeekScroll = useCallback((fraction: number) => {
    comicViewportRef.current?.setScrollProgress(fraction);
  }, []);

  const onTap = useCallback(
    (event: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const zones = merged.tapZones === ComicTapZones.default ? ComicTapZones.rightAndLeft : merged.tapZones;
      const action = resolveTapAction({ x, y, zones, direction });
      if (action === "toggle") {
        if (merged.overlayMode === "auto") toggleMenu();
      } else if (action === "next") goNext();
      else goPrev();
    },
    [direction, goNext, goPrev, merged.overlayMode, merged.tapZones, toggleMenu]
  );

  const showOverlay = merged.overlayMode === "pinned" || !isImmersive;
  const integrateFooterProgress =
    merged.progressBarType === ComicProgressBarType.standard &&
    merged.progressBarPosition === ComicProgressBarPosition.bottom;

  const tapZonePreviewCells = useMemo(() => {
    if (!merged.tapZonePreview) return [];
    const zones = merged.tapZones === ComicTapZones.default ? ComicTapZones.rightAndLeft : merged.tapZones;
    const steps = 12;
    const cells: Array<{ row: number; col: number; action: "prev" | "next" | "toggle" }> = [];
    for (let row = 0; row < steps; row += 1) {
      for (let col = 0; col < steps; col += 1) {
        const x = (col + 0.5) / steps;
        const y = (row + 0.5) / steps;
        const action = resolveTapAction({ x, y, zones, direction });
        cells.push({ row, col, action });
      }
    }
    return cells;
  }, [direction, merged.tapZones, merged.tapZonePreview]);

  return (
    <I18nProvider locale={preferences.locale}>
      <NavigatorProvider visualNavigator={comicNavigator}>
        <main
          className={readerStyles.main}
          style={{
            background: "var(--th-theme-background, #111)",
            color: "var(--th-theme-text, #fff)",
          }}
        >
          <StatefulDockingWrapper>
            <div
              className={classNames(
                getReaderClassNames({
                  layoutUI,
                  isScroll: false,
                  isImmersive,
                  isHovering,
                  isFXL: true,
                  breakpoint,
                })
              )}
            >
              <StatefulReaderHeader
                actionKeys={preferences.actions.fxlOrder}
                actionsOrder={preferences.actions.fxlOrder}
                layout={layoutUI}
                runningHeadFormatPref={preferences.theming.header?.runningHead?.format?.fxl}
              />

              <article
                className={readerStyles.wrapper}
                aria-label={t("reader.app.publicationWrapper")}
                style={{ position: "relative", display: "flex", flexDirection: "column", minHeight: 0 }}
              >
                <ComicReaderViewport
                  ref={comicViewportRef}
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
                  onScrollProgress={setScrollProgress}
                />
                <ComicReaderOverlay
                  mode={mode}
                  pageCount={pages.length}
                  cursorIndex={cursorIndex}
                  scrollProgress={scrollProgress}
                  direction={direction}
                  canGoPrev={canGoPrev}
                  canGoNext={canGoNext}
                  onPrev={goPrev}
                  onNext={goNext}
                  onJumpTo={setCursorIndex}
                  onSeekScroll={onSeekScroll}
                  settings={merged}
                  isVisible={showOverlay}
                  integrateProgressInFooter={integrateFooterProgress}
                />
                {merged.tapZonePreview ? (
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
                    {tapZonePreviewCells.map((cell) => (
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
              </article>

              <StatefulReaderFooter
                layout={layoutUI}
                progressionFormatPref={preferences.theming.progression?.format?.fxl}
                progressionFormatFallback={ThProgressionFormat.readingOrderIndex}
              />
            </div>
          </StatefulDockingWrapper>
        </main>
      </NavigatorProvider>
    </I18nProvider>
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
