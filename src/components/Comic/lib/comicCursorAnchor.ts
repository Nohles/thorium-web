import type { ComicPage } from "../hooks/useComicReaderController";

/** Recover within the saved chapter if an edited archive removed its saved page. */
export const findClosestArchivePageIndex = (
  pages: readonly ComicPage[],
  identity: { chapterIndex: number; pageIndexInChapter: number }
): number => {
  let closest = -1;
  let distance = Infinity;
  pages.forEach((page, index) => {
    if (page.archive?.chapterIndex !== identity.chapterIndex) return;
    const candidate = Math.abs(page.archive.pageIndexInChapter - identity.pageIndexInChapter);
    if (candidate < distance) {
      closest = index;
      distance = candidate;
    }
  });
  return closest;
};

/**
 * Keeps the cursor on the same archive page when the loaded page list changes.
 * Prefetching an earlier chapter prepends its pages, which shifts every index
 * after it; the old index would then point into the earlier chapter.
 */
export const remapCursorToSamePage = (
  prevPages: readonly ComicPage[],
  nextPages: readonly ComicPage[],
  cursorIndex: number
): number => {
  const identity = prevPages[cursorIndex]?.archive;
  if (!identity) return cursorIndex;
  const nextIndex = nextPages.findIndex(
    (page) =>
      page.archive?.chapterIndex === identity.chapterIndex &&
      page.archive.pageIndexInChapter === identity.pageIndexInChapter
  );
  return nextIndex < 0 ? cursorIndex : nextIndex;
};
