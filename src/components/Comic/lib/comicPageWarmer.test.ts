import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  COMIC_BACKGROUND_WARMUP_CONCURRENCY,
  COMIC_URGENT_WARMUP_CONCURRENCY,
  ComicPageWarmer,
  type ComicWarmupDimensions,
  type ComicWarmupTask,
} from "./comicPageWarmer";

type Deferred = {
  resolve: (value?: ComicWarmupDimensions) => void;
  reject: (error: Error) => void;
  signal: AbortSignal;
};

const createHarness = (warmed: Set<string> | undefined = new Set()) => {
  const started = new Map<string, Deferred>();
  const reported: string[] = [];
  const warmer = new ComicPageWarmer(warmed, (key) => reported.push(key));
  const task = (key: string, urgent = false): ComicWarmupTask => ({
    key,
    urgent,
    load: (signal) =>
      new Promise((resolve, reject) => {
        started.set(key, { resolve, reject, signal });
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  return { warmer, started, reported, task, warmed };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ComicPageWarmer", () => {
  test("runs urgent pages with more concurrency than background pages", async () => {
    const { warmer, started, task } = createHarness();
    const keys = Array.from({ length: 8 }, (_, i) => `p${i}`);
    warmer.plan(keys.map((key, i) => task(key, i < 6)));
    assert.equal(started.size, COMIC_URGENT_WARMUP_CONCURRENCY);

    const { warmer: background, started: backgroundStarted, task: backgroundTask } = createHarness();
    background.plan(keys.map((key) => backgroundTask(key)));
    assert.equal(backgroundStarted.size, COMIC_BACKGROUND_WARMUP_CONCURRENCY);
  });

  test("continues in order as downloads finish and records warmed pages", async () => {
    const { warmer, started, reported, task, warmed } = createHarness();
    warmer.plan(["a", "b", "c"].map((key) => task(key)));
    assert.deepEqual([...started.keys()], ["a", "b"]);

    started.get("a")!.resolve({ width: 10, height: 20 });
    await flush();
    assert.deepEqual([...started.keys()], ["a", "b", "c"]);
    assert.deepEqual(reported, ["a"]);
    assert.ok(warmed!.has("a"));
  });

  test("re-planning keeps wanted downloads, cancels unwanted ones and skips warmed pages", async () => {
    const { warmer, started, task } = createHarness(new Set(["done"]));
    warmer.plan(["a", "b"].map((key) => task(key)));
    const firstA = started.get("a")!;
    const firstB = started.get("b")!;

    warmer.plan(["done", "b", "c"].map((key) => task(key)));
    assert.equal(firstA.signal.aborted, true);
    assert.equal(firstB.signal.aborted, false);
    assert.equal(started.get("b"), firstB);
    await flush();
    assert.ok(started.has("c"));
    assert.ok(!started.has("done"));
  });

  test("does not retry failed pages and stops on dispose", async () => {
    const { warmer, started, task } = createHarness();
    warmer.plan([task("bad")]);
    started.get("bad")!.reject(new Error("404"));
    await flush();
    started.clear();
    warmer.plan([task("bad"), task("next")]);
    assert.deepEqual([...started.keys()], ["next"]);

    warmer.dispose();
    assert.equal(started.get("next")!.signal.aborted, true);
  });
});
