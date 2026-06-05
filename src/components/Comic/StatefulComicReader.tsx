"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { Link, Manifest, Publication } from "@readium/shared";

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
  ComicReadingDirection,
  ComicReadingMode,
  ComicScaleType,
  ComicTapZones,
  defaultComicSettings,
  LegacyComicSettings,
  normalizeComicSettings,
  setComicActiveKey,
  updateComicSettings,
} from "@/lib/comicSettingsReducer";
import { updateComicPosition } from "@/lib/comicPositionReducer";
import { setHovering, setLoading, toggleImmersive } from "@/lib/readerReducer";
import { setPublicationEnd, setPublicationStart, setTimeline, setTocTree } from "@/lib/publicationReducer";
import { ThPluginRegistry } from "../Plugins/PluginRegistry";
import { ThPluginProvider } from "../Plugins/PluginProvider";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { ComicReaderOverlay } from "./components/ComicReaderOverlay";
import { ComicReaderViewport, type ComicBoundaryScrollControls } from "./components/ComicReaderViewport";
import { useComicKeyboardShortcuts } from "./hooks/useComicKeyboardShortcuts";
import { resolveTapAction } from "./hooks/useComicTapNavigation";
import { ComicPage, useComicReaderController } from "./hooks/useComicReaderController";
import { buildComicChapterTocTree, buildComicTimeline, buildComicTocTree } from "./buildComicTimeline";
import { buildComicProgressItems, ComicPageLoadState } from "./lib/comicProgress";
import {
  buildComicChapterSegments,
  canAdvanceWithinSegment,
  canRetreatWithinSegment,
  getSegmentForPageIndex,
  getSegmentIndex,
  hasMultiChapterStructure,
  isAtFirstNavigablePositionInSegment,
  isAtLastNavigablePositionInSegment,
} from "./lib/comicChapters";
import {
  buildComicArchiveChapters,
  isComicArchivePosition,
  isComicArchiveSeriesManifest,
  makeChapterTocLink,
  makeComicArchivePosition,
  readManifestFromUrl,
  resolveChapterResourceHref,
  type ComicArchiveChapter,
} from "./lib/comicArchiveSeries";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { ThLayoutUI, ThProgressionFormat } from "@/preferences/models";
import { useI18n } from "@/i18n/useI18n";
import { usePositionStorage } from "@/hooks/usePositionStorage";
import { buildTocTree } from "@/helpers/buildTocTree";

const getReadingOrderImages = (publication: Publication): ComicPage[] => {
  const items = publication.readingOrder?.items ?? [];
  return items
    .filter((item) => !item.templated)
    .filter((item) => typeof item.type === "string" && item.type.startsWith("image/"))
    .map((link, index) => ({ index, link, href: link.href, title: link.title || `Page ${index + 1}` }));
};

const getManifestSelfHref = (publication: Publication): string | undefined => {
  const self = publication.manifest.links?.items?.find((link) => link.rels?.has("self"));
  return self?.href || publication.baseURL;
};

const getChapterImages = (
  chapter: ComicArchiveChapter,
  manifest: Manifest,
  manifestUrl: string,
  startIndex: number
): ComicPage[] => {
  const items = manifest.readingOrder?.items ?? [];
  return items
    .filter((item) => !item.templated)
    .filter((item) => typeof item.type === "string" && item.type.startsWith("image/"))
    .map((link, pageIndexInChapter) => {
      const href = resolveChapterResourceHref(manifestUrl, link.href);
      const pageLink = new Link({
        href,
        type: link.type,
        title: link.title || `${chapter.title} - Page ${pageIndexInChapter + 1}`,
      });
      const index = startIndex + pageIndexInChapter;
      return {
        index,
        link: pageLink,
        href,
        title: pageLink.title || `Page ${index + 1}`,
        archive: {
          chapterIndex: chapter.index,
          chapterHref: chapter.href,
          pageIndexInChapter,
          pageHref: link.href,
        },
      };
    });
};

