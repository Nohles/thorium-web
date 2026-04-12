import { Publication } from "@readium/shared";

import { UnstableTimeline, TimelineItem } from "@/core/Hooks/useTimeline";
import { buildTocTree, TocItem, toEntryRef } from "@/helpers/buildTocTree";

import { ComicPage } from "./hooks/useComicReaderController";

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

export function buildComicTimeline(
  publication: Publication,
  pages: ComicPage[],
  cursorIndex: number,
  tocTree: TocItem[]
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

  const currentEntry =
    tocTree[cursorIndex] !== undefined ? toEntryRef(tocTree[cursorIndex]) : undefined;

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
