"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ComicReadingMode, defaultComicSettings } from "@/lib/comicSettingsReducer";
import { Link } from "@readium/shared";

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
}: {
  pages: ComicPage[];
  settings: typeof defaultComicSettings;
  savedPosition?: number;
  onPersistPosition: (index: number) => void;
}) => {
  const mode = getEffectiveReadingMode(settings.readingMode);
  const scaleType = settings.scaleType;
  const direction = settings.direction;
  const step = mode === ComicReadingMode.doublePage ? 2 : 1;

  // Publication order is always 0 … n−1 (first page → last). Reading direction only affects
  // which controls/tap edges map to goPrev vs goNext (handled in overlay, keyboard, tap zones).
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

  const canGoPrev = useMemo(() => {
    if (pages.length === 0) return false;
    return cursorIndex > 0;
  }, [cursorIndex, pages.length]);

  const canGoNext = useMemo(() => {
    if (pages.length === 0) return false;
    return cursorIndex < pages.length - 1;
  }, [cursorIndex, pages.length]);

  const goPrev = useCallback(() => {
    setCursorIndex((i) => Math.max(0, i - step));
  }, [step]);

  const goNext = useCallback(() => {
    setCursorIndex((i) => Math.min(pages.length - 1, i + step));
  }, [pages.length, step]);

  const progress = pages.length <= 1 ? 0 : Math.round((cursorIndex / (pages.length - 1)) * 100);

  return {
    mode,
    direction,
    scaleType,
    cursorIndex,
    setCursorIndex,
    canGoPrev,
    canGoNext,
    goPrev,
    goNext,
    progress,
  };
};
