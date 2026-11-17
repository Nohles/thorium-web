import assert from "node:assert/strict";
import { test } from "node:test";
import { publicationPositionEntries } from "./publicationPositions";
import type { SerializedLocator } from "./serializePositions";

const position = (href: string, value?: number): SerializedLocator => ({
  href, type: "application/xhtml+xml", locations: { position: value }
});

test("progress ranges use numeric extrema without mutating positions or including non-spine resources", () => {
  const positions = [position("a", 9), position("other", 100), position("a", 2), position("b", 7), position("a", 5)];
  const before = structuredClone(positions);
  assert.deepEqual([...publicationPositionEntries([{ href: "a" }, { href: "missing" }, { href: "b" }], positions)], [
    ["a", { positionRange: [2, 9] }], ["b", { positionRange: [7, 7] }]
  ]);
  assert.deepEqual(positions, before);
});

test("unknown positions and stable zero ties retain the existing range semantics", () => {
  const positions = [position("a", 3), position("a"), position("b", 0), position("b"), position("c", -2), position("c")];
  assert.deepEqual([...publicationPositionEntries(["a", "b", "c"].map(href => ({ href })), positions)], [
    ["a", { positionRange: undefined }], ["b", { positionRange: [0, undefined] }], ["c", { positionRange: [-2, undefined] }]
  ]);
  assert.equal(publicationPositionEntries([{ href: "a" }]).size, 0);
});

test("building ranges for a large publication reads positions a bounded number of times", () => {
  const chapters = Array.from({ length: 5_000 }, (_, i) => ({ href: `chapter-${i}` }));
  let reads = 0;
  const positions = chapters.flatMap(({ href }, i) => [3, 1, 2].map(offset => ({
    ...position(href, i * 3 + offset), get href() { reads++; return href; }
  })));
  const result = publicationPositionEntries(chapters, positions);
  assert.equal(result.size, chapters.length);
  assert.deepEqual(result.get("chapter-4999"), { positionRange: [14998, 15000] });
  assert.ok(reads <= positions.length * 3, `Position hrefs read ${reads} times for ${positions.length} positions`);
});

test("ranges match the previous stable-sort behavior for varied position lists", () => {
  let seed = 42;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const spine = ["a", "b", "c"].map(href => ({ href }));
  for (let trial = 0; trial < 100; trial++) {
    const positions = Array.from({ length: next() % 60 }, () => position(
      ["a", "b", "c", "other"][next() % 4], [undefined, -2, 0, 1, 3, 9][next() % 6]
    ));
    const expected = new Map();
    for (const { href } of spine) {
      const matching = positions.filter(p => p.href === href).sort((a, b) => (a.locations?.position || 0) - (b.locations?.position || 0));
      if (!matching.length) continue;
      const start = matching[0].locations?.position;
      expected.set(href, { positionRange: start === undefined ? undefined : [start, matching.at(-1)?.locations?.position] });
    }
    assert.deepEqual(publicationPositionEntries(spine, positions), expected);
  }
});
