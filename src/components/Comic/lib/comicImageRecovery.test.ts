import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMIC_IMAGE_AUTO_RETRY_LIMIT,
  getComicImageAutoRetryDelay,
  getComicImageRetryUrl,
} from "./comicImageRecovery";

test("automatic retries back off and then stop", () => {
  const delays = Array.from({ length: COMIC_IMAGE_AUTO_RETRY_LIMIT + 1 }, (_, retries) =>
    getComicImageAutoRetryDelay(retries)
  );
  assert.deepEqual(delays, [1_000, 2_000, 4_000, undefined]);
});

test("the first load keeps the original URL so it shares the warmed HTTP cache", () => {
  const url = "https://reader.test/readium/abc/001.jpg";
  assert.equal(getComicImageRetryUrl(url, 0), url);
});

test("each reload gets a distinct URL and keeps existing query parameters", () => {
  const first = getComicImageRetryUrl("https://reader.test/001.jpg?token=a", 1);
  const second = getComicImageRetryUrl("https://reader.test/001.jpg?token=a", 2);
  assert.notEqual(first, second);
  assert.equal(new URL(first).searchParams.get("token"), "a");
});

test("object URLs are never rewritten", () => {
  const url = "blob:https://reader.test/5f0b";
  assert.equal(getComicImageRetryUrl(url, 3), url);
});
