import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  AudioBookClockNavigator,
  AudioTrackLink,
  audioBookClock,
  chapterEndAt,
  chapterIndexAt,
  seekBookTime,
  formatTimeLeft,
  locateBookTime,
  progressChapters,
  progressTracks,
  progressWindow,
  trackOffsets,
  trackStartTitles,
} from "./progressScope";

describe("progressScope", () => {
  test("a single file with timed chapters spans the whole book", () => {
    const tracks = progressTracks([{ href: "book.m4b", duration: 600 }], 0, 0);
    const offsets = trackOffsets(tracks)!;
    const chapters = progressChapters(
      [{
        title: "Book",
        references: ["book.m4b"],
        children: [
          { title: "One", references: ["book.m4b#t=0"] },
          { title: "Two", references: ["book.m4b#t=200"] },
          { title: "Three", references: ["book.m4b#t=450"] },
        ],
      }],
      tracks,
      offsets,
    );
    assert.deepEqual(chapters.map(c => c.start), [0, 200, 450]);
    assert.deepEqual(progressWindow("chapter", chapters, 300, 600), { start: 200, end: 450 });
    assert.deepEqual(progressWindow("chapter", chapters, 500, 600), { start: 450, end: 600 });
    assert.deepEqual(progressWindow("book", chapters, 300, 600), { start: 0, end: 600 });
  });

  test("a track per chapter adds earlier tracks to the book clock", () => {
    const tracks = progressTracks(
      [{ href: "01.mp3", duration: 100 }, { href: "02.mp3" }, { href: "03.mp3", duration: 50 }],
      1,
      80,
    );
    const offsets = trackOffsets(tracks)!;
    assert.deepEqual(offsets, [0, 100, 180]);
    const chapters = progressChapters(
      [
        { title: "One", references: ["01.mp3"] },
        { title: "Two", references: ["02.mp3"] },
        { title: "Three", references: ["03.mp3"] },
      ],
      tracks,
      offsets,
    );
    assert.deepEqual(progressWindow("chapter", chapters, 150, 230), { start: 100, end: 180 });
    assert.deepEqual(locateBookTime(tracks, offsets, 200), { trackIndex: 2, time: 20 });
    assert.deepEqual(locateBookTime(tracks, offsets, 100), { trackIndex: 1, time: 0 });
  });

  test("an unknown track length leaves no book clock", () => {
    const tracks = progressTracks([{ href: "01.mp3" }, { href: "02.mp3" }], 0, 90);
    assert.equal(trackOffsets(tracks), null);
  });

  test("intro audio before a track's first child counts as its own chapter", () => {
    const tracks = progressTracks([{ href: "a.mp3", duration: 300 }], 0, 0);
    const chapters = progressChapters(
      [{ title: "Intro", references: ["a.mp3"], children: [{ title: "One", references: ["a.mp3#t=30"] }] }],
      tracks,
      trackOffsets(tracks)!,
    );
    assert.deepEqual(chapters, [{ title: "Intro", start: 0 }, { title: "One", start: 30 }]);
  });

  test("a table of contents entry at a track's start names its first chapter", () => {
    const tracks = progressTracks([{ href: "Saga%20One.m4b", duration: 300 }], 0, 0);
    const titles = trackStartTitles([
      { href: "Saga%20One.m4b", title: "Prologue" },
      { href: "Saga%20One.m4b#t=60", title: "Middle" },
    ]);
    const chapters = progressChapters(
      [{ title: "Saga One", references: ["Saga%20One.m4b"], children: [{ title: "Middle", references: ["Saga%20One.m4b#t=60"] }] }],
      tracks,
      trackOffsets(tracks)!,
      titles,
    );
    assert.deepEqual(chapters, [{ title: "Prologue", start: 0 }, { title: "Middle", start: 60 }]);
  });

  test("a seek that lands just short of a chapter start counts as that chapter", () => {
    const chapters = [{ start: 0 }, { start: 100 }];
    assert.equal(chapterIndexAt(chapters, 99.7), 1);
    assert.equal(chapterIndexAt(chapters, 98), 0);
  });

  test("time left reads in hours and minutes", () => {
    assert.equal(formatTimeLeft(5 * 3600 + 12 * 60 + 40), "5h 12m");
    assert.equal(formatTimeLeft(3600), "1h");
    assert.equal(formatTimeLeft(48 * 60), "48m");
    assert.equal(formatTimeLeft(20), "<1m");
  });
});

function fakeNavigator(
  links: AudioTrackLink[],
  current: { href: string; time: number },
  children: Record<string, { title: string; at: number }[]> = {},
) {
  const items = links.map(link => ({
    title: link.title,
    references: [link.href],
    children: children[link.href]?.map(child => ({ title: child.title, references: [`${ link.href }#t=${ child.at }`] })),
  }));
  const calls: { seek: number[]; go: unknown[] } = { seek: [], go: [] };
  const navigator: AudioBookClockNavigator = {
    currentTime: () => current.time,
    duration: () => links.find(link => link.href === current.href)?.duration ?? 0,
    seek: time => { calls.seek.push(time); },
    go: locator => { calls.go.push(locator); },
    currentLocator: () => ({ href: current.href }),
    timeline: () => ({ items, linkFor: (item: unknown) => links[items.indexOf(item as typeof items[number])] }),
  };
  return { navigator, calls };
}

describe("audioBookClock", () => {
  test("adds earlier tracks to the position and seeks across tracks", () => {
    const { navigator, calls } = fakeNavigator(
      [{ href: "01.mp3", title: "One", duration: 100 }, { href: "02.mp3", title: "Two", duration: 200 }],
      { href: "02.mp3", time: 50 },
    );
    const clock = audioBookClock(navigator)!;
    assert.equal(clock.position, 150);
    assert.equal(clock.total, 300);
    assert.equal(chapterEndAt(clock, clock.position), 300);
    seekBookTime(navigator, clock, 180);
    assert.deepEqual(calls.seek, [80]);
    seekBookTime(navigator, clock, 40);
    assert.equal((calls.go[0] as { href: string }).href, "01.mp3");
    assert.deepEqual((calls.go[0] as { locations: unknown }).locations, { fragments: ["t=40"] });
  });

  test("finds a chapter's end inside one file", () => {
    const { navigator } = fakeNavigator(
      [{ href: "book.m4b", duration: 1000 }],
      { href: "book.m4b", time: 420 },
      { "book.m4b": [{ title: "One", at: 0 }, { title: "Two", at: 400 }, { title: "Three", at: 700 }] },
    );
    const clock = audioBookClock(navigator)!;
    assert.equal(chapterEndAt(clock, clock.position), 700);
  });

  test("has no clock while a track length is unknown", () => {
    const { navigator } = fakeNavigator([{ href: "01.mp3" }, { href: "02.mp3" }], { href: "02.mp3", time: 5 });
    assert.equal(audioBookClock(navigator), null);
  });
});
