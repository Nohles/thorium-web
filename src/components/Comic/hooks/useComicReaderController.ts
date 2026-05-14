"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@readium/shared";

import { ComicReadingMode, defaultComicSettings } from "@/lib/comicSettingsReducer";
import {
  canAdvanceWithinSegment,
  canRetreatWithinSegment,
  type ComicChapterSegment,
  getSegmentIndex,
  hasMultiChapterStructure,
} from "../lib/comicChapters";

export type ComicPage = {
  index: number;
  link: Link;
  href: string;
  title: string;
};

export const getEffectiveReadingMode = (mode: ComicReadingMode): ComicReadingMode =>
  mode === ComicReadingMode.default ? ComicReadingMode.singlePage : mode;

export const useComicReaderController = ({
  pages,
  settings,
  savedPosition,
  onPersistPosition,
  chapterSegments,
  chapterBoundariesEnabled,
}: {
  pages: ComicPage[];
  settings: typeof defaultComicSettings;
  savedPosition?: number;
  onPersistPosition: (index: number) => void;
  chapterSegments: ComicChapterSegment[];
  chapterBoundariesEnabled: boolean;
}) => {
  const mode = getEffectiveReadingMode(settings.readingMode);
  const scaleType = settings.scaleType;
  const direction = settings.direction;
  const step = mode === ComicReadingMode.doublePage ? 2 : 1;

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

  useEffect(() => {
    setCursorIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    onPersistPosition(cursorIndex);
  }, [cursorIndex, onPersistPosition]);

  const activeSeg = segmentForCursor(cursorIndex);
  const segmentIndex = useMemo(
    () => (useChapterBounds ? getSegmentIndex(chapterSegments, cursorIndex) : -1),
    [chapterSegments, cursorIndex, useChapterBounds]
  );

  const canGoPrev = useMemo(() => {
    if (pages.length === 0) return false;
    if (useChapterBounds && activeSeg) {
      return canRetreatWithinSegment(cursorIndex, activeSeg, step);
    }
    return cursorIndex > 0;
  }, [activeSeg, cursorIndex, pages.length, step, useChapterBounds]);

  const canGoNext = useMemo(() => {
    if (pages.length === 0) return false;
    if (useChapterBounds && activeSeg) {
      return canAdvanceWithinSegment(cursorIndex, activeSeg, step);
    }
    return cursorIndex < pages.length - 1;
  }, [activeSeg, cursorIndex, pages.length, step, useChapterBounds]);

  const goPrev = useCallback(() => {
    setCursorIndex((i) => {
      const seg = segmentForCursor(i);
      if (useChapterBounds && seg) {
        return Math.max(seg.startIndex, i - step);
      }
      return Math.max(0, i - step);
    });
  }, [segmentForCursor, step, useChapterBounds]);

  const goNext = useCallback(() => {
    setCursorIndex((i) => {
      const seg = segmentForCursor(i);
      if (useChapterBounds && seg) {
        return Math.min(seg.endIndex, i + step);
      }
      return Math.min(pages.length - 1, i + step);
    });
  }, [pages.length, segmentForCursor, step, useChapterBounds]);

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
      return chapterSegments[si - 1]?.endIndex ?? i;
    });
  }, [chapterSegments, useChapterBounds]);

  const progress = pages.length <= 1 ? 0 : Math.round((cursorIndex / (pages.length - 1)) * 100);

  return {
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
    progress,
    activeSegment: activeSeg,
    segmentIndex,
    hasNextChapter,
    hasPrevChapter,
    goNextChapter,
    goPrevChapter,
  };
};
