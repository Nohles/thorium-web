import assert from "node:assert/strict";
import { describe, test } from "node:test";

import reducer, {
  ComicReadingDirection,
  defaultComicSettings,
  initComicSettings,
  normalizeComicSettings,
  setComicActiveKey,
  updateComicSettings,
} from "./comicSettingsReducer";

const empty = () => reducer(undefined, { type: "@@init" });

describe("comicSettingsReducer", () => {
  test("chapter boundaries can be turned off", () => {
    const state = reducer(
      empty(),
      updateComicSettings({ key: "book", patch: { comicChapterBoundaries: false } })
    );
    assert.equal(state.byKey.book.comicChapterBoundaries, false);
    assert.equal(normalizeComicSettings({ comicChapterBoundaries: false }).comicChapterBoundaries, false);
  });

  test("initComicSettings seeds a new key with manifest-derived defaults", () => {
    const state = reducer(
      empty(),
      initComicSettings({ key: "manga", defaults: { direction: ComicReadingDirection.rtl } })
    );
    assert.deepEqual(state.byKey.manga, { ...defaultComicSettings, direction: ComicReadingDirection.rtl });
  });

  test("initComicSettings never overrides existing settings", () => {
    let state = reducer(
      empty(),
      updateComicSettings({ key: "manga", patch: { direction: ComicReadingDirection.ltr } })
    );
    state = reducer(state, initComicSettings({ key: "manga", defaults: { direction: ComicReadingDirection.rtl } }));
    assert.equal(state.byKey.manga.direction, ComicReadingDirection.ltr);
  });

  test("activating a seeded key keeps the seeded values", () => {
    let state = reducer(
      empty(),
      initComicSettings({ key: "manga", defaults: { direction: ComicReadingDirection.rtl } })
    );
    state = reducer(state, setComicActiveKey("manga"));
    assert.equal(state.activeKey, "manga");
    assert.equal(state.byKey.manga.direction, ComicReadingDirection.rtl);
  });
});
