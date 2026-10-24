"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { Link, Manifest, Publication, ReadingProgression } from "@readium/shared";

import readerStyles from "../assets/styles/thorium-web.reader.app.module.css";
import arrowStyles from "../assets/styles/thorium-web.reader.paginatedArrow.module.css";
import comicStyles from "./assets/styles/thorium-web.comic.module.css";

import { NavigatorProvider } from "@/core/Navigator";
import { useComicNavigator } from "@/core/Hooks/Comic/useComicNavigator";
import { StatefulReaderProps } from "../Reader/StatefulReaderWrapper";
import { StatefulDockingWrapper } from "../Docking/StatefulDockingWrapper";
import { StatefulReaderHeader } from "../StatefulReaderHeader";
import { StatefulReaderFooter } from "../StatefulReaderFooter";
import { StatefulReaderArrowButton } from "../StatefulReaderArrowButton";
import { getReaderClassNames } from "../Helpers/getReaderClassNames";
import { ThActionsKeys, ThComicShortcutKeys, ThDockingKeys, ThLayoutUI, ThProgressionFormat } from "@/preferences/models";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  ComicReadingDirection,
  ComicReadingMode,
  ComicScaleType,
  ComicTapZones,
  initComicSettings,
  setComicActiveKey,
} from "@/lib/comicSettingsReducer";
import { updateComicPosition } from "@/lib/comicPositionReducer";
import {
  setDirection,
  setFullscreen,
  setHovering,
  setLoading,
  setPlatformModifier,
  setUserNavigated,
  toggleImmersive,
} from "@/lib/readerReducer";
import { dockAction, toggleActionOpen } from "@/lib/actionsReducer";
import {
  fromActionPeripheralType,
  fromComicPeripheralType,
  fromDockingPeripheralType,
  NavPeripheralType,
} from "@/helpers/peripherals";
import { useFullscreen } from "@/core/Hooks/useFullscreen";
import { useFocusedDockableKey } from "../Docking/hooks/useFocusedDockableKey";
import {
  setAdjacentTimelineItems,
  setProgress,
  setPublicationEnd,
  setPublicationStart,
  setRTL,
  setTocEntry,
  setTocTree,
} from "@/lib/publicationReducer";
import { ThPluginRegistry } from "../Plugins/PluginRegistry";
import { ThPluginProvider } from "../Plugins/PluginProvider";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { ComicReaderProgress } from "./components/ComicReaderProgress";
import { ComicReaderViewport, type ComicBoundaryScrollControls } from "./components/ComicReaderViewport";
import { useComicSettings } from "./hooks/useComicSettings";
import { useComicKeyboardShortcuts } from "./hooks/useComicKeyboardShortcuts";
import { useComicKeyboardPeripherals } from "./hooks/useComicKeyboardPeripherals";
import { resolveTapAction } from "./hooks/useComicTapNavigation";
import { ComicPage, useComicReaderController } from "./hooks/useComicReaderController";
import {
  buildComicChapterTocTree,
  buildComicTimeline,
  buildComicTocTree,
  buildComicTocTreeFromLinks,
} from "./buildComicTimeline";
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
  readComicPositionListDocument,
  readManifestFromUrl,
  resolveChapterResourceHref,
  type ComicArchiveChapter,
  type ComicArchivePageIdentity,
} from "./lib/comicArchiveSeries";
import { type ComicLabels, useComicLabels } from "./lib/comicLabels";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useI18n } from "@/i18n/useI18n";
import { useLocale } from "react-aria";
import { useReaderDocumentTitle } from "@/hooks/useReaderDocumentTitle";
import { getPlatformModifier } from "@/core/Helpers/keyboardUtilities";
import { ThLayoutDirection } from "@/preferences/models";
import { usePositionStorage } from "@/hooks/usePositionStorage";
import { useReaderNavigation } from "../Reader/ReaderNavigationContext";

