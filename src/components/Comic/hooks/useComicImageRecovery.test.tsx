import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { COMIC_IMAGE_RETRY_ACTION_DELAY_MS } from "../lib/comicImageRecovery";
import { useComicImageRecovery } from "./useComicImageRecovery";

type Props = {
  href: string;
  isPending: boolean;
  hasLoadError: boolean;
  isInView: boolean;
};
type Recovery = ReturnType<typeof useComicImageRecovery>;

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let now = 0;
let nextTimerId = 1;
let timers = new Map<number, { at: number; run: () => void }>();

const advance = (ms: number) =>
  act(() => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].run();
    }
    now = end;
  });

const defaults: Props = { href: "1.jpg", isPending: true, hasLoadError: false, isInView: true };

const setup = async (initial: Partial<Props> = {}) => {
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  let reloads = 0;
  let recovery!: Recovery;
  let props = { ...defaults, ...initial };
  const Harness = () => {
    recovery = useComicImageRecovery({ ...props, onReload: () => { reloads += 1; } });
    return null;
  };
  const render = (next: Partial<Props> = {}) =>
    act(() => {
      props = { ...props, ...next };
      root.render(<Harness key="page" />);
    });
  render();
  return {
    render,
    reloads: () => reloads,
    current: () => recovery,
    unmount: () => act(() => root.unmount()),
  };
};

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://reader.test" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  now = 0;
  timers = new Map();
  globalThis.setTimeout = ((run: () => void, ms = 0) => {
    const id = nextTimerId++;
    timers.set(id, { at: now + ms, run });
    return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    timers.delete(id);
  }) as unknown as typeof clearTimeout;
});

afterEach(() => {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
});

test("offers Try again beside the spinner only after the delay", async () => {
  const page = await setup();
  advance(COMIC_IMAGE_RETRY_ACTION_DELAY_MS - 1);
  assert.equal(page.current().showRetryAction, false);
  advance(1);
  assert.equal(page.current().showRetryAction, true);
  page.unmount();
});

test("retries image errors with backoff before reporting failure", async () => {
  const page = await setup();
  for (const [delay, reloads] of [[1_000, 1], [2_000, 2], [4_000, 3]] as const) {
    act(() => page.current().reportImageError());
    assert.equal(page.current().hasFailed, false);
    advance(delay - 1);
    assert.equal(page.reloads(), reloads - 1);
    advance(1);
    assert.equal(page.reloads(), reloads);
  }
  act(() => page.current().reportImageError());
  assert.equal(page.current().hasFailed, true);
  assert.equal(page.reloads(), 3);
  page.unmount();
});

test("automatic retries do not hide the Try again button", async () => {
  const page = await setup();
  act(() => page.current().reportImageError());
  advance(1_000);
  advance(COMIC_IMAGE_RETRY_ACTION_DELAY_MS - 1_000);
  assert.equal(page.current().showRetryAction, true);
  page.unmount();
});

test("a manual retry reloads now, hides the button, and restores automatic retries", async () => {
  const page = await setup();
  advance(COMIC_IMAGE_RETRY_ACTION_DELAY_MS);
  for (let count = 0; count < 3; count += 1) {
    act(() => page.current().reportImageError());
    advance(10_000);
  }
  const reloadsBefore = page.reloads();
  act(() => page.current().retry());
  assert.equal(page.reloads(), reloadsBefore + 1);
  assert.equal(page.current().showRetryAction, false);
  act(() => page.current().reportImageError());
  assert.equal(page.current().hasFailed, false);
  advance(COMIC_IMAGE_RETRY_ACTION_DELAY_MS);
  assert.equal(page.current().showRetryAction, true);
  page.unmount();
});

test("a failed page retries once each time it scrolls back into view", async () => {
  const page = await setup();
  page.render({ hasLoadError: true });
  assert.equal(page.reloads(), 0);
  page.render({ isInView: false });
  assert.equal(page.reloads(), 0);
  page.render({ isInView: true });
  assert.equal(page.reloads(), 1);
  page.render({ isInView: true });
  assert.equal(page.reloads(), 1);
  page.unmount();
});

test("a page that failed while in view does not retry in a loop", async () => {
  const page = await setup();
  for (let count = 0; count < 3; count += 1) {
    act(() => page.current().reportImageError());
    advance(10_000);
  }
  const reloads = page.reloads();
  act(() => page.current().reportImageError());
  assert.equal(page.current().hasFailed, true);
  page.render();
  assert.equal(page.reloads(), reloads);
  page.unmount();
});

test("failed pages retry when the connection returns, and only while failed", async () => {
  const page = await setup();
  act(() => { window.dispatchEvent(new window.Event("online")); });
  assert.equal(page.reloads(), 0);
  page.render({ hasLoadError: true });
  act(() => { window.dispatchEvent(new window.Event("online")); });
  assert.equal(page.reloads(), 1);
  page.unmount();
});

test("a pending automatic retry is dropped when the page stops loading or changes", async () => {
  const page = await setup();
  act(() => page.current().reportImageError());
  page.render({ isPending: false });
  advance(10_000);
  assert.equal(page.reloads(), 0);

  page.render({ isPending: true });
  act(() => page.current().reportImageError());
  page.render({ href: "2.jpg" });
  advance(10_000);
  assert.equal(page.reloads(), 0);
  page.unmount();
});
