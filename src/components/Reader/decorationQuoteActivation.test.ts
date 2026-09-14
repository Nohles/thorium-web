import { describe, expect, test } from "bun:test";

import { pickDecorationQuoteHit } from "./decorationQuoteActivation";

const mention = {
  id: "mention:ned",
  quote: "Jon Snow",
  before: "said ",
  after: " was",
};

const automaticSnow = {
  id: "auto:snow",
  quote: "Snow",
  before: "Jon ",
  after: " was",
};

const automaticArya = {
  id: "auto:arya",
  quote: "Arya",
  before: "and ",
  after: " rode",
};

const block = "Ned said Jon Snow was coming, and Arya rode north.";
//             012345678901234567890123456789012345678901234567890
//             0         1         2         3         4

describe("pickDecorationQuoteHit", () => {
  test("clicking a shorter automatic quote inside a mention activates the automatic mark", () => {
    const snowStart = block.indexOf("Snow");
    const hit = pickDecorationQuoteHit(
      [mention, automaticSnow],
      block,
      snowStart + 1,
    );
    expect(hit?.id).toBe("auto:snow");
  });

  test("clicking the mention-only part of a longer phrase keeps the mention", () => {
    const jonStart = block.indexOf("Jon Snow");
    const hit = pickDecorationQuoteHit(
      [mention, automaticSnow],
      block,
      jonStart + 1,
    );
    expect(hit?.id).toBe("mention:ned");
  });

  test("clicking an adjacent automatic mark does not snap to a nearby mention", () => {
    const aryaStart = block.indexOf("Arya");
    const hit = pickDecorationQuoteHit(
      [mention, automaticArya],
      block,
      aryaStart + 1,
    );
    expect(hit?.id).toBe("auto:arya");
  });

  test("does not activate a mention several characters away from the caret", () => {
    const between = block.indexOf("coming");
    const hit = pickDecorationQuoteHit(
      [mention, automaticArya],
      block,
      between,
    );
    expect(hit).toBeNull();
  });

  test("activates a painted automatic mark when its quote is missing from the block", () => {
    const hit = pickDecorationQuoteHit(
      [{ id: "auto:snow", quote: "SNOW" }, mention],
      block,
      block.indexOf("coming"),
      { paintedIds: ["auto:snow"] },
    );
    expect(hit?.id).toBe("auto:snow");
  });
});
