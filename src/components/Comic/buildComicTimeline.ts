import { Link, Publication } from "@readium/shared";

import { UnstableTimeline, TimelineItem } from "@/core/Hooks/useTimeline";
import { buildTocTree, TocItem, toEntryRef } from "@/helpers/buildTocTree";

import { ComicPage } from "./hooks/useComicReaderController";
import type { ComicChapterSegment } from "./lib/comicChapters";

export function buildComicTocTree(publication: Publication, pages: ComicPage[]): TocItem[] {
  if (pages.length === 0) return [];
  let id = 0;
  const idGenerator = () => `toc-${++id}`;
  const title = publication.metadata.title.getTranslation("en");
  return buildTocTree(
    pages.map((p) => p.link),
    idGenerator,
    undefined,
    title || undefined
  );
}

/**
 * One TOC row per manifest chapter (segment), href = first page of the segment so TOC jumps match {@link useComicNavigator}.
 */
export function buildComicChapterTocTree(segments: ComicChapterSegment[], pages: ComicPage[]): TocItem[] {
  if (segments.length === 0 || pages.length === 0) return [];
  const links: Link[] = [];
  for (const seg of segments) {
    const page = pages[seg.startIndex];
    if (!page) continue;
    links.push(
      new Link({
        href: page.link.href,
        type: page.link.type,
        templated: page.link.templated,
        title: seg.title,
      })
    );
  }
  let id = 0;
  const idGenerator = () => `toc-${++id}`;
  return buildTocTree(links, idGenerator, undefined, undefined);
}

export function buildComicTimeline(
  publication: Publication,
  pages: ComicPage[],
  cursorIndex: number,
  tocTree: TocItem[],
  /** When set (e.g. chapter TOC), highlights that tree index instead of {@link cursorIndex}. */
  tocHighlightIndex?: number
): UnstableTimeline {
  const title = publication.metadata.title.getTranslation("en");
  const currentPage = pages[cursorIndex];
  const prevPage = cursorIndex > 0 ? pages[cursorIndex - 1] : undefined;
  const nextPage = cursorIndex < pages.length - 1 ? pages[cursorIndex + 1] : undefined;

  const toTimelineItem = (p: ComicPage | undefined, roIndex: number): TimelineItem | null => {
    if (!p) return null;
    return {
      href: p.href,
      title: p.title,
      readingOrderIndex: roIndex,
    };
  };

  const currentItem = toTimelineItem(currentPage, cursorIndex);
  const previousItem = toTimelineItem(prevPage, cursorIndex - 1);
  const nextItem = toTimelineItem(nextPage, cursorIndex + 1);

  const total = pages.length;
  const rel = total <= 1 ? 0 : cursorIndex / (total - 1);

  const highlightIdx =
    typeof tocHighlightIndex === "number" && tocHighlightIndex >= 0 ? tocHighlightIndex : cursorIndex;
  const currentEntry =
    tocTree[highlightIdx] !== undefined ? toEntryRef(tocTree[highlightIdx]) : undefined;

  return {
    title,
    items: {},
    toc: {
      tree: tocTree,
      currentEntry,
    },
    currentItem,
    previousItem,
    nextItem,
    progression: {
      totalItems: total,
      currentIndex: cursorIndex + 1,
      totalPositions: total,
      currentPositions: [cursorIndex + 1],
      relativeProgression: rel,
      totalProgression: rel,
      currentChapter: currentPage?.title,
      positionsLeft: total > 0 ? Math.max(0, total - 1 - cursorIndex) : undefined,
    },
  };
}
