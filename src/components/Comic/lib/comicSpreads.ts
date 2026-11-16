import type { Link } from "@readium/shared";

/**
 * Pairs comic pages into the spreads that double-page mode shows.
 *
 * Pairing follows the book, not the page the reader happens to be on, so the
 * same two pages always show together. Rules, in order:
 *
 * - A page that is a whole spread on its own (wider than tall, or marked
 *   `page: center` in the manifest, which ComicInfo `DoublePage` maps to)
 *   always shows alone, and pairing starts fresh after it.
 * - Pairs never cross a chapter start.
 * - The first page of each chapter (the cover, for a single volume) shows
 *   alone when `coverAlone` is on, unless a wide page later in that first run
 *   proves the opposite: a printed spread sits on a left/right pair, so the
 *   pages before it must pair up evenly.
 * - `shift` flips that first-page choice, for books the rules get wrong.
 *
 * A server that has analysed the pages can mark each one `readerSpread:
 * "alone"` or `"pair"`. A chapter with those marks follows them instead of the
 * cover and wide-page rules: a page marked alone shows alone and pairing
 * restarts after it. `shift` still flips the chapter's first page.
 */

export type ComicSpreadPage = {
  /** Global page index in reading order. */
  index: number;
  /** True when the page must show alone (a stored two-page spread). */
  standalone: boolean;
  /** The server's pairing for this page, when it has one. */
  hint?: ComicSpreadHint;
};

export type ComicSpreadHint = "alone" | "pair";

export type ComicSpreadOptions = {
  coverAlone: boolean;
  shift: boolean;
  /** Global page indices where a chapter starts. */
  chapterStarts?: Iterable<number>;
};

export type ComicSpreadLayout = {
  /** Spreads in reading order; each holds one or two global page indices in reading order. */
  spreads: number[][];
  /** Global page index → position of its spread in `spreads`. */
  spreadIndexByPage: Map<number, number>;
};

/** A page this much wider than tall is treated as a two-page spread. */
const WIDE_PAGE_MIN_RATIO = 1.0;

export const isStandaloneComicPage = (link: Pick<Link, "width" | "height" | "properties">): boolean => {
  const page = (link.properties as { page?: unknown } | undefined)?.page;
  if (page === "center") return true;
  const { width, height } = link;
  return (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0 &&
    width / height > WIDE_PAGE_MIN_RATIO
  );
};

/** The `readerSpread` mark a server put on the page link, if any. */
export const comicSpreadHint = (link: Pick<Link, "properties">): ComicSpreadHint | undefined => {
  const properties = link.properties as
    | { otherProperties?: Record<string, unknown>; readerSpread?: unknown }
    | undefined;
  const value = properties?.otherProperties?.readerSpread ?? properties?.readerSpread;
  return value === "alone" || value === "pair" ? value : undefined;
};

const splitIntoChapters = (pages: ComicSpreadPage[], chapterStarts: Set<number>): ComicSpreadPage[][] => {
  const chapters: ComicSpreadPage[][] = [];
  for (const page of pages) {
    if (chapters.length === 0 || chapterStarts.has(page.index)) chapters.push([]);
    chapters[chapters.length - 1]!.push(page);
  }
  return chapters;
};

/**
 * Whether the chapter's first page should show alone. A wide page ending the
 * first run decides it: the run before a printed spread has to pair evenly.
 * Without one, fall back to the cover setting.
 */
const leadsAlone = (chapter: ComicSpreadPage[], coverAlone: boolean): boolean => {
  if (chapter.length <= 1 || chapter[0]!.standalone) return false;
  const firstWide = chapter.findIndex((page) => page.standalone);
  if (firstWide > 0) return firstWide % 2 === 1;
  return coverAlone;
};

const pairChapter = (chapter: ComicSpreadPage[], leadAlone: boolean, out: number[][]) => {
  let pending: number | null = null;
  const flush = () => {
    if (pending !== null) out.push([pending]);
    pending = null;
  };

  chapter.forEach((page, position) => {
    if (page.standalone) {
      flush();
      out.push([page.index]);
      return;
    }
    if (position === 0 && leadAlone) {
      out.push([page.index]);
      return;
    }
    if (pending === null) {
      pending = page.index;
      return;
    }
    out.push([pending, page.index]);
    pending = null;
  });
  flush();
};

/** Follows the server's marks; `shift` flips whether the first page shows alone. */
const pairHintedChapter = (chapter: ComicSpreadPage[], shift: boolean, out: number[][]) => {
  const pages = chapter.map((page) => ({ ...page, standalone: page.standalone || page.hint === "alone" }));
  const first = pages[0]!;
  const firstHintedAlone = !chapter[0]!.standalone && first.standalone;
  if (shift && firstHintedAlone) {
    pages[0] = { ...first, standalone: false };
    pairChapter(pages, false, out);
    return;
  }
  pairChapter(pages, shift && !first.standalone, out);
};

export const buildComicSpreads = (pages: ComicSpreadPage[], options: ComicSpreadOptions): ComicSpreadLayout => {
  const chapterStarts = new Set(options.chapterStarts ?? []);
  const spreads: number[][] = [];

  for (const chapter of splitIntoChapters(pages, chapterStarts)) {
    if (chapter.some((page) => page.hint)) {
      pairHintedChapter(chapter, options.shift, spreads);
      continue;
    }
    const leadAlone = leadsAlone(chapter, options.coverAlone) !== options.shift;
    pairChapter(chapter, leadAlone, spreads);
  }

  const spreadIndexByPage = new Map<number, number>();
  spreads.forEach((spread, spreadIndex) => {
    for (const pageIndex of spread) spreadIndexByPage.set(pageIndex, spreadIndex);
  });
  return { spreads, spreadIndexByPage };
};

/** The spread holding `pageIndex`, or undefined when the page is not laid out. */
export const getSpreadForPage = (layout: ComicSpreadLayout, pageIndex: number): number[] | undefined => {
  const spreadIndex = layout.spreadIndexByPage.get(pageIndex);
  return spreadIndex === undefined ? undefined : layout.spreads[spreadIndex];
};

/**
 * Pages to move forward from `pageIndex` to reach the next spread's first page.
 * At the last spread this points one past its end, so callers' range checks
 * treat it as the end.
 */
export const forwardSpreadStep = (layout: ComicSpreadLayout, pageIndex: number): number => {
  const spread = getSpreadForPage(layout, pageIndex);
  if (!spread) return 1;
  const spreadIndex = layout.spreadIndexByPage.get(pageIndex)!;
  const next = layout.spreads[spreadIndex + 1];
  if (next) return next[0]! - pageIndex;
  return spread[spread.length - 1]! + 1 - pageIndex;
};

/**
 * Pages to move back from `pageIndex` to reach the previous spread's first
 * page. From the second page of a spread this first returns to its own start.
 */
export const backwardSpreadStep = (layout: ComicSpreadLayout, pageIndex: number): number => {
  const spread = getSpreadForPage(layout, pageIndex);
  if (!spread) return 1;
  if (spread[0]! < pageIndex) return pageIndex - spread[0]!;
  const spreadIndex = layout.spreadIndexByPage.get(pageIndex)!;
  const previous = layout.spreads[spreadIndex - 1];
  if (previous) return pageIndex - previous[0]!;
  return pageIndex + 1;
};
