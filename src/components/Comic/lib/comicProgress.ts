"use client";

import { ComicReadingDirection, ComicReadingMode } from "@/lib/comicSettingsReducer";
import { ComicPage } from "../hooks/useComicReaderController";
import type { ComicSpreadLayout } from "./comicSpreads";

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
  /** When set, progress labels use 1-based indices within the current chapter (reading-order index minus offset). */
  progressLabelOffset?: number;
  /** Double-page pairing; without it pages pair two by two. */
  spreadLayout?: ComicSpreadLayout | null;
};

const isPageLoaded = (pageLoadStates: Record<number, ComicPageLoadState>, pageIndex: number) =>
  pageLoadStates[pageIndex] === "loaded";

const labelForReadingOrderIndices = (
  pageIndices: number[],
  direction: ComicReadingDirection,
  progressLabelOffset: number | undefined
) => {
  const displayIndices = direction === ComicReadingDirection.rtl ? [...pageIndices].reverse() : pageIndices;
  return displayIndices
    .map((index) => (progressLabelOffset === undefined ? index + 1 : index - progressLabelOffset + 1))
    .join("-");
};

export const buildComicProgressItems = ({
  pages,
  mode,
  direction,
  cursorIndex,
  pageLoadStates,
  progressLabelOffset,
  spreadLayout,
}: BuildComicProgressItemsArgs): ComicProgressItem[] => {
  if (pages.length === 0) return [];

  if (mode === ComicReadingMode.doublePage) {
    const items: ComicProgressItem[] = [];
    const visible = new Set(pages.map((page) => page.index));
    const spreads =
      spreadLayout?.spreads.filter((spread) => spread.every((index) => visible.has(index))) ??
      pages.reduce<number[][]>((out, page, position) => {
        if (position % 2 === 0) out.push([page.index]);
        else out[out.length - 1]!.push(page.index);
        return out;
      }, []);
    for (const pageIndices of spreads) {
      const loadedCount = pageIndices.filter((pageIndex) => isPageLoaded(pageLoadStates, pageIndex)).length;
      const isCurrent = pageIndices.includes(cursorIndex);
      const firstGlobal = pageIndices[0] ?? 0;
      // The cursor always sits on a spread's first page in reading order.
      const targetIndex = firstGlobal;
      items.push({
        id: `spread-${firstGlobal}`,
        type: "spread",
        pageIndices,
        targetIndex,
        label: labelForReadingOrderIndices(pageIndices, direction, progressLabelOffset),
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
    label:
      progressLabelOffset === undefined
        ? `${page.index + 1}`
        : `${page.index - progressLabelOffset + 1}`,
    isCurrent: page.index === cursorIndex,
    isCompleted: page.index <= cursorIndex,
    isLoaded: isPageLoaded(pageLoadStates, page.index),
    loadedCount: isPageLoaded(pageLoadStates, page.index) ? 1 : 0,
  }));
};
