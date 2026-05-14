import { Link, Publication } from "@readium/shared";

import type { ComicPage } from "../hooks/useComicReaderController";

/** Normalized path for matching reading-order hrefs to TOC hrefs (matches useComicNavigator). */
export const normalizeHrefPath = (href: string): string => {
  const [base] = href.split("#");
  const [path] = base.split("?");
  return path;
};

const linkPathsMatch = (a: string, b: string) => normalizeHrefPath(a) === normalizeHrefPath(b);

export type ComicChapterSegment = {
  /** Display title for this chapter */
  title: string;
  /** First page index in reading order (inclusive) */
  startIndex: number;
  /** Last page index in reading order (inclusive) */
  endIndex: number;
};

const walkTocLinks = (items: Link[] | undefined, out: Link[]): void => {
  if (!items?.length) return;
  for (const link of items) {
    out.push(link);
    if (link.children?.items?.length) {
      walkTocLinks(link.children.items, out);
    }
  }
};

const pageIndexForTocHref = (pages: ComicPage[], tocHref: string): number => {
  const idx = pages.findIndex((p) => linkPathsMatch(p.href, tocHref));
  return idx;
};

/**
 * Builds chapter segments from manifest TOC anchors into the flat image reading order.
 * Requires at least two segments to treat the publication as multi-chapter for UI purposes.
 */
export function buildComicChapterSegments(publication: Publication, pages: ComicPage[]): ComicChapterSegment[] {
  if (pages.length === 0) return [];

  const flatToc: Link[] = [];
  walkTocLinks(publication.toc?.items, flatToc);

  /** Reading-order index -> title from first matching TOC entry that has a title */
  const startTitleByIndex = new Map<number, string>();
  const startIndicesFromToc = new Set<number>();

  for (const link of flatToc) {
    if (link.templated) continue;
    const idx = pageIndexForTocHref(pages, link.href);
    if (idx < 0) continue;
    startIndicesFromToc.add(idx);
    const title = typeof link.title === "string" && link.title.trim() ? link.title.trim() : undefined;
    if (title && !startTitleByIndex.has(idx)) {
      startTitleByIndex.set(idx, title);
    }
  }

  const sortedStarts = [...startIndicesFromToc].sort((a, b) => a - b);
  if (sortedStarts.length === 0) {
    return [];
  }

  const starts: number[] = [];
  if (sortedStarts[0] !== 0) {
    starts.push(0);
  }
  starts.push(...sortedStarts);

  const dedupedStarts: number[] = [];
  for (const s of starts) {
    if (dedupedStarts.length === 0 || dedupedStarts[dedupedStarts.length - 1] !== s) {
      dedupedStarts.push(s);
    }
  }

  const pubTitle = publication.metadata.title.getTranslation("en")?.trim();
  const segments: ComicChapterSegment[] = [];

  for (let i = 0; i < dedupedStarts.length; i += 1) {
    const startIndex = dedupedStarts[i]!;
    const endIndex = i < dedupedStarts.length - 1 ? dedupedStarts[i + 1]! - 1 : pages.length - 1;
    if (startIndex > endIndex || endIndex >= pages.length) continue;

    const explicitTitle = startTitleByIndex.get(startIndex);
    const title =
      explicitTitle ??
      (startIndex === 0 && pubTitle ? pubTitle : `Chapter ${i + 1}`);

    segments.push({ title, startIndex, endIndex });
  }

  return segments;
}

/** True when chapter-boundary UX should apply (TOC defines multiple ranges). */
export const hasMultiChapterStructure = (segments: ComicChapterSegment[]): boolean => segments.length >= 2;

export const getSegmentForPageIndex = (
  segments: ComicChapterSegment[],
  pageIndex: number
): ComicChapterSegment | undefined => segments.find((s) => pageIndex >= s.startIndex && pageIndex <= s.endIndex);

export const getSegmentIndex = (segments: ComicChapterSegment[], pageIndex: number): number =>
  segments.findIndex((s) => pageIndex >= s.startIndex && pageIndex <= s.endIndex);

/** True if goNext(step) would stay within segment (there is room for another full step). */
export const canAdvanceWithinSegment = (
  cursorIndex: number,
  segment: ComicChapterSegment,
  step: number
): boolean => {
  const next = cursorIndex + step;
  return next <= segment.endIndex;
};

/** True if goPrev(step) would stay within segment. */
export const canRetreatWithinSegment = (
  cursorIndex: number,
  segment: ComicChapterSegment,
  step: number
): boolean => {
  const prev = cursorIndex - step;
  return prev >= segment.startIndex;
};

export const isAtLastNavigablePositionInSegment = (
  cursorIndex: number,
  segment: ComicChapterSegment,
  step: number
): boolean => !canAdvanceWithinSegment(cursorIndex, segment, step);

export const isAtFirstNavigablePositionInSegment = (
  cursorIndex: number,
  segment: ComicChapterSegment,
  step: number
): boolean => !canRetreatWithinSegment(cursorIndex, segment, step);
