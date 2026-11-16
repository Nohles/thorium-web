"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@readium/shared";

import { ComicReadingMode, defaultComicSettings } from "@/lib/comicSettingsReducer";
import type { ComicArchivePageIdentity } from "../lib/comicArchiveSeries";
import {
  canAdvanceWithinSegment,
  canRetreatWithinSegment,
  type ComicChapterSegment,
  getSegmentIndex,
  hasMultiChapterStructure,
} from "../lib/comicChapters";
import {
  backwardSpreadStep,
  buildComicSpreads,
  type ComicSpreadLayout,
  forwardSpreadStep,
  comicSpreadHint,
  isStandaloneComicPage,
} from "../lib/comicSpreads";

export type ComicPage = {
  index: number;
  link: Link;
  href: string;
  title: string;
  archive?: ComicArchivePageIdentity;
};

export const getEffectiveReadingMode = (
  mode: ComicReadingMode,
  { isPortrait = false, doublePageInPortrait = true }: { isPortrait?: boolean; doublePageInPortrait?: boolean } = {}
): ComicReadingMode => {
  const effective = mode === ComicReadingMode.default ? ComicReadingMode.singlePage : mode;
  // Two pages side by side on an upright screen are too small to read.
  if (effective === ComicReadingMode.doublePage && isPortrait && !doublePageInPortrait) {
    return ComicReadingMode.singlePage;
  }
  return effective;
};

/** Pairs the pages for double-page mode; chapter starts come from the segments. */
export const buildSpreadLayout = (
  pages: ComicPage[],
  settings: Pick<typeof defaultComicSettings, "spreadCoverAlone" | "spreadShift">,
  chapterSegments: ComicChapterSegment[]
): ComicSpreadLayout =>
  buildComicSpreads(
    pages.map((page) => ({
      index: page.index,
      standalone: isStandaloneComicPage(page.link),
      hint: comicSpreadHint(page.link),
    })),
    {
      coverAlone: settings.spreadCoverAlone,
      shift: settings.spreadShift,
      chapterStarts: chapterSegments.map((segment) => segment.startIndex),
    }
  );

const isScrollReadingMode = (mode: ComicReadingMode): boolean =>
  mode === ComicReadingMode.continuousVertical ||
  mode === ComicReadingMode.continuousHorizontal ||
  mode === ComicReadingMode.webtoon;

