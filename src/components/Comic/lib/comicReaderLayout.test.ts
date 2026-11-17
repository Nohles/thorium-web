import assert from "node:assert/strict";
import { test } from "node:test";
import { ComicScaleType } from "@/lib/comicSettingsReducer";
import { fillsPageFrameWidth } from "./comicReaderLayout";

test("only Fit width sizes the scroll frame to the full reader width", () => {
  assert.equal(fillsPageFrameWidth(ComicScaleType.fitWidth), true);
  assert.equal(fillsPageFrameWidth(ComicScaleType.fitScreen), false);
  assert.equal(fillsPageFrameWidth(ComicScaleType.fitHeight), false);
  assert.equal(fillsPageFrameWidth(ComicScaleType.originalSize), false);
});