const getReadingOrderImages = (publication: Publication, labels: ComicLabels): ComicPage[] => {
  const items = publication.readingOrder?.items ?? [];
  return items
    .filter((item) => !item.templated)
    .filter((item) => typeof item.type === "string" && item.type.startsWith("image/"))
    .map((link, index) => ({ index, link, href: link.href, title: link.title || labels.page(index + 1) }));
};

const getManifestSelfHref = (publication: Publication): string | undefined => {
  const self = publication.manifest.links?.items?.find((link) => link.rels?.has("self"));
  return self?.href || publication.baseURL;
};

const getChapterImages = (
  chapter: ComicArchiveChapter,
  manifest: Manifest,
  manifestUrl: string,
  startIndex: number,
  labels: ComicLabels
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
        title: link.title || labels.chapterPage(chapter.title, pageIndexInChapter + 1),
        // Preserve probed pixel dimensions so placeholders can reserve the
        // eventual page height without decoding the image first.
        ...(link.width && link.width > 0 ? { width: link.width } : null),
        ...(link.height && link.height > 0 ? { height: link.height } : null),
      });
      const index = startIndex + pageIndexInChapter;
      return {
        index,
        link: pageLink,
        href,
        title: pageLink.title || labels.page(index + 1),
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

const normalizeComparableHref = (href: string) => {
  try {
    return decodeURIComponent(normalizeHref(href)).replace(/^\/+/, "");
  } catch {
    return normalizeHref(href).replace(/^\/+/, "");
  }
};

const stripChapterHrefFromLocatorHref = (href: string, chapterHref: string): string | null => {
  const normalizedHref = normalizeComparableHref(href);
  const normalizedChapter = normalizeComparableHref(chapterHref);
  if (normalizedHref === normalizedChapter) return "";
  const prefix = `${normalizedChapter}/`;
  return normalizedHref.startsWith(prefix) ? normalizedHref.slice(prefix.length) : null;
};

const getArchiveIdentityFromLocatorHref = (
  href: string | undefined,
  chapters: ComicArchiveChapter[]
): { chapterIndex: number; pageHref: string } | undefined => {
  if (!href) return undefined;

  for (const chapter of chapters) {
    const pageHref = stripChapterHrefFromLocatorHref(href, chapter.href);
    if (pageHref !== null) {
      return {
        chapterIndex: chapter.index,
        pageHref,
      };
    }
  }

  return undefined;
};

const getChapterIndexFromHint = (value: unknown, chapters: ComicArchiveChapter[]): number | undefined => {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value === 0) return 0;
    if (value >= 1 && value <= chapters.length) return value - 1;
  }

  if (typeof value === "string") {
    const index = chapters.findIndex((chapter) => normalizeComparableHref(chapter.href) === normalizeComparableHref(value));
    return index >= 0 ? index : undefined;
  }

  if (!value || typeof value !== "object") return undefined;
  const record = value as {
    href?: unknown;
    position?: unknown;
    locations?: { position?: unknown };
  };

  const position = record.locations?.position ?? record.position;
  if (typeof position === "number" && Number.isInteger(position) && position >= 1 && position <= chapters.length) {
    return position - 1;
  }

  return typeof record.href === "string" ? getChapterIndexFromHint(record.href, chapters) : undefined;
};

const getArchiveIdentityFromCurrentChapter = (
  value: unknown,
  chapters: ComicArchiveChapter[]
): Pick<ComicArchivePageIdentity, "chapterIndex" | "pageIndexInChapter" | "pageHref"> | null => {
  const chapterIndex = getChapterIndexFromHint(value, chapters);
  if (chapterIndex === undefined) return null;
  return {
    chapterIndex,
    pageIndexInChapter: 0,
    pageHref: "",
  };
};

