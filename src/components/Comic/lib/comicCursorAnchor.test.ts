import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ComicPage } from "../hooks/useComicReaderController";
import { remapCursorToSamePage } from "./comicCursorAnchor";

const chapter = (chapterIndex: number, count: number, startIndex: number): ComicPage[] =>
  Array.from({ length: count }, (_, pageIndexInChapter) => ({
    index: startIndex + pageIndexInChapter,
    href: `${chapterIndex}/${pageIndexInChapter}.webp`,
    archive: {
      chapterIndex,
      chapterHref: `${chapterIndex}.cbz`,
      pageIndexInChapter,
      pageHref: `${pageIndexInChapter}.webp`,
    },
  })) as unknown as ComicPage[];

describe("remapCursorToSamePage", () => {
  test("follows the current page when an earlier chapter is prepended", () => {
    const before = chapter(62, 10, 0);
    const after = [...chapter(61, 7, 0), ...chapter(62, 10, 7)];
    assert.equal(remapCursorToSamePage(before, after, 3), 10);
  });

  test("keeps the index when a later chapter is appended", () => {
    const before = chapter(62, 10, 0);
    const after = [...chapter(62, 10, 0), ...chapter(63, 5, 10)];
    assert.equal(remapCursorToSamePage(before, after, 3), 3);
  });

  test("keeps the index when nothing was under the cursor", () => {
    assert.equal(remapCursorToSamePage([], chapter(62, 10, 0), 0), 0);
  });
});
