import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  COMIC_TRAILING_PAGE_BUFFER,
  getComicPageLoadSet,
  getComicPageWarmupOrder,
} from "./comicPageLoadWindow";

const pages = [10, 20, 30, 40, 50, 60].map((index) => ({ index }));

describe("getComicPageLoadSet", () => {
  test("retains two prior pages while preloading forward", () => {
    assert.deepEqual([...getComicPageLoadSet(pages, 40, 1, 1)].sort((a, b) => a - b), [
      20,
      30,
      40,
      50,
    ]);
  });

  test("retains two following pages while preloading backward", () => {
    assert.deepEqual([...getComicPageLoadSet(pages, 40, 1, -1)].sort((a, b) => a - b), [
      30,
      40,
      50,
      60,
    ]);
  });

  test("clamps the window at publication boundaries", () => {
    assert.deepEqual([...getComicPageLoadSet(pages, 10, 2, 1)], [10, 20, 30]);
    assert.deepEqual([...getComicPageLoadSet(pages, 60, 2, -1)], [60, 50, 40]);
  });

  test("keeps the trailing buffer independent from forward preloading", () => {
    assert.deepEqual(
      [...getComicPageLoadSet(pages, 40, 0, 1, COMIC_TRAILING_PAGE_BUFFER)].sort(
        (a, b) => a - b
      ),
      [20, 30, 40]
    );
  });

  test("returns no pages when the cursor is outside the current chapter slice", () => {
    assert.equal(getComicPageLoadSet(pages, 999, 2, 1).size, 0);
  });
});

describe("getComicPageWarmupOrder", () => {
  const chapter = Array.from({ length: 10 }, (_, position) => ({ index: position * 10 }));
  const summarize = (order: ReturnType<typeof getComicPageWarmupOrder>) =>
    order.map(({ page, urgent }) => `${page.index}${urgent ? "!" : ""}`);

  test("loads the next pages urgently, one page behind, then the rest ahead and behind", () => {
    assert.deepEqual(summarize(getComicPageWarmupOrder(chapter, 30, 1, { urgentAhead: 2 })), [
      "30!",
      "40!",
      "50!",
      "20",
      "60",
      "70",
      "80",
      "90",
      "10",
      "0",
    ]);
  });

  test("follows the reading direction when scrolling backward", () => {
    assert.deepEqual(summarize(getComicPageWarmupOrder(chapter, 60, -1, { urgentAhead: 1, behindLimit: 2 })), [
      "60!",
      "50!",
      "70",
      "40",
      "30",
      "20",
      "10",
      "0",
      "80",
    ]);
  });

  test("bounds the window for caches that cannot hold the whole chapter", () => {
    assert.deepEqual(
      summarize(getComicPageWarmupOrder(chapter, 0, 1, { urgentAhead: 3, aheadLimit: 4, behindLimit: 1 })),
      ["0!", "10!", "20!", "30!", "40"]
    );
  });

  test("returns nothing when the cursor is outside the slice", () => {
    assert.equal(getComicPageWarmupOrder(chapter, 999, 1).length, 0);
  });
});
