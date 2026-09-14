import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  COMIC_TRAILING_PAGE_BUFFER,
  getComicPageLoadSet,
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
