import assert from "node:assert/strict";
import { describe, test } from "node:test";

import reducer, {
  ComicReadingDirection,
  ComicReadingMode,
  ComicSettingsReducerState,
  ComicScaleType,
  defaultComicSettings,
  initComicSettings,
  normalizeComicSettings,
  resolveComicSettings,
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
    assert.equal(resolveComicSettings(state, "book").comicChapterBoundaries, false);
    assert.equal(normalizeComicSettings({ comicChapterBoundaries: false }).comicChapterBoundaries, false);
  });

  test("shared settings apply to every publication", () => {
    let state = reducer(
      empty(),
      updateComicSettings({ key: "first", patch: { readingMode: ComicReadingMode.webtoon } })
    );
    state = reducer(state, setComicActiveKey("second"));
    assert.equal(resolveComicSettings(state, "second").readingMode, ComicReadingMode.webtoon);
  });

  test("reading direction stays with its publication", () => {
    let state = reducer(
      empty(),
      updateComicSettings({ key: "manga", patch: { direction: ComicReadingDirection.rtl } })
    );
    state = reducer(state, setComicActiveKey("western"));
    assert.equal(resolveComicSettings(state, "manga").direction, ComicReadingDirection.rtl);
    assert.equal(resolveComicSettings(state, "western").direction, ComicReadingDirection.ltr);
  });

  test("initComicSettings seeds a new publication's direction", () => {
    const state = reducer(
      empty(),
      initComicSettings({ key: "manga", defaults: { direction: ComicReadingDirection.rtl } })
    );
    assert.deepEqual(state.byKey.manga, { direction: ComicReadingDirection.rtl, spreadShift: false });
    assert.deepEqual(resolveComicSettings(state, "manga"), {
      ...defaultComicSettings,
      direction: ComicReadingDirection.rtl,
    });
  });

  test("initComicSettings never overrides existing settings", () => {
    let state = reducer(
      empty(),
      updateComicSettings({ key: "manga", patch: { direction: ComicReadingDirection.ltr } })
    );
    state = reducer(state, initComicSettings({ key: "manga", defaults: { direction: ComicReadingDirection.rtl } }));
    assert.equal(resolveComicSettings(state, "manga").direction, ComicReadingDirection.ltr);
  });

  test("a legacy per-publication entry becomes the shared settings", () => {
    const legacy: ComicSettingsReducerState = {
      activeKey: null,
      byKey: {
        old: {
          ...defaultComicSettings,
          scaleType: ComicScaleType.fitWidth,
          direction: ComicReadingDirection.rtl,
        },
      },
    };
    assert.equal(resolveComicSettings(legacy, "old").scaleType, ComicScaleType.fitWidth);

    const state = reducer(legacy, setComicActiveKey("old"));
    assert.equal(state.global?.scaleType, ComicScaleType.fitWidth);
    assert.deepEqual(state.byKey.old, { direction: ComicReadingDirection.rtl, spreadShift: false });
    assert.equal(resolveComicSettings(state, "old").direction, ComicReadingDirection.rtl);
  });
});

describe("comicSettingsReducer spread settings", () => {
  test("spread shift follows the publication; cover and portrait settings are shared", () => {
    let state = reducer(
      reducer(undefined, { type: "init" }),
      updateComicSettings({
        key: "volume-1",
        patch: { spreadShift: true, spreadCoverAlone: false, doublePageInPortrait: true },
      })
    );
    state = reducer(state, setComicActiveKey("volume-2"));
    assert.equal(resolveComicSettings(state, "volume-1").spreadShift, true);
    assert.equal(resolveComicSettings(state, "volume-2").spreadShift, false);
    assert.equal(resolveComicSettings(state, "volume-2").spreadCoverAlone, false);
    assert.equal(resolveComicSettings(state, "volume-2").doublePageInPortrait, true);
  });
});
