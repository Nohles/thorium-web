import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { orderByCollapsePriority, ThCollapsibilityVisibility } from "./useCollapsibility";

const prefsWith = (priorities: Record<string, number | undefined>) => ({
  displayOrder: Object.keys(priorities),
  collapse: true,
  keys: Object.fromEntries(
    Object.entries(priorities).map(([key, collapsePriority]) => [
      key,
      { visibility: ThCollapsibilityVisibility.partially, collapsePriority },
    ]),
  ),
});

describe("orderByCollapsePriority", () => {
  test("keeps display order when no priorities are set", () => {
    const prefs = prefsWith({ a: undefined, b: undefined, c: undefined });
    assert.deepEqual(orderByCollapsePriority(["a", "b", "c"], prefs), ["a", "b", "c"]);
  });

  test("moves lower priorities to the end so they collapse first", () => {
    // Bookmark is displayed first but should collapse before fullscreen.
    const prefs = prefsWith({ bookmark: -2, dictionary: undefined, search: undefined, fullscreen: -1 });
    assert.deepEqual(
      orderByCollapsePriority(["bookmark", "dictionary", "search", "fullscreen"], prefs),
      ["dictionary", "search", "fullscreen", "bookmark"],
    );
  });
});