const findArchivePageInPages = (
  pages: ComicPage[],
  identity: Pick<ComicArchivePageIdentity, "chapterIndex" | "pageIndexInChapter" | "pageHref">
): number =>
  pages.findIndex(
    (page) =>
      page.archive?.chapterIndex === identity.chapterIndex &&
      (page.archive.pageIndexInChapter === identity.pageIndexInChapter ||
        (identity.pageHref &&
          normalizeComparableHref(page.archive.pageHref) === normalizeComparableHref(identity.pageHref)))
  );

const StatefulComicReaderInner = ({ publication, localDataKey, positionStorage }: StatefulReaderProps) => {
  const { preferences } = usePreferences();
  const { t } = useI18n();
  const { direction: uiDirection } = useLocale();
  const labels = useComicLabels();
  const { publicationHref, homeHref, continueElsewhere } = useReaderNavigation();
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boundaryScrollControlsRef = useRef<ComicBoundaryScrollControls | null>(null);
  const [pageLoadStates, setPageLoadStates] = useState<Record<number, ComicPageLoadState>>({});
  const [activeBoundaryPage, setActiveBoundaryPage] = useState<"prev" | "next" | null>(null);

  const comicNavigator = useComicNavigator();
  const getFocusedDockableKey = useFocusedDockableKey();
  const onFullscreenChange = useCallback(
    (isFullscreen: boolean) => {
      dispatch(setFullscreen(isFullscreen));
    },
    [dispatch]
  );
  const { handleFullscreen } = useFullscreen(onFullscreenChange);

  const activeKey = useMemo(
    () => localDataKey ?? (publication.baseURL ? `${publication.baseURL}-comic-settings` : "comic:ephemeral"),
    [localDataKey, publication.baseURL]
  );
  const { settings: resolvedSettings, patch: updateSettings } = useComicSettings(activeKey);
  const hasOwnDirection = useAppSelector((s) => s.comicSettings.byKey[activeKey]?.direction !== undefined);
  const manifestDirection =
    publication.metadata.effectiveReadingProgression === ReadingProgression.rtl
      ? ComicReadingDirection.rtl
      : ComicReadingDirection.ltr;
  const savedComicPosition = useAppSelector((s) => (activeKey ? s.comicPosition.byKey[activeKey] : undefined));
  const savedPosition = savedComicPosition?.pageIndex;
  const isImmersive = useAppSelector((s) => s.reader.isImmersive);
  const isHovering = useAppSelector((s) => s.reader.isHovering);
  const breakpoint = useAppSelector((s) => s.theming.breakpoint);
  const profile = useAppSelector((s) => s.reader.profile);
  const actionsMap = useAppSelector((s) => (profile ? s.actions.keys[profile] : undefined));
  // Until the publication is seeded, follow its manifest so RTL comics never flash LTR.
  const merged = useMemo(
    () => (hasOwnDirection ? resolvedSettings : { ...resolvedSettings, direction: manifestDirection }),
    [hasOwnDirection, manifestDirection, resolvedSettings]
  );

  /** Transient sheets (TOC popover/modal/etc.) sit over the viewport; docked panels do not. */
  const hasTransientActionOpen = useMemo(
    () =>
      Object.values(actionsMap ?? {}).some((value) => {
        if (!value?.isOpen) return false;
        return value.docking === ThDockingKeys.transient || value.docking == null;
      }),
    [actionsMap]
  );
  const hadTransientActionOpenRef = useRef(false);
  const suppressTapsUntilRef = useRef(0);
  useEffect(() => {
    if (hasTransientActionOpen) {
      hadTransientActionOpenRef.current = true;
      return;
    }
    if (hadTransientActionOpenRef.current) {
      hadTransientActionOpenRef.current = false;
      // Absorb ghost clicks that land on the page after a sheet unmounts mid-gesture.
      suppressTapsUntilRef.current = performance.now() + 400;
    }
  }, [hasTransientActionOpen]);

  const layoutUI = preferences.theming.layout.ui?.fxl ?? ThLayoutUI.layered;

  const manifestSelfHref = useMemo(() => getManifestSelfHref(publication), [publication]);
  const isArchiveSeries = useMemo(() => isComicArchiveSeriesManifest(publication.manifest), [publication.manifest]);
  const archiveChapters = useMemo(
    () =>
      isArchiveSeries && manifestSelfHref
        ? buildComicArchiveChapters(publication.manifest, manifestSelfHref, labels)
        : [],
    [isArchiveSeries, labels, manifestSelfHref, publication.manifest]
  );
  const [chapterManifests, setChapterManifests] = useState<Record<number, { manifest: Manifest; manifestUrl: string }>>({});
  const chapterManifestPromisesRef = useRef<Partial<Record<number, Promise<boolean>>>>({});
  const [chapterLoadError, setChapterLoadError] = useState<{
    chapterIndex: number;
    reason: "failed" | "undiscoverable";
  } | null>(null);
  const { setLocalData, localData } = usePositionStorage(localDataKey, positionStorage);
  const [manifestCurrentChapterIdentity, setManifestCurrentChapterIdentity] = useState<Pick<
    ComicArchivePageIdentity,
    "chapterIndex" | "pageIndexInChapter" | "pageHref"
  > | null>(null);

  const locatorArchiveIdentity = useMemo(
    () =>
      isComicArchivePosition(localData)
        ? undefined
        : getArchiveIdentityFromLocatorHref(localData?.href, archiveChapters),
    [archiveChapters, localData]
  );

  const restoreArchiveIdentity = useMemo((): Pick<
    ComicArchivePageIdentity,
    "chapterIndex" | "pageIndexInChapter" | "pageHref"
  > | null => {
    if (isComicArchivePosition(localData)) {
      return {
        chapterIndex: localData.chapterIndex,
        pageIndexInChapter: localData.pageIndexInChapter,
        pageHref: localData.pageHref,
      };
    }
    if (locatorArchiveIdentity) {
      return {
        chapterIndex: locatorArchiveIdentity.chapterIndex,
        pageIndexInChapter: 0,
        pageHref: locatorArchiveIdentity.pageHref,
      };
    }
    if (typeof savedComicPosition?.chapterIndex === "number") {
      return {
        chapterIndex: savedComicPosition.chapterIndex,
        pageIndexInChapter: savedComicPosition.pageIndexInChapter ?? 0,
        pageHref: savedComicPosition.pageHref ?? "",
      };
    }
    if (manifestCurrentChapterIdentity) {
      return manifestCurrentChapterIdentity;
    }
    return null;
  }, [localData, locatorArchiveIdentity, manifestCurrentChapterIdentity, savedComicPosition]);

  useEffect(() => {
    if (!isArchiveSeries || archiveChapters.length === 0) {
      setManifestCurrentChapterIdentity(null);
      return;
    }

    let cancelled = false;
    readComicPositionListDocument(publication)
      .then((document) => {
        if (cancelled) return;
        setManifestCurrentChapterIdentity(
          getArchiveIdentityFromCurrentChapter(document?.currentChapter, archiveChapters)
        );
      })
      .catch(() => {
        if (!cancelled) setManifestCurrentChapterIdentity(null);
      });

    return () => {
      cancelled = true;
    };
  }, [archiveChapters, isArchiveSeries, publication]);

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
        setChapterLoadError({ chapterIndex, reason: "undiscoverable" });
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
        .catch(() => {
          setChapterLoadError({ chapterIndex, reason: "failed" });
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
    if (restoreArchiveIdentity) {
      return restoreArchiveIdentity.chapterIndex;
    }
    return 0;
  }, [restoreArchiveIdentity]);

  useEffect(() => {
    if (!isArchiveSeries || archiveChapters.length === 0) return;
    loadChapter(initialArchiveChapterIndex).catch(() => undefined);
  }, [archiveChapters.length, initialArchiveChapterIndex, isArchiveSeries, loadChapter]);

  const allPages = useMemo(() => {
    if (!isArchiveSeries) return getReadingOrderImages(publication, labels);
    let startIndex = 0;
    const pages: ComicPage[] = [];
    for (const chapter of archiveChapters) {
      const loaded = chapterManifests[chapter.index];
      if (!loaded) continue;
      const chapterPages = getChapterImages(chapter, loaded.manifest, loaded.manifestUrl, startIndex, labels);
      pages.push(...chapterPages);
      startIndex += chapterPages.length;
    }
    return pages;
  }, [archiveChapters, chapterManifests, isArchiveSeries, labels, publication]);
  const allPagesRef = useRef(allPages);
  const setLocalDataRef = useRef(setLocalData);
  const manifestRef = useRef(publication.manifest);
  const currentArchiveIdentityRef = useRef<ComicPage["archive"] | undefined>(undefined);
  const restoreCompleteRef = useRef(!isArchiveSeries || !restoreArchiveIdentity);

  useEffect(() => {
    allPagesRef.current = allPages;
    setLocalDataRef.current = setLocalData;
    manifestRef.current = publication.manifest;
  }, [allPages, publication.manifest, setLocalData]);

  const storedPosition = useMemo(() => {
    if (restoreArchiveIdentity) {
      const index = findArchivePageInPages(allPages, restoreArchiveIdentity);
      return index >= 0 ? index : undefined;
    }
    if (!localData?.href) return undefined;
    const normalizedHref = normalizeHref(localData.href);
    const index = allPages.findIndex((page) => normalizeHref(page.href) === normalizedHref);
    return index >= 0 ? index : undefined;
  }, [allPages, localData, restoreArchiveIdentity]);
  const chapterSegments = useMemo(
    () =>
      isArchiveSeries
        ? buildSeriesSegments(archiveChapters, allPages)
        : buildComicChapterSegments(publication, allPages, labels),
    [archiveChapters, allPages, isArchiveSeries, labels, publication]
  );
  const chapterTocActive =
    merged.comicChapterBoundaries &&
    (isArchiveSeries ? archiveChapters.length > 0 : hasMultiChapterStructure(chapterSegments));
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
        dispatch(
          updateComicPosition({
            key: activeKey,
            pageIndex: index,
            chapterIndex: page.archive.chapterIndex,
            pageIndexInChapter: page.archive.pageIndexInChapter,
            pageHref: page.archive.pageHref,
          })
        );
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
    savedPosition:
      isArchiveSeries && restoreArchiveIdentity && storedPosition === undefined
        ? undefined
        : storedPosition ?? savedPosition,
    onPersistPosition: persistComicPosition,
    chapterSegments,
    chapterBoundariesEnabled: merged.comicChapterBoundaries,
  });

  useEffect(() => {
    if (!isArchiveSeries) {
      restoreCompleteRef.current = true;
      return;
    }
    if (!restoreArchiveIdentity) {
      restoreCompleteRef.current = true;
      return;
    }
    restoreCompleteRef.current =
      typeof storedPosition === "number" && cursorIndex === storedPosition;
  }, [cursorIndex, isArchiveSeries, restoreArchiveIdentity, storedPosition]);

  useEffect(() => {
    if (typeof storedPosition !== "number") return;
    setCursorIndex((prev) => (prev === storedPosition ? prev : storedPosition));
  }, [storedPosition, setCursorIndex]);

  useEffect(() => {
    currentArchiveIdentityRef.current = allPages[cursorIndex]?.archive;
  }, [allPages, cursorIndex]);

  useEffect(() => {
    if (!isArchiveSeries || !restoreCompleteRef.current) return;
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


  const nextChapterTitle = useMemo(() => {
    if (!chapterModeActive || segmentIndex < 0 || segmentIndex >= chapterSegments.length - 1) return undefined;
    return chapterSegments[segmentIndex + 1]?.title;
  }, [chapterModeActive, chapterSegments, segmentIndex]);

  const prevChapterTitle = useMemo(() => {
    if (!chapterModeActive || segmentIndex <= 0) return undefined;
    return chapterSegments[segmentIndex - 1]?.title;
  }, [chapterModeActive, chapterSegments, segmentIndex]);

  const currentChapterTitle = activeSegment?.title;

  useReaderDocumentTitle({
    title: publication.metadata.title.getTranslation(),
    chapter: currentChapterTitle ?? allPages[cursorIndex]?.title,
  });

  const scrollBoundaryPages = useMemo(
    () => {
      const atLastInSegment =
        !!activeSegment && isAtLastNavigablePositionInSegment(cursorIndex, activeSegment, step);
      const showNextChapter =
        isScrollMode &&
        chapterModeActive &&
        activeSegment &&
        hasNextChapter &&
        atLastInSegment;
      const showEndOfReadable =
        isScrollMode &&
        chapterModeActive &&
        activeSegment &&
        !hasNextChapter &&
        atLastInSegment &&
        (!!publicationHref || !!homeHref || !!continueElsewhere);

      return {
        previous:
          isScrollMode &&
          chapterModeActive &&
          activeSegment &&
          hasPrevChapter &&
          isAtFirstNavigablePositionInSegment(cursorIndex, activeSegment, step)
            ? {
                currentTitle: currentChapterTitle,
                adjacentTitle: prevChapterTitle,
                onNavigate: goPrevChapter,
              }
            : undefined,
        next: showNextChapter
          ? {
              currentTitle: currentChapterTitle,
              adjacentTitle: nextChapterTitle,
              onNavigate: goNextChapter,
            }
          : showEndOfReadable
            ? {
                currentTitle: currentChapterTitle,
                mediaHref: publicationHref,
                homeHref,
                continueElsewhere,
              }
            : undefined,
      };
    },
    [
      activeSegment,
      chapterModeActive,
      continueElsewhere,
      currentChapterTitle,
      cursorIndex,
      hasNextChapter,
      hasPrevChapter,
      homeHref,
      isScrollMode,
      goNextChapter,
      goPrevChapter,
      nextChapterTitle,
      prevChapterTitle,
      publicationHref,
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
      return buildComicTocTreeFromLinks(archiveChapters.map(makeChapterTocLink), idGenerator);
    }
    if (!hasMultiChapterStructure(chapterSegments)) return [];
    return buildComicChapterTocTree(chapterSegments, allPages);
  }, [archiveChapters, chapterSegments, allPages, isArchiveSeries]);
  const tocTree = chapterTocActive ? chapterTocTree : pageTocTree;
  const tocHighlightIndex = chapterTocActive
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
    dispatch(setProgress(timeline.progress));
    dispatch(setTocEntry(timeline.currentEntry));
    dispatch(setAdjacentTimelineItems(timeline.adjacentItems));
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
    if (
      mode === ComicReadingMode.webtoon &&
      boundaryScrollControlsRef.current?.scrollByViewport("next", merged.scrollAmountPercent)
    ) {
      return;
    }
    if (activeBoundaryPage === "next") {
      if (scrollBoundaryPages.next?.onNavigate) {
        goNextFromBoundary();
      }
      return;
    }
    if (scrollBoundaryPages.next) {
      if (boundaryScrollControlsRef.current?.scrollToBoundary("next")) {
        setActiveBoundaryPage("next");
      }
      return;
    }
    goNext();
  }, [activeBoundaryPage, goNext, goNextFromBoundary, merged.scrollAmountPercent, mode, scrollBoundaryPages.next]);

  const handlePrev = useCallback(() => {
    if (
      mode === ComicReadingMode.webtoon &&
      boundaryScrollControlsRef.current?.scrollByViewport("prev", merged.scrollAmountPercent)
    ) {
      return;
    }
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
  }, [activeBoundaryPage, goPrev, goPrevFromBoundary, merged.scrollAmountPercent, mode, scrollBoundaryPages.previous]);

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

  const keyboardPeripherals = useComicKeyboardPeripherals({ isPaged: !isScrollMode });

  const handlePeripheral = useCallback(
    (type: string) => {
      const isRtl = direction === ComicReadingDirection.rtl;
      const goLeft = isRtl ? handleNext : handlePrev;
      const goRight = isRtl ? handlePrev : handleNext;
      const navigate = (go: () => void) => {
        dispatch(setUserNavigated(true));
        go();
      };

      switch (type) {
        case NavPeripheralType.moveLeft:         navigate(goLeft);     return;
        case NavPeripheralType.moveRight:        navigate(goRight);    return;
        case NavPeripheralType.progressForward:
        case NavPeripheralType.moveDown:         navigate(handleNext); return;
        case NavPeripheralType.progressBackward:
        case NavPeripheralType.moveUp:           navigate(handlePrev); return;
        case NavPeripheralType.moveHome:
          navigate(() => {
            const first = viewportPages[0];
            if (first) setCursorIndex(first.index);
          });
          return;
        case NavPeripheralType.moveEnd:
          navigate(() => {
            const last = viewportPages[viewportPages.length - 1];
            if (last) setCursorIndex(Math.max(viewportPages[0]?.index ?? 0, last.index - (step - 1)));
          });
          return;
      }

      switch (fromComicPeripheralType(type)) {
        case ThComicShortcutKeys.pageLeft:         navigate(goLeft);  return;
        case ThComicShortcutKeys.pageRight:        navigate(goRight); return;
        case ThComicShortcutKeys.toggleMenu:       toggleMenu();       return;
        case ThComicShortcutKeys.cycleScaleType:   cycleScaleType();   return;
        case ThComicShortcutKeys.cycleReadingMode: cycleReadingMode(); return;
        case ThComicShortcutKeys.toggleDirection:  cycleDirection();   return;
      }

      const actionKey = fromActionPeripheralType(type);
      if (actionKey === ThActionsKeys.fullscreen) {
        handleFullscreen();
        return;
      }
      if (actionKey && profile) {
        dispatch(toggleActionOpen({ key: actionKey, profile }));
        return;
      }

      const dockingKey = fromDockingPeripheralType(type);
      if (dockingKey && profile) {
        const dockableKey = getFocusedDockableKey(dockingKey as ThDockingKeys);
        if (dockableKey) {
          dispatch(dockAction({ key: dockableKey, dockingKey: dockingKey as ThDockingKeys, profile }));
        }
      }
    },
    [
      cycleDirection,
      cycleReadingMode,
      cycleScaleType,
      direction,
      dispatch,
      getFocusedDockableKey,
      handleFullscreen,
      handleNext,
      handlePrev,
      profile,
      setCursorIndex,
      step,
      toggleMenu,
      viewportPages,
    ]
  );

  useComicKeyboardShortcuts(keyboardPeripherals, handlePeripheral);

  useEffect(() => {
    // First open of a publication follows its declared reading progression (e.g. RTL manga).
    dispatch(initComicSettings({ key: activeKey, defaults: { direction: manifestDirection } }));
    dispatch(setComicActiveKey(activeKey));
  }, [activeKey, dispatch, manifestDirection]);

  // Same UI direction and shortcut modifier bookkeeping as the other readers.
  useLayoutEffect(() => {
    dispatch(setDirection(uiDirection as ThLayoutDirection));
    dispatch(setPlatformModifier(getPlatformModifier()));
  }, [dispatch, uiDirection]);

  // Shared chrome (arrow labels, pagination) reads the publication direction;
  // for comics that is the reader's chosen direction, not only the manifest's.
  useEffect(() => {
    dispatch(setRTL(direction === ComicReadingDirection.rtl));
  }, [dispatch, direction]);

  const retryChapterLoad = useCallback(() => {
    if (!chapterLoadError) return;
    setChapterLoadError(null);
    loadChapter(chapterLoadError.chapterIndex).catch(() => undefined);
  }, [chapterLoadError, loadChapter]);

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
      if (hasTransientActionOpen || performance.now() < suppressTapsUntilRef.current) return;
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
      hasTransientActionOpen,
      merged.overlayMode,
      merged.tapZones,
      toggleMenu,
    ]
  );

  const isRtl = direction === ComicReadingDirection.rtl;
  const canGoBackward = canGoPrev || !!scrollBoundaryPages.previous || activeBoundaryPage === "prev";
  const canGoForward = canGoNext || !!scrollBoundaryPages.next || activeBoundaryPage === "next";
  const navigateFromArrow = (go: () => void) => {
    dispatch(setUserNavigated(true));
    go();
  };

  // Hide edge nav while a sheet overlays the page so it can't steal TOC clicks.
  const showOverlay =
    (merged.overlayMode === "pinned" || !isImmersive) && !hasTransientActionOpen;
  // Like the other readers, edge arrows belong to paginated layouts; continuous modes scroll.
  const showArrows = showOverlay && !isScrollMode;
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
    <NavigatorProvider visualNavigator={comicNavigator} publication={publication}>
        <main className={classNames(readerStyles.main, comicStyles.main)}>
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

              {showArrows ? (
                <nav className={classNames(arrowStyles.container, arrowStyles.leftContainer)}>
                  <StatefulReaderArrowButton
                    direction="left"
                    isDisabled={isRtl ? !canGoForward : !canGoBackward}
                    onPress={() => navigateFromArrow(isRtl ? handleNext : handlePrev)}
                  />
                </nav>
              ) : null}

              <article
                className={classNames(readerStyles.wrapper, comicStyles.publication)}
                aria-label={t("reader.app.publicationWrapper")}
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
                {!isArchiveSeries && allPages.length === 0 ? (
                  <p role="status" className={comicStyles.statusMessage}>
                    {t("reader.comic.empty.noPages")}
                  </p>
                ) : null}
                {chapterLoadError ? (
                  <div role="alert" className={comicStyles.statusMessage}>
                    <p>
                      {chapterLoadError.reason === "undiscoverable"
                        ? t("reader.comic.chapterLoad.undiscoverable")
                        : t("reader.comic.chapterLoad.failed")}
                    </p>
                    {chapterLoadError.reason === "failed" ? (
                      <button
                        type="button"
                        className={comicStyles.actionButton}
                        data-size="compact"
                        onClick={retryChapterLoad}
                      >
                        {t("reader.comic.chapterLoad.retry")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={comicStyles.actionButton}
                      data-variant="secondary"
                      data-size="compact"
                      onClick={() => setChapterLoadError(null)}
                    >
                      {t("reader.comic.chapterLoad.dismiss")}
                    </button>
                  </div>
                ) : null}
                <ComicReaderProgress
                  mode={mode}
                  direction={direction}
                  settings={merged}
                  layoutUI={layoutUI}
                  isChromeVisible={showOverlay}
                  items={progressItems}
                  totalPages={chapterPageCount}
                  onJumpTo={setCursorIndex}
                />
                {merged.tapZonePreview ? (
                  <div aria-hidden className={comicStyles.tapZonePreview}>
                    {tapZonePreviewCells.map((cell) => (
                      <div key={`${cell.row}-${cell.col}`} className={comicStyles.tapZoneCell} data-action={cell.action} />
                    ))}
                  </div>
                ) : null}
              </article>

              {showArrows ? (
                <nav className={classNames(arrowStyles.container, arrowStyles.rightContainer)}>
                  <StatefulReaderArrowButton
                    direction="right"
                    isDisabled={isRtl ? !canGoBackward : !canGoForward}
                    onPress={() => navigateFromArrow(isRtl ? handlePrev : handleNext)}
                  />
                </nav>
              ) : null}

              <StatefulReaderFooter
                layout={layoutUI}
                publication={publication}
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
