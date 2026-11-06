import { describe, expect, spyOn, test } from "bun:test";
import { pushDecorationsToFrames, type ReaderDecorationInput } from "./ReaderInteractions";

const decoration = (id: string, href: string): ReaderDecorationInput => ({
  id,
  locator: { href, type: "application/xhtml+xml", locations: {}, text: { highlight: id } },
});

const frame = (acknowledges: () => boolean) => {
  const requests: { action: string; decoration?: { id: string } }[] = [];
  return {
    requests,
    msg: {
      send(_key: string, data: unknown, ack?: (ok: boolean) => void) {
        requests.push(data as (typeof requests)[number]);
        if (acknowledges()) ack?.(true);
      },
    },
  };
};

// Acks in these tests are synchronous. Advance only the timeout clock so a
// stalled pooled chapter can be retried without two seconds of real waiting.
async function pushWithTimeout(navigator: unknown, decorations: ReaderDecorationInput[]) {
  const clock = spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(2101);
  try {
    return await pushDecorationsToFrames(navigator, decorations);
  } finally {
    clock.mockRestore();
  }
}

describe("decoration sync across pooled chapter frames", () => {
  test("retries an unresponsive chapter without clearing the acknowledged visible chapter", async () => {
    const visible = frame(() => true);
    let ready = false;
    const adjacent = frame(() => ready);
    const navigator = { pool: { pool: new Map([["current.xhtml", visible], ["next.xhtml", adjacent]]) } };
    const decorations = [decoration("current term", "current.xhtml"), decoration("next term", "next.xhtml")];

    expect(await pushWithTimeout(navigator, decorations)).toBe(false);
    const initialRequests = visible.requests.length;
    ready = true;
    expect(await pushDecorationsToFrames(navigator, decorations)).toBe(true);
    expect(visible.requests.slice(initialRequests)).toEqual([]);
    expect(adjacent.requests.map(request => request.action)).toEqual(["add", "clear", "add"]);
  });

  test("keeps visible marks stable through repeated adjacent-chapter timeouts", async () => {
    const visible = frame(() => true);
    const adjacent = frame(() => false);
    const navigator = { pool: { pool: new Map([["current.xhtml", visible], ["next.xhtml", adjacent]]) } };
    const decorations = [decoration("current term", "current.xhtml"), decoration("next term", "next.xhtml")];

    for (let attempt = 0; attempt < 4; attempt++) {
      expect(await pushWithTimeout(navigator, decorations)).toBe(false);
    }
    expect(visible.requests.map(request => request.action)).toEqual(["add"]);
    expect(adjacent.requests.map(request => request.action)).toEqual([
      "add", "clear", "add", "clear", "add", "clear", "add",
    ]);
  });

  test("still updates and removes visible marks while an adjacent chapter is unresponsive", async () => {
    const visible = frame(() => true);
    const adjacent = frame(() => false);
    const navigator = { pool: { pool: new Map([["current.xhtml", visible], ["next.xhtml", adjacent]]) } };
    const current = decoration("current term", "current.xhtml");
    const next = decoration("next term", "next.xhtml");
    await pushWithTimeout(navigator, [current, next]);
    await pushWithTimeout(navigator, [{ ...current, style: { tint: "red" } }, next]);
    await pushWithTimeout(navigator, [next]);

    expect(visible.requests.map(request => request.action)).toEqual(["add", "update", "remove"]);
    expect(visible.requests.at(-1)?.decoration?.id).toBe(current.id);
  });

  test("preserves acknowledged frames when one frame explicitly rejects a request", async () => {
    const visible = frame(() => true);
    const rejected = { msg: { send(_key: string, _data: unknown, ack?: (ok: boolean) => void) { ack?.(false); } } };
    const navigator = { _cframes: [visible, rejected] };
    const decorations = [decoration("term", "current.xhtml")];
    expect(await pushWithTimeout(navigator, decorations)).toBe(false);
    expect(await pushWithTimeout(navigator, decorations)).toBe(false);
    expect(visible.requests.map(request => request.action)).toEqual(["add"]);
  });
});
