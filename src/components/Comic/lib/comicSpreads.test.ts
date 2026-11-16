import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Link } from "@readium/shared";

import {
  backwardSpreadStep,
  buildComicSpreads,
  comicSpreadHint,
  type ComicSpreadPage,
  forwardSpreadStep,
  isStandaloneComicPage,
} from "./comicSpreads";

/** Builds pages from a pattern: "n" = normal page, "W" = stored two-page spread. */
const pages = (pattern: string, startIndex = 0): ComicSpreadPage[] =>
  [...pattern].map((kind, offset) => ({ index: startIndex + offset, standalone: kind === "W" }));

const spreads = (pattern: string, options: Partial<Parameters<typeof buildComicSpreads>[1]> = {}) =>
  buildComicSpreads(pages(pattern), { coverAlone: true, shift: false, ...options }).spreads;

describe("isStandaloneComicPage", () => {
  test("treats landscape pages and page: center as standalone", () => {
    assert.equal(isStandaloneComicPage(new Link({ href: "a", width: 1400, height: 1000 })), true);
    assert.equal(isStandaloneComicPage(new Link({ href: "a", width: 700, height: 1000 })), false);
    assert.equal(isStandaloneComicPage(new Link({ href: "a", width: 1000, height: 1000 })), false);
    assert.equal(isStandaloneComicPage(new Link({ href: "a" })), false);
    assert.equal(
      isStandaloneComicPage(Link.deserialize({ href: "a", properties: { page: "center" } })!),
      true
    );
  });
});

describe("buildComicSpreads", () => {
  test("shows the cover alone and pairs the rest from the book start", () => {
    assert.deepEqual(spreads("nnnnn"), [[0], [1, 2], [3, 4]]);
  });

  test("pairs from the first page when the cover is not alone", () => {
    assert.deepEqual(spreads("nnnnn", { coverAlone: false }), [[0, 1], [2, 3], [4]]);
  });

  test("shift flips the first-page choice", () => {
    assert.deepEqual(spreads("nnnnn", { shift: true }), [[0, 1], [2, 3], [4]]);
    assert.deepEqual(spreads("nnnnn", { coverAlone: false, shift: true }), [[0], [1, 2], [3, 4]]);
  });

  test("a wide page shows alone and pairing restarts after it", () => {
    assert.deepEqual(spreads("nnnWnnn"), [[0], [1, 2], [3], [4, 5], [6]]);
  });

  test("a wide page decides the cover when the pages before it would not pair evenly", () => {
    // Four pages before the spread must pair up, so the cover cannot be alone.
    assert.deepEqual(spreads("nnnnWnn"), [[0, 1], [2, 3], [4], [5, 6]]);
    // Shift still overrides it.
    assert.deepEqual(spreads("nnnnWnn", { shift: true }), [[0], [1, 2], [3], [4], [5, 6]]);
  });

  test("an odd run between two wide pages leaves its last page alone", () => {
    assert.deepEqual(spreads("nnnWnnnWn"), [[0], [1, 2], [3], [4, 5], [6], [7], [8]]);
  });

  test("pairs never cross a chapter start, and each chapter leads with its own first page", () => {
    const layout = buildComicSpreads([...pages("nnnn"), ...pages("nnn", 4)], {
      coverAlone: true,
      shift: false,
      chapterStarts: [0, 4],
    });
    assert.deepEqual(layout.spreads, [[0], [1, 2], [3], [4], [5, 6]]);
  });

  test("a single page and an empty book", () => {
    assert.deepEqual(spreads("n"), [[0]]);
    assert.deepEqual(spreads(""), []);
  });
});

describe("spread steps", () => {
  const layout = buildComicSpreads(pages("nnnWnn"), { coverAlone: true, shift: false });
  // [[0], [1, 2], [3], [4, 5]]

  test("forward moves to the next spread's first page", () => {
    assert.equal(forwardSpreadStep(layout, 0), 1);
    assert.equal(forwardSpreadStep(layout, 1), 2);
    assert.equal(forwardSpreadStep(layout, 2), 1);
    assert.equal(forwardSpreadStep(layout, 3), 1);
  });

  test("forward from the last spread points past the end", () => {
    assert.equal(4 + forwardSpreadStep(layout, 4), 6);
    assert.equal(5 + forwardSpreadStep(layout, 5), 6);
  });

  test("backward moves to the previous spread's first page", () => {
    assert.equal(backwardSpreadStep(layout, 4), 1);
    assert.equal(backwardSpreadStep(layout, 3), 2);
    assert.equal(backwardSpreadStep(layout, 1), 1);
    assert.equal(0 - backwardSpreadStep(layout, 0), -1);
  });

  test("backward from a spread's second page returns to its start", () => {
    assert.equal(backwardSpreadStep(layout, 5), 1);
    assert.equal(backwardSpreadStep(layout, 2), 1);
  });

  test("unknown pages step by one", () => {
    assert.equal(forwardSpreadStep(layout, 99), 1);
    assert.equal(backwardSpreadStep(layout, 99), 1);
  });
});

describe("server spread hints", () => {
  /** "p" = marked pair, "a" = marked alone, "W" = stored two-page spread. */
  const hinted = (pattern: string): ComicSpreadPage[] =>
    [...pattern].map((kind, index) => ({
      index,
      standalone: kind === "W",
      hint: kind === "a" ? "alone" : kind === "W" ? undefined : "pair",
    }));

  test("reads the mark from a manifest link", () => {
    assert.equal(comicSpreadHint(Link.deserialize({ href: "a", properties: { readerSpread: "alone" } })!), "alone");
    assert.equal(comicSpreadHint(Link.deserialize({ href: "a", properties: { readerSpread: "pair" } })!), "pair");
    assert.equal(comicSpreadHint(new Link({ href: "a" })), undefined);
  });

  test("pairs from the first page when the server says so, whatever the cover setting", () => {
    assert.deepEqual(buildComicSpreads(hinted("pppppp"), { coverAlone: true, shift: false }).spreads, [[0, 1], [2, 3], [4, 5]]);
  });

  test("restarts pairing after a page marked alone", () => {
    assert.deepEqual(
      buildComicSpreads(hinted("apppapp"), { coverAlone: false, shift: false }).spreads,
      [[0], [1, 2], [3], [4], [5, 6]]
    );
  });

  test("ignores the wide-page rule and keeps wide pages alone", () => {
    assert.deepEqual(buildComicSpreads(hinted("pppWpp"), { coverAlone: true, shift: false }).spreads, [[0, 1], [2], [3], [4, 5]]);
  });

  test("shift flips the first page either way", () => {
    assert.deepEqual(buildComicSpreads(hinted("pppp"), { coverAlone: true, shift: true }).spreads, [[0], [1, 2], [3]]);
    assert.deepEqual(buildComicSpreads(hinted("appp"), { coverAlone: true, shift: true }).spreads, [[0, 1], [2, 3]]);
  });
});
