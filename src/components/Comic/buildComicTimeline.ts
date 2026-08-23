import { Link, Publication } from "@readium/shared";

import type { Progress } from "@/core/Hooks/usePublicationProgress";
import { TocItem } from "@/helpers/buildTocTree";
import type { TimelineItemRef } from "@/lib/publicationReducer";

import { ComicPage } from "./hooks/useComicReaderController";
import type { ComicChapterSegment } from "./lib/comicChapters";

export function buildComicTocTreeFromLinks(
  links: Link[],
  idGenerator: () => string,
  publicationTitle?: string
): TocItem[] {
  return links.map((link) => {
    const id = idGenerator();
    let href = link.href;
    const fragmentIndex = href.indexOf("#");

    if (fragmentIndex !== -1) {
      const baseHref = href.substring(0, fragmentIndex);
      const hasSiblingFragment = links.some((item) => item.href.startsWith(baseHref) && item.href !== href);
      if (!hasSiblingFragment) href = baseHref;
    }

    const counter = Number.parseInt(id.split("-")[1], 10);
    return {
      id,
      href,
      title: link.title || (publicationTitle ? `${publicationTitle} ${counter}` : id),
      children: link.children
        ? buildComicTocTreeFromLinks(link.children.items, idGenerator, publicationTitle)
        : undefined,
    };
  });
}

export function buildComicTocTree(publication: Publication, pages: ComicPage[]): TocItem[] {
  if (pages.length === 0) return [];
  let id = 0;
  const idGenerator = () => `toc-${++id}`;
  const title = publication.metadata.title.getTranslation("en");
  return buildComicTocTreeFromLinks(
    pages.map((p) => p.link),
    idGenerator,
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
  return buildComicTocTreeFromLinks(links, idGenerator);
}

interface ComicTimelineState {
  progress: Progress;
  currentEntry: TocItem | null;
  adjacentItems: {
    previous: TimelineItemRef | null;
    next: TimelineItemRef | null;
  };
}

export function buildComicTimeline(
  publication: Publication,
  pages: ComicPage[],
  cursorIndex: number,
  tocTree: TocItem[],
  /** When set (e.g. chapter TOC), highlights that tree index instead of {@link cursorIndex}. */
  tocHighlightIndex?: number
): ComicTimelineState {
  const title = publication.metadata.title.getTranslation("en");
  const currentPage = pages[cursorIndex];
  const prevPage = cursorIndex > 0 ? pages[cursorIndex - 1] : undefined;
  const nextPage = cursorIndex < pages.length - 1 ? pages[cursorIndex + 1] : undefined;

  const toTimelineItem = (p: ComicPage | undefined): TimelineItemRef | null => {
    if (!p) return null;
    return {
      href: p.href,
      title: p.title,
    };
  };

  const previousItem = toTimelineItem(prevPage);
  const nextItem = toTimelineItem(nextPage);

  const total = pages.length;
  const rel = total <= 1 ? 0 : cursorIndex / (total - 1);

  const highlightIdx =
    typeof tocHighlightIndex === "number" && tocHighlightIndex >= 0 ? tocHighlightIndex : cursorIndex;
  const currentEntry = tocTree[highlightIdx] ?? null;

  return {
    progress: {
      title,
      progression: {
        totalItems: total,
        currentIndex: total > 0 ? cursorIndex + 1 : undefined,
        totalPositions: total,
        currentPositions: total > 0 ? [cursorIndex + 1] : [],
        relativeProgression: rel,
        totalProgression: rel,
        currentChapter: currentPage?.title,
        positionsLeft: total > 0 ? Math.max(0, total - 1 - cursorIndex) : undefined,
      },
    },
    currentEntry,
    adjacentItems: {
      previous: previousItem,
      next: nextItem,
    },
  };
}
