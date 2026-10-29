import { describe, expect, test } from "bun:test";
import { ensureNavigatorFrameListeners } from "./ReaderInteractions";

type Listener = (key: string, data: unknown) => void;

// FrameComms flushes buffered events synchronously when its listener is set.
// Reproduce that lifecycle at the real bridge helper, including pooled frames
// that have completed loading before the navigator publishes its current frame.
const message = (buffer: [string, unknown][] = []) => ({
  _listener: undefined as Listener | undefined,
  buffer,
  send() {},
  set listener(listener: Listener) {
    for (const [key, data] of this.buffer) listener(key, data);
    this.buffer = [];
    this._listener = listener;
  },
});

describe("ensureNavigatorFrameListeners", () => {
  test("leaves pooled lifecycle events buffered until the frame is current", () => {
    const frame = { msg: message([["_pong", undefined]]) };
    const frames: object[] = [];
    const seen: string[] = [];
    const navigator = {
      _cframes: frames,
      pool: { pool: new Map([["chapter.xhtml", frame]]) },
      eventListener(key: string) {
        if (!frames[0]) throw Error("Readium has no current iframe");
        seen.push(key);
      },
    };

    expect(ensureNavigatorFrameListeners(navigator)).toBe(false);
    expect(frame.msg.buffer).toEqual([["_pong", undefined]]);
    frames.push(frame);
    expect(ensureNavigatorFrameListeners(navigator)).toBe(true);
    expect(seen).toEqual(["_pong"]);
    expect(frame.msg.buffer).toEqual([]);
  });

  test("attaches only to current frames and preserves native listeners", () => {
    const seen: object[] = [];
    const current = { msg: message([["_pong", undefined]]) };
    const hidden = { msg: message([["_pong", undefined]]) };
    const owned = { msg: message() };
    const native: Listener = () => {};
    owned.msg.listener = native;
    const navigator = {
      _cframes: [current, owned],
      pool: { pool: new Map([["a.xhtml", current], ["b.xhtml", hidden], ["c.xhtml", owned]]) },
      eventListener(_key: string, _data: unknown, source?: object) { seen.push(source!); },
    };

    expect(ensureNavigatorFrameListeners(navigator)).toBe(true);
    expect(seen).toEqual([current]);
    expect(hidden.msg._listener).toBeUndefined();
    expect(hidden.msg.buffer).toEqual([["_pong", undefined]]);
    expect(owned.msg._listener).toBe(native);
    expect(ensureNavigatorFrameListeners(navigator)).toBe(false);
  });

  test("stops forwarding when the frame leaves the current viewport", () => {
    const first = { msg: message() }, second = { msg: message([["_pong", undefined]]) };
    const seen: string[] = [];
    const navigator = {
      _cframes: [first],
      pool: { pool: new Map([["a.xhtml", first], ["b.xhtml", second]]) },
      eventListener(key: string) { seen.push(key); },
    };
    ensureNavigatorFrameListeners(navigator);
    navigator._cframes = [];
    first.msg._listener?.("_pong", undefined);
    navigator._cframes = [second];
    ensureNavigatorFrameListeners(navigator);
    expect(seen).toEqual(["_pong"]);
    first.msg._listener?.("progress", 0.5);
    expect(seen).toEqual(["_pong"]);
  });

  test("requires a live viewport and skips destroyed frames", () => {
    const frame = { msg: message(), isDestroyed: true };
    const navigator = {
      _cframes: [frame],
      pool: { pool: new Map([["a.xhtml", frame]]) },
      eventListener() { throw Error("Destroyed frame event"); },
    };
    expect(ensureNavigatorFrameListeners(navigator)).toBe(false);
    expect(ensureNavigatorFrameListeners({ eventListener() {}, pool: navigator.pool })).toBe(false);
  });
});
