"use client";

import { ComicReadingDirection, ComicReadingMode } from "@/lib/comicSettingsReducer";
import { ComicPage } from "../hooks/useComicReaderController";

export type ComicPageLoadState = "idle" | "loading" | "loaded" | "error";

export type ComicProgressItem = {
  id: string;
  type: "page" | "spread";
  pageIndices: number[];
  targetIndex: number;
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
  isLoaded: boolean;
  loadedCount: number;
};

type BuildComicProgressItemsArgs = {
  pages: ComicPage[];
  mode: ComicReadingMode;
  direction: ComicReadingDirection;
  cursorIndex: number;
  pageLoadStates: Record<number, ComicPageLoadState>;
};

const isPageLoaded = (pageLoadStates: Record<number, ComicPageLoadState>, pageIndex: number) =>
  pageLoadStates[pageIndex] === "loaded";

const getItemLabel = (pageIndices: number[], direction: ComicReadingDirection) => {
  const displayIndices = direction === ComicReadingDirection.rtl ? [...pageIndices].reverse() : pageIndices;
  return displayIndices.map((index) => index + 1).join("-");
};

export const buildComicProgressItems = ({
  pages,
  mode,
  direction,
  cursorIndex,
  pageLoadStates,
}: BuildComicProgressItemsArgs): ComicProgressItem[] => {
  if (pages.length === 0) return [];

  if (mode === ComicReadingMode.doublePage) {
    const items: ComicProgressItem[] = [];
    for (let startIndex = 0; startIndex < pages.length; startIndex += 2) {
      const pageIndices = pages
        .slice(startIndex, Math.min(startIndex + 2, pages.length))
        .map((page) => page.index);
      const loadedCount = pageIndices.filter((pageIndex) => isPageLoaded(pageLoadStates, pageIndex)).length;
      const isCurrent = pageIndices.includes(cursorIndex);
      items.push({
        id: `spread-${startIndex}`,
        type: "spread",
        pageIndices,
        targetIndex: direction === ComicReadingDirection.rtl ? pageIndices[pageIndices.length - 1] ?? startIndex : startIndex,
        label: getItemLabel(pageIndices, direction),
        isCurrent,
        isCompleted: isCurrent || pageIndices[0] < cursorIndex,
        isLoaded: loadedCount === pageIndices.length && pageIndices.length > 0,
        loadedCount,
      });
    }
    return items;
  }

  return pages.map((page) => ({
    id: `page-${page.index}`,
    type: "page",
    pageIndices: [page.index],
    targetIndex: page.index,
    label: `${page.index + 1}`,
    isCurrent: page.index === cursorIndex,
    isCompleted: page.index <= cursorIndex,
    isLoaded: isPageLoaded(pageLoadStates, page.index),
    loadedCount: isPageLoaded(pageLoadStates, page.index) ? 1 : 0,
  }));
};