const buildSeriesSegments = (chapters: ComicArchiveChapter[], pages: ComicPage[]) => {
  const segments = [];
  for (const chapter of chapters) {
    const chapterPages = pages.filter((page) => page.archive?.chapterIndex === chapter.index);
    if (chapterPages.length === 0) continue;
    segments.push({
      title: chapter.title,
      startIndex: chapterPages[0]!.index,
      endIndex: chapterPages[chapterPages.length - 1]!.index,
    });
  }
  return segments;
};

const normalizeHref = (href: string) => {
  const [base] = href.split("#");
  const [path] = base.split("?");
  return path;
};

const StatefulComicReaderInner = ({ publication, localDataKey, positionStorage }: StatefulReaderProps) => {
  const { preferences } = usePreferences();
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boundaryScrollControlsRef = useRef<ComicBoundaryScrollControls | null>(null);
  const [pageLoadStates, setPageLoadStates] = useState<Record<number, ComicPageLoadState>>({});
  const [activeBoundaryPage, setActiveBoundaryPage] = useState<"prev" | "next" | null>(null);

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
  const merged = useMemo(() => normalizeComicSettings(settings as LegacyComicSettings), [settings]);

  const layoutUI = preferences.theming.layout.ui?.fxl ?? ThLayoutUI.layered;

  const manifestSelfHref = useMemo(() => getManifestSelfHref(publication), [publication]);
  const isArchiveSeries = useMemo(() => isComicArchiveSeriesManifest(publication.manifest), [publication.manifest]);
  const archiveChapters = useMemo(
    () => (isArchiveSeries && manifestSelfHref ? buildComicArchiveChapters(publication.manifest, manifestSelfHref) : []),
    [isArchiveSeries, manifestSelfHref, publication.manifest]
  );
  const [chapterManifests, setChapterManifests] = useState<Record<number, { manifest: Manifest; manifestUrl: string }>>({});
  const chapterManifestPromisesRef = useRef<Partial<Record<number, Promise<boolean>>>>({});
  const [chapterLoadError, setChapterLoadError] = useState<string | null>(null);
  const { setLocalData, localData } = usePositionStorage(localDataKey, positionStorage);

  const loadChapter = useCallback(
    async (chapterIndex: number): Promise<boolean> => {
      if (!isArchiveSeries) return false;
      const chapter = archiveChapters[chapterIndex];
      if (!chapter) return false;
      if (chapterManifests[chapterIndex]) return true;
      if (chapterManifestPromisesRef.current[chapterIndex]) {
        return chapterManifestPromisesRef.current[chapterIndex]!;
      }
      if (!chapter.manifestUrl) {
        setChapterLoadError("This comic series server does not expose chapter manifests Thorium Web can discover.");
        return false;
      }

      const promise = readManifestFromUrl(chapter.manifestUrl)
        .then((manifest) => {
          setChapterManifests((prev) => ({
            ...prev,
            [chapterIndex]: { manifest, manifestUrl: chapter.manifestUrl! },
          }));
          setChapterLoadError(null);
          return true;
        })
        .catch((error) => {
          setChapterLoadError(error instanceof Error ? error.message : "Failed to load chapter manifest.");
          return false;
        })
        .finally(() => {
          delete chapterManifestPromisesRef.current[chapterIndex];
        });
      chapterManifestPromisesRef.current[chapterIndex] = promise;
      return promise;
    },
    [archiveChapters, chapterManifests, isArchiveSeries]
  );

  const initialArchiveChapterIndex = useMemo(() => {
    if (isComicArchivePosition(localData)) {
      return localData.chapterIndex;
    }
    return 0;
  }, [localData]);

  useEffect(() => {
    if (!isArchiveSeries || archiveChapters.length === 0) return;
    loadChapter(initialArchiveChapterIndex).catch(() => undefined);
  }, [archiveChapters.length, initialArchiveChapterIndex, isArchiveSeries, loadChapter]);

  const allPages = useMemo(() => {
    if (!isArchiveSeries) return getReadingOrderImages(publication);
    let startIndex = 0;
    const pages: ComicPage[] = [];
    for (const chapter of archiveChapters) {
      const loaded = chapterManifests[chapter.index];
      if (!loaded) continue;
      const chapterPages = getChapterImages(chapter, loaded.manifest, loaded.manifestUrl, startIndex);
      pages.push(...chapterPages);
      startIndex += chapterPages.length;
    }
    return pages;
  }, [archiveChapters, chapterManifests, isArchiveSeries, publication]);
  const allPagesRef = useRef(allPages);
  const setLocalDataRef = useRef(setLocalData);
  const manifestRef = useRef(publication.manifest);
  const currentArchiveIdentityRef = useRef<ComicPage["archive"] | undefined>(undefined);

  useEffect(() => {
    allPagesRef.current = allPages;
    setLocalDataRef.current = setLocalData;
    manifestRef.current = publication.manifest;
  }, [allPages, publication.manifest, setLocalData]);

  const storedPosition = useMemo(() => {
    if (isComicArchivePosition(localData)) {
      const index = allPages.findIndex(
        (page) =>
          page.archive?.chapterIndex === localData.chapterIndex &&
          normalizeHref(page.archive.pageHref) === normalizeHref(localData.pageHref)
      );
      return index >= 0 ? index : undefined;
    }
    if (!localData?.href) return undefined;
    const normalizedHref = normalizeHref(localData.href);
    const index = allPages.findIndex((page) => normalizeHref(page.href) === normalizedHref);
    return index >= 0 ? index : undefined;
  }, [allPages, localData]);
  const chapterSegments = useMemo(
    () => (isArchiveSeries ? buildSeriesSegments(archiveChapters, allPages) : buildComicChapterSegments(publication, allPages)),
    [archiveChapters, allPages, isArchiveSeries, publication]
  );
  const chapterModeActive =
    merged.comicChapterBoundaries &&
    (isArchiveSeries ? archiveChapters.length >= 2 : hasMultiChapterStructure(chapterSegments));
  const isScrollMode =
    merged.readingMode === ComicReadingMode.continuousVertical ||
    merged.readingMode === ComicReadingMode.continuousHorizontal ||
    merged.readingMode === ComicReadingMode.webtoon;

  const persistComicPosition = useCallback(
    (index: number) => {
      if (!activeKey) return;
      const page = allPagesRef.current[index];
      if (!page?.link) return;
      if (page.archive) {
        const directoryLocator = manifestRef.current?.locatorFromLink(new Link({ href: page.archive.chapterHref }));
        const fileLocator = new Link({
          href: page.archive.pageHref,
          type: page.link.type,
          title: page.link.title || page.title,
        }).locator.copyWithLocations({
          progression: 0,
          position: page.archive.pageIndexInChapter + 1,
        });
        setLocalDataRef.current(
          makeComicArchivePosition(page.archive, page.href, {
            locator: directoryLocator ?? fileLocator,
            archiveLocator: directoryLocator,
            directoryLocator,
            fileLocator,
          }) as any
        );
        dispatch(updateComicPosition({ key: activeKey, pageIndex: index }));
        return;
      }
      const locator = manifestRef.current?.locatorFromLink(page.link);
      if (locator) {
        setLocalDataRef.current(locator);
      }
      dispatch(updateComicPosition({ key: activeKey, pageIndex: index }));
    },
    [activeKey, dispatch]
  );

  const {
    mode,
    direction,
    scaleType,
    step,
    cursorIndex,
    setCursorIndex,
    canGoPrev,
    canGoNext,
    goPrev,
    goNext,
    activeSegment,
    segmentIndex,
    hasNextChapter,
    hasPrevChapter,
    goNextChapter,
    goPrevChapter,
  } = useComicReaderController({
    pages: allPages,
    settings: merged,
    savedPosition: storedPosition ?? savedPosition,
    onPersistPosition: persistComicPosition,
    chapterSegments,
    chapterBoundariesEnabled: merged.comicChapterBoundaries,
  });

  useEffect(() => {
    currentArchiveIdentityRef.current = allPages[cursorIndex]?.archive;
  }, [allPages, cursorIndex]);

  useEffect(() => {
    if (!isArchiveSeries) return;
    const identity = currentArchiveIdentityRef.current;
    if (!identity) return;
    const nextIndex = allPages.findIndex(
      (page) =>
        page.archive?.chapterIndex === identity.chapterIndex &&
        page.archive.pageIndexInChapter === identity.pageIndexInChapter
    );
    if (nextIndex < 0) return;
    setCursorIndex((prev) => (prev === nextIndex ? prev : nextIndex));
  }, [allPages, isArchiveSeries, setCursorIndex]);

  const viewportPages = useMemo(() => {
    if (!chapterModeActive) return allPages;
    const seg = getSegmentForPageIndex(chapterSegments, cursorIndex);
    if (!seg) return allPages;
    return allPages.slice(seg.startIndex, seg.endIndex + 1);
  }, [allPages, chapterModeActive, chapterSegments, cursorIndex]);

  const viewportChapterKey = useMemo(() => {
    if (!chapterModeActive) return "all";
    const seg = getSegmentForPageIndex(chapterSegments, cursorIndex);
    return seg ? `${seg.startIndex}:${seg.endIndex}` : "all";
  }, [chapterModeActive, chapterSegments, cursorIndex]);

  useEffect(() => {
    if (!isArchiveSeries) return;
    const page = allPages[cursorIndex];
    const chapterIndex = page?.archive?.chapterIndex ?? initialArchiveChapterIndex;
    if (chapterIndex > 0) loadChapter(chapterIndex - 1).catch(() => undefined);
    if (chapterIndex < archiveChapters.length - 1) loadChapter(chapterIndex + 1).catch(() => undefined);
  }, [allPages, archiveChapters.length, cursorIndex, initialArchiveChapterIndex, isArchiveSeries, loadChapter]);

  const progressChapterSegment = useMemo(() => {
    if (!chapterModeActive) return undefined;
    return getSegmentForPageIndex(chapterSegments, cursorIndex);
  }, [chapterModeActive, chapterSegments, cursorIndex]);

  const chapterPageCount =
    progressChapterSegment !== undefined
      ? progressChapterSegment.endIndex - progressChapterSegment.startIndex + 1
      : allPages.length;

  const progressCurrentPage = useMemo(() => {
    if (progressChapterSegment) {
      return Math.min(cursorIndex - progressChapterSegment.startIndex + 1, chapterPageCount);
    }
    return Math.min(cursorIndex + 1, allPages.length);
  }, [allPages.length, chapterPageCount, cursorIndex, progressChapterSegment]);

  const showNextChapterCta = false;
  const showPrevChapterCta = false;

  const nextChapterTitle = useMemo(() => {
    if (!chapterModeActive || segmentIndex < 0 || segmentIndex >= chapterSegments.length - 1) return undefined;
    return chapterSegments[segmentIndex + 1]?.title;
  }, [chapterModeActive, chapterSegments, segmentIndex]);

  const prevChapterTitle = useMemo(() => {
    if (!chapterModeActive || segmentIndex <= 0) return undefined;
    return chapterSegments[segmentIndex - 1]?.title;
  }, [chapterModeActive, chapterSegments, segmentIndex]);

  const currentChapterTitle = activeSegment?.title;

  const scrollBoundaryPages = useMemo(
    () => ({
      previous:
        isScrollMode &&
        chapterModeActive &&
        activeSegment &&
        hasPrevChapter &&
        isAtFirstNavigablePositionInSegment(cursorIndex, activeSegment, step)
          ? {
              currentTitle: currentChapterTitle,
              adjacentTitle: prevChapterTitle,
            }
          : undefined,
      next:
        isScrollMode &&
        chapterModeActive &&
        activeSegment &&
        hasNextChapter &&
        isAtLastNavigablePositionInSegment(cursorIndex, activeSegment, step)
          ? {
              currentTitle: currentChapterTitle,
              adjacentTitle: nextChapterTitle,
            }
          : undefined,
    }),
    [
      activeSegment,
      chapterModeActive,
      currentChapterTitle,
      cursorIndex,
      hasNextChapter,
      hasPrevChapter,
      isScrollMode,
      nextChapterTitle,
      prevChapterTitle,
      step,
    ]
  );

  useEffect(() => {
    if (activeBoundaryPage === "prev" && !scrollBoundaryPages.previous) {
      setActiveBoundaryPage(null);
    }
    if (activeBoundaryPage === "next" && !scrollBoundaryPages.next) {
      setActiveBoundaryPage(null);
    }
  }, [activeBoundaryPage, scrollBoundaryPages.next, scrollBoundaryPages.previous]);

  useLayoutEffect(() => {
    comicNavigator.bind({
      publication,
      links: allPages.map((p) => p.link),
      cursorIndex,
      setCursorIndex,
      step,
      onMissingLink: async (link) => {
        if (!isArchiveSeries) return false;
        const chapterIndex = archiveChapters.findIndex((chapter) => normalizeHref(chapter.href) === normalizeHref(link.href));
        if (chapterIndex < 0) return false;
        const ok = await loadChapter(chapterIndex);
        if (!ok) return false;
        const target = allPagesRef.current.find((page) => page.archive?.chapterIndex === chapterIndex);
        if (!target) return false;
        setCursorIndex(target.index);
        return true;
      },
    });
  }, [archiveChapters, comicNavigator, isArchiveSeries, loadChapter, publication, allPages, cursorIndex, setCursorIndex, step]);

  const pageTocTree = useMemo(() => buildComicTocTree(publication, allPages), [publication, allPages]);
  const chapterTocTree = useMemo(() => {
    if (isArchiveSeries) {
      let id = 0;
      const idGenerator = () => `toc-${++id}`;
      return buildTocTree(archiveChapters.map(makeChapterTocLink), idGenerator, undefined, undefined);
    }
    if (!hasMultiChapterStructure(chapterSegments)) return [];
    return buildComicChapterTocTree(chapterSegments, allPages);
  }, [archiveChapters, chapterSegments, allPages, isArchiveSeries]);
  const tocTree = chapterModeActive ? chapterTocTree : pageTocTree;
  const tocHighlightIndex = chapterModeActive
    ? isArchiveSeries
      ? allPages[cursorIndex]?.archive?.chapterIndex
      : getSegmentIndex(chapterSegments, cursorIndex)
    : undefined;

  useEffect(() => {
    dispatch(setTocTree(tocTree));
  }, [dispatch, tocTree]);

  useEffect(() => {
    const timelinePages = isArchiveSeries && chapterModeActive ? viewportPages : allPages;
    const timelineCursorIndex =
      isArchiveSeries && chapterModeActive
        ? Math.max(0, timelinePages.findIndex((page) => page.index === cursorIndex))
        : cursorIndex;
    const timeline = buildComicTimeline(publication, timelinePages, timelineCursorIndex, tocTree, tocHighlightIndex);
    dispatch(
      setTimeline({
        ...timeline,
        toc: {
          currentEntry: timeline.toc?.currentEntry,
        },
      })
    );
    if (chapterModeActive) {
      const seg = getSegmentForPageIndex(chapterSegments, cursorIndex);
      if (seg) {
        const si = getSegmentIndex(chapterSegments, cursorIndex);
        dispatch(
          setPublicationStart(si === 0 && !canRetreatWithinSegment(cursorIndex, seg, step))
        );
        dispatch(
          setPublicationEnd(
            si === chapterSegments.length - 1 &&
              !canAdvanceWithinSegment(cursorIndex, seg, step)
          )
        );
      } else {
        dispatch(setPublicationStart(cursorIndex <= 0));
        dispatch(setPublicationEnd(cursorIndex >= allPages.length - 1));
      }
    } else {
      dispatch(setPublicationStart(cursorIndex <= 0));
      dispatch(setPublicationEnd(cursorIndex >= allPages.length - 1));
    }
  }, [
    allPages,
    chapterModeActive,
    chapterSegments,
    cursorIndex,
    dispatch,
    isArchiveSeries,
    publication,
    step,
    tocHighlightIndex,
    tocTree,
    viewportPages,
  ]);

  const toggleMenu = useCallback(() => {
    dispatch(toggleImmersive());
    dispatch(setHovering(false));
  }, [dispatch]);

  const handleBoundaryPageChange = useCallback((nextBoundaryPage: "prev" | "next" | null) => {
    setActiveBoundaryPage((current) => (current === nextBoundaryPage ? current : nextBoundaryPage));
  }, []);

  const goNextFromBoundary = useCallback(() => {
    setActiveBoundaryPage(null);
    goNextChapter();
  }, [goNextChapter]);

  const goPrevFromBoundary = useCallback(() => {
    setActiveBoundaryPage(null);
    goPrevChapter();
  }, [goPrevChapter]);

  const handleNext = useCallback(() => {
    if (activeBoundaryPage === "next") {
      goNextFromBoundary();
      return;
    }
    if (scrollBoundaryPages.next) {
      if (boundaryScrollControlsRef.current?.scrollToBoundary("next")) {
        setActiveBoundaryPage("next");
      }
      return;
    }
    goNext();
  }, [activeBoundaryPage, goNext, goNextFromBoundary, scrollBoundaryPages.next]);

  const handlePrev = useCallback(() => {
    if (activeBoundaryPage === "prev") {
      goPrevFromBoundary();
      return;
    }
    if (scrollBoundaryPages.previous) {
      if (boundaryScrollControlsRef.current?.scrollToBoundary("prev")) {
        setActiveBoundaryPage("prev");
      }
      return;
    }
    goPrev();
  }, [activeBoundaryPage, goPrev, goPrevFromBoundary, scrollBoundaryPages.previous]);

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
    onPrev: handlePrev,
    onNext: handleNext,
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
    setPageLoadStates({});
  }, [viewportChapterKey]);

  const onPageLoadStateChange = useCallback((pageIndex: number, state: ComicPageLoadState) => {
    setPageLoadStates((prev) => {
      if (prev[pageIndex] === state) return prev;
      return { ...prev, [pageIndex]: state };
    });
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
      } else if (action === "next") handleNext();
      else handlePrev();
    },
    [
      direction,
      handleNext,
      handlePrev,
      merged.overlayMode,
      merged.tapZones,
      toggleMenu,
    ]
  );

  const showOverlay = merged.overlayMode === "pinned" || !isImmersive;
  const progressItems = useMemo(
    () =>
      buildComicProgressItems({
        pages: viewportPages,
        mode,
        direction,
        cursorIndex,
        pageLoadStates,
        progressLabelOffset: progressChapterSegment?.startIndex,
      }),
    [cursorIndex, direction, mode, pageLoadStates, progressChapterSegment?.startIndex, viewportPages]
  );

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
                  publication={publication}
                  pages={viewportPages}
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
                  onPageLoadStateChange={onPageLoadStateChange}
                  boundaryPages={scrollBoundaryPages}
                  onBoundaryPageChange={handleBoundaryPageChange}
                  boundaryScrollControlsRef={boundaryScrollControlsRef}
                />
                {chapterLoadError ? (
                  <div
                    role="status"
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 24,
                      transform: "translateX(-50%)",
                      maxWidth: "min(520px, calc(100% - 32px))",
                      padding: "10px 14px",
                      borderRadius: 6,
                      background: "rgba(20, 20, 20, 0.88)",
                      color: "#fff",
                      fontSize: 14,
                      lineHeight: 1.4,
                      zIndex: 30,
                    }}
                  >
                    {chapterLoadError}
                  </div>
                ) : null}
                <ComicReaderOverlay
                  mode={mode}
                  pageCount={chapterPageCount}
                  progressCurrentPage={progressCurrentPage}
                  progressItems={progressItems}
                  direction={direction}
                  canGoPrev={canGoPrev || !!scrollBoundaryPages.previous || activeBoundaryPage === "prev"}
                  canGoNext={canGoNext || !!scrollBoundaryPages.next || activeBoundaryPage === "next"}
                  onPrev={handlePrev}
                  onNext={handleNext}
                  onJumpTo={setCursorIndex}
                  settings={merged}
                  isVisible={showOverlay}
                  layoutUI={layoutUI}
                  showNextChapterCta={showNextChapterCta}
                  showPrevChapterCta={showPrevChapterCta}
                  nextChapterTitle={nextChapterTitle}
                  prevChapterTitle={prevChapterTitle}
                  onNextChapter={goNextChapter}
                  onPrevChapter={goPrevChapter}
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
