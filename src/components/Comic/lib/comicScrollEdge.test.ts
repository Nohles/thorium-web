import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { getComicScrollEdge } from "./comicScrollEdge";

const edge = (position: number) => getComicScrollEdge({ position, viewportSize: 1000, contentSize: 5000 });

describe("getComicScrollEdge", () => {
  test("reports the start and the end of the scroll range", () => {
    assert.equal(edge(0), "start");
    assert.equal(edge(4000), "end");
  });

  test("tolerates fractional scroll offsets near either edge", () => {
    assert.equal(edge(1.5), "start");
    assert.equal(edge(3998.5), "end");
  });

  test("reports no edge between them", () => {
    assert.equal(edge(3), null);
    assert.equal(edge(2000), null);
    assert.equal(edge(3997), null);
  });

  test("reports no edge when the content does not overflow", () => {
    assert.equal(getComicScrollEdge({ position: 0, viewportSize: 1000, contentSize: 1000 }), null);
    assert.equal(getComicScrollEdge({ position: 0, viewportSize: 1000, contentSize: 800 }), null);
  });
});