export const useComicReaderController = ({
  pages,
  settings,
  savedPosition,
  onPersistPosition,
  chapterSegments,
  chapterBoundariesEnabled,
  isPortrait = false,
}: {
  pages: ComicPage[];
  settings: typeof defaultComicSettings;
  savedPosition?: number;
  onPersistPosition: (index: number) => void;
  chapterSegments: ComicChapterSegment[];
  chapterBoundariesEnabled: boolean;
  isPortrait?: boolean;
}) => {
  const mode = getEffectiveReadingMode(settings.readingMode, {
    isPortrait,
    doublePageInPortrait: settings.doublePageInPortrait,
  });
  const scaleType = settings.scaleType;
  const direction = settings.direction;
  const spreadLayout = useMemo(
    () =>
      mode === ComicReadingMode.doublePage
        ? buildSpreadLayout(
            pages,
            { spreadCoverAlone: settings.spreadCoverAlone, spreadShift: settings.spreadShift },
            chapterSegments
          )
        : null,
    [chapterSegments, mode, pages, settings.spreadCoverAlone, settings.spreadShift]
  );
  const forwardStepAt = useCallback(
    (index: number) => (spreadLayout ? forwardSpreadStep(spreadLayout, index) : 1),
    [spreadLayout]
  );
  const backwardStepAt = useCallback(
    (index: number) => (spreadLayout ? backwardSpreadStep(spreadLayout, index) : 1),
    [spreadLayout]
  );
  /** The first page of the spread holding `index`, so landing on a chapter's end shows its last spread whole. */
  const spreadStartAt = useCallback(
    (index: number) => {
      if (!spreadLayout) return index;
      const spreadIndex = spreadLayout.spreadIndexByPage.get(index);
      return spreadIndex === undefined ? index : (spreadLayout.spreads[spreadIndex]?.[0] ?? index);
    },
    [spreadLayout]
  );
  const usesScrollBoundaries = isScrollReadingMode(mode);

  const useChapterBounds =
    chapterBoundariesEnabled && hasMultiChapterStructure(chapterSegments);

  const segmentForCursor = useCallback(
    (cursor: number): ComicChapterSegment | null => {
      if (!useChapterBounds) return null;
      return chapterSegments.find((s) => cursor >= s.startIndex && cursor <= s.endIndex) ?? null;
    },
    [chapterSegments, useChapterBounds]
  );

  const initialIndex = useMemo(() => {
    if (typeof savedPosition === "number" && savedPosition >= 0 && savedPosition < pages.length) {
      return savedPosition;
    }
    return 0;
  }, [pages.length, savedPosition]);

  const [cursorIndex, setCursorIndex] = useState(initialIndex);
  const [initialPositionApplied, setInitialPositionApplied] = useState(
    typeof savedPosition === "number" && savedPosition >= 0 && savedPosition < pages.length
  );
  const skipInitialPersistRef = useRef(true);

  // A neighbour can arrive before the saved chapter. Restore before committing
  // its pages, so persistence never records a transient neighbouring cursor.
  const isRestoringPosition = !initialPositionApplied &&
    typeof savedPosition === "number" && savedPosition >= 0 && savedPosition < pages.length;
  if (isRestoringPosition) {
    setInitialPositionApplied(true);
    setCursorIndex(savedPosition);
  }

  useEffect(() => {
    if (skipInitialPersistRef.current) {
      skipInitialPersistRef.current = false;
      return;
    }
    onPersistPosition(cursorIndex);
  }, [cursorIndex, onPersistPosition]);

  const step = forwardStepAt(cursorIndex);
  const backStep = backwardStepAt(cursorIndex);
  const activeSeg = segmentForCursor(cursorIndex);
  const segmentIndex = useMemo(
    () => (useChapterBounds ? getSegmentIndex(chapterSegments, cursorIndex) : -1),
    [chapterSegments, cursorIndex, useChapterBounds]
  );

  const canGoPrev = useMemo(() => {
    if (pages.length === 0) return false;
    if (useChapterBounds && activeSeg) {
      return usesScrollBoundaries
        ? canRetreatWithinSegment(cursorIndex, activeSeg, backStep)
        : canRetreatWithinSegment(cursorIndex, activeSeg, backStep) || segmentIndex > 0;
    }
    return cursorIndex > 0;
  }, [activeSeg, backStep, cursorIndex, pages.length, segmentIndex, useChapterBounds, usesScrollBoundaries]);

  const canGoNext = useMemo(() => {
    if (pages.length === 0) return false;
    if (useChapterBounds && activeSeg) {
      return usesScrollBoundaries
        ? canAdvanceWithinSegment(cursorIndex, activeSeg, step)
        : canAdvanceWithinSegment(cursorIndex, activeSeg, step) || segmentIndex < chapterSegments.length - 1;
    }
    return cursorIndex + step <= pages.length - 1;
  }, [activeSeg, chapterSegments.length, cursorIndex, pages.length, segmentIndex, step, useChapterBounds, usesScrollBoundaries]);

  const goPrev = useCallback(() => {
    setCursorIndex((i) => {
      const seg = segmentForCursor(i);
      if (useChapterBounds && seg) {
        const back = backwardStepAt(i);
        if (!usesScrollBoundaries && !canRetreatWithinSegment(i, seg, back)) {
          const si = getSegmentIndex(chapterSegments, i);
          return si > 0 ? spreadStartAt(chapterSegments[si - 1]?.endIndex ?? i) : i;
        }
        return Math.max(seg.startIndex, i - back);
      }
      return Math.max(0, i - backwardStepAt(i));
    });
  }, [backwardStepAt, chapterSegments, segmentForCursor, spreadStartAt, useChapterBounds, usesScrollBoundaries]);

  const goNext = useCallback(() => {
    setCursorIndex((i) => {
      const seg = segmentForCursor(i);
      if (useChapterBounds && seg) {
        const forward = forwardStepAt(i);
        if (!usesScrollBoundaries && !canAdvanceWithinSegment(i, seg, forward)) {
          const si = getSegmentIndex(chapterSegments, i);
          return si >= 0 && si < chapterSegments.length - 1 ? (chapterSegments[si + 1]?.startIndex ?? i) : i;
        }
        return Math.min(seg.endIndex, i + forward);
      }
      const forward = forwardStepAt(i);
      return i + forward <= pages.length - 1 ? i + forward : i;
    });
  }, [chapterSegments, forwardStepAt, pages.length, segmentForCursor, useChapterBounds, usesScrollBoundaries]);

  const hasNextChapter = useMemo(
    () => useChapterBounds && segmentIndex >= 0 && segmentIndex < chapterSegments.length - 1,
    [chapterSegments.length, segmentIndex, useChapterBounds]
  );

  const hasPrevChapter = useMemo(
    () => useChapterBounds && segmentIndex > 0,
    [segmentIndex, useChapterBounds]
  );

  const goNextChapter = useCallback(() => {
    setCursorIndex((i) => {
      if (!useChapterBounds) return i;
      const si = getSegmentIndex(chapterSegments, i);
      if (si < 0 || si >= chapterSegments.length - 1) return i;
      return chapterSegments[si + 1]?.startIndex ?? i;
    });
  }, [chapterSegments, useChapterBounds]);

  const goPrevChapter = useCallback(() => {
    setCursorIndex((i) => {
      if (!useChapterBounds) return i;
      const si = getSegmentIndex(chapterSegments, i);
      if (si <= 0) return i;
      return spreadStartAt(chapterSegments[si - 1]?.endIndex ?? i);
    });
  }, [chapterSegments, spreadStartAt, useChapterBounds]);

  const progress = pages.length <= 1 ? 0 : Math.round((cursorIndex / (pages.length - 1)) * 100);

  return {
    mode,
    direction,
    scaleType,
    step,
    backStep,
    spreadLayout,
    cursorIndex,
    isRestoringPosition,
    setCursorIndex,
    canGoPrev,
    canGoNext,
    goPrev,
    goNext,
    progress,
    activeSegment: activeSeg,
    segmentIndex,
    hasNextChapter,
    hasPrevChapter,
    goNextChapter,
    goPrevChapter,
  };
};
