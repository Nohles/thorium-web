import type { ComicPage } from "../hooks/useComicReaderController";

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
