"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ComicReadingDirection,
  ComicReadingMode,
  ComicScaleType,
  defaultComicSettings,
} from "@/lib/comicSettingsReducer";
import { Link } from "@readium/shared";

export type ComicPage = {
  index: number;
  link: Link;
  href: string;
  title: string;
};

export const getEffectiveReadingMode = (mode: ComicReadingMode): ComicReadingMode =>
  mode === ComicReadingMode.default ? ComicReadingMode.singlePage : mode;

export const getEffectiveScaleType = (
  mode: ComicReadingMode,
  scale: ComicScaleType
): ComicScaleType => {
  if (scale !== ComicScaleType.default) return scale;
  if (mode === ComicReadingMode.webtoon) return ComicScaleType.fitWidth;
  return ComicScaleType.fitScreen;
};

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
  const scaleType = getEffectiveScaleType(mode, settings.scaleType);
  const direction = settings.direction;
  const step = mode === ComicReadingMode.doublePage ? 2 : 1;

  const initialIndex = useMemo(() => {
    if (typeof savedPosition === "number" && savedPosition >= 0 && savedPosition < pages.length) {
      return savedPosition;
    }
    return direction === ComicReadingDirection.rtl ? Math.max(0, pages.length - 1) : 0;
  }, [direction, pages.length, savedPosition]);

  const [cursorIndex, setCursorIndex] = useState(initialIndex);

  useEffect(() => {
    setCursorIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    onPersistPosition(cursorIndex);
  }, [cursorIndex, onPersistPosition]);

  const canGoPrev = useMemo(() => {
    if (pages.length === 0) return false;
    return direction === ComicReadingDirection.rtl
      ? cursorIndex < pages.length - 1
      : cursorIndex > 0;
  }, [cursorIndex, direction, pages.length]);

  const canGoNext = useMemo(() => {
    if (pages.length === 0) return false;
    return direction === ComicReadingDirection.rtl
      ? cursorIndex > 0
      : cursorIndex < pages.length - 1;
  }, [cursorIndex, direction, pages.length]);

  const goPrev = useCallback(() => {
    setCursorIndex((i) => {
      const delta = direction === ComicReadingDirection.rtl ? step : -step;
      return Math.max(0, Math.min(pages.length - 1, i + delta));
    });
  }, [direction, pages.length, step]);

  const goNext = useCallback(() => {
    setCursorIndex((i) => {
      const delta = direction === ComicReadingDirection.rtl ? -step : step;
      return Math.max(0, Math.min(pages.length - 1, i + delta));
    });
  }, [direction, pages.length, step]);

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
