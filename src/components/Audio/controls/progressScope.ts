/**
 * Maps the audio player's per-track clock onto the span the progress bar
 * shows: the whole book, or the chapter playing now.
 *
 * The navigator only knows the current track's time. A single-file audiobook
 * has one track holding every chapter, while a multi-file one usually has a
 * track per chapter, so neither "track" reading is the book or the chapter.
 * Everything here works in book seconds: the time from the start of the first
 * track.
 */

export type AudioProgressScope = "book" | "chapter";

export const defaultAudioProgressScope: AudioProgressScope = "chapter";

export function isAudioProgressScope(value: unknown): value is AudioProgressScope {
  return value === "book" || value === "chapter";
}

export interface AudioProgressTrack {
  href: string;
  /** Seconds; 0 when the manifest does not say. */
  duration: number;
}

/** Where a chapter starts, in book seconds. */
export interface AudioProgressChapter {
  title?: string;
  start: number;
}

/** The span of book seconds the bar covers. */
export interface AudioProgressWindow {
  start: number;
  end: number;
}

/** The parts of a Readium timeline item this module reads. */
export interface AudioTimelineItemLike {
  title?: string;
  references: string[];
  children?: AudioTimelineItemLike[];
}

const TIME_FRAGMENT = /(?:^|[#&])t=(\d+(?:\.\d+)?)/;

function bareHref(href: string) {
  return href.split("#")[0];
}

function fragmentStart(reference: string): number {
  const hash = reference.indexOf("#");
  if (hash < 0) return 0;
  const match = TIME_FRAGMENT.exec(reference.slice(hash));
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Track durations, with the playing track's measured length filling in for a
 * manifest that leaves it out.
 */
export function progressTracks(
  readingOrder: { href: string; duration?: number }[],
  currentIndex: number,
  currentDuration: number,
): AudioProgressTrack[] {
  return readingOrder.map((link, index) => {
    const declared = typeof link.duration === "number" && link.duration > 0 ? link.duration : 0;
    const measured = index === currentIndex && currentDuration > 0 ? currentDuration : 0;
    return { href: bareHref(link.href), duration: measured || declared };
  });
}

/** Start of each track in book seconds, or null if any length is unknown. */
export function trackOffsets(tracks: AudioProgressTrack[]): number[] | null {
  const offsets: number[] = [];
  let total = 0;
  for (const track of tracks) {
    if (!(track.duration > 0)) return null;
    offsets.push(total);
    total += track.duration;
  }
  return offsets;
}

/** The parts of a table of contents link this module reads. */
export interface AudioTocLinkLike {
  href: string;
  title?: string;
  children?: { items: AudioTocLinkLike[] };
}

/**
 * Titles of table of contents entries that point at the start of a track.
 * Readium leaves those out of a track's timed children, so a chapter at 0:00
 * would otherwise take the file's own title.
 */
export function trackStartTitles(tocLinks: AudioTocLinkLike[] = []): Map<string, string> {
  const titles = new Map<string, string>();
  const visit = (links: AudioTocLinkLike[]) => {
    for (const link of links) {
      const href = decodeHref(bareHref(link.href));
      if (link.title && !titles.has(href) && fragmentStart(link.href) === 0) {
        titles.set(href, link.title);
      }
      if (link.children?.items?.length) visit(link.children.items);
    }
  };
  visit(tocLinks);
  return titles;
}

function decodeHref(href: string) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/**
 * Chapter starts in book seconds, ascending. A track with timed children
 * contributes each child; a track without contributes its own start.
 */
export function progressChapters(
  items: AudioTimelineItemLike[],
  tracks: AudioProgressTrack[],
  offsets: number[],
  startTitles: Map<string, string> = new Map(),
): AudioProgressChapter[] {
  const chapters: AudioProgressChapter[] = [];
  for (const item of items) {
    const href = bareHref(item.references[0] ?? "");
    const trackIndex = tracks.findIndex(track => track.href === href);
    if (trackIndex < 0) continue;
    const offset = offsets[trackIndex];
    const startTitle = startTitles.get(decodeHref(href)) ?? item.title;
    const children = item.children ?? [];
    if (children.length === 0) {
      chapters.push({ title: startTitle, start: offset });
      continue;
    }
    // Audio before the first child still belongs to the track's own title.
    const firstChildStart = Math.min(...children.map(child => fragmentStart(child.references[0] ?? "")));
    if (firstChildStart > 0) chapters.push({ title: startTitle, start: offset });
    for (const child of children) {
      chapters.push({ title: child.title, start: offset + fragmentStart(child.references[0] ?? "") });
    }
  }
  chapters.sort((a, b) => a.start - b.start);
  return chapters.filter((chapter, index) => index === 0 || chapter.start > chapters[index - 1].start);
}

/** Index of the chapter playing at `position`, or -1 before the first. */
export function chapterIndexAt(chapters: AudioProgressChapter[], position: number): number {
  let found = -1;
  for (let index = 0; index < chapters.length; index++) {
    // Half a second of slack: a seek to a chapter start can land just short.
    if (chapters[index].start <= position + 0.5) found = index;
    else break;
  }
  return found;
}

export function progressWindow(
  scope: AudioProgressScope,
  chapters: AudioProgressChapter[],
  position: number,
  total: number,
): AudioProgressWindow {
  if (scope === "book" || chapters.length === 0) return { start: 0, end: total };
  const index = chapterIndexAt(chapters, position);
  if (index < 0) return { start: 0, end: chapters[0].start || total };
  return {
    start: chapters[index].start,
    end: chapters[index + 1]?.start ?? total,
  };
}

/** The track holding book second `seconds`, and the time inside it. */
export function locateBookTime(
  tracks: AudioProgressTrack[],
  offsets: number[],
  seconds: number,
): { trackIndex: number; time: number } {
  let trackIndex = 0;
  for (let index = 0; index < offsets.length; index++) {
    if (offsets[index] <= seconds) trackIndex = index;
    else break;
  }
  const time = Math.max(0, Math.min(tracks[trackIndex].duration, seconds - offsets[trackIndex]));
  return { trackIndex, time };
}

/** "5h 12m", "48m", or "under 1m". */
export function formatTimeLeft(seconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${ hours }h ${ minutes }m` : `${ hours }h`;
  if (minutes > 0) return `${ minutes }m`;
  return "<1m";
}

/** The parts of the audio navigator the book clock reads and drives. */
export interface AudioBookClockNavigator {
  currentTime: () => number;
  duration: () => number;
  seek: (time: number) => void;
  go: (locator: any, animated: boolean, callback: (ok: boolean) => void) => void;
  currentLocator: () => { href: string } | undefined;
  timeline: () =>
    | {
        items: AudioTimelineItemLike[];
        linkFor: (item: any) => AudioTrackLink | undefined;
        tocLinks?: AudioTocLinkLike[];
      }
    | undefined;
}

export interface AudioTrackLink {
  href: string;
  type?: string;
  title?: string;
  duration?: number;
}

/** Every track laid end to end, in book seconds. */
export interface AudioBookClock {
  links: AudioTrackLink[];
  tracks: AudioProgressTrack[];
  offsets: number[];
  chapters: AudioProgressChapter[];
  /** The playing track's index in `links`. */
  trackIndex: number;
  position: number;
  total: number;
}

export function audioTrackLinks(navigator: AudioBookClockNavigator): AudioTrackLink[] {
  const timeline = navigator.timeline();
  if (!timeline) return [];
  return timeline.items
    .map(item => timeline.linkFor(item))
    .filter((link): link is AudioTrackLink => link !== undefined);
}

/**
 * The book clock for the navigator's current position, or null until every
 * track's length is known.
 */
export function audioBookClock(navigator: AudioBookClockNavigator): AudioBookClock | null {
  const timeline = navigator.timeline();
  const locator = navigator.currentLocator();
  if (!timeline || !locator) return null;
  const links = audioTrackLinks(navigator);
  const trackIndex = links.findIndex(link => bareHref(link.href) === bareHref(locator.href));
  if (trackIndex < 0) return null;
  const tracks = progressTracks(links, trackIndex, navigator.duration());
  const offsets = trackOffsets(tracks);
  if (!offsets) return null;
  return {
    links,
    tracks,
    offsets,
    chapters: progressChapters(timeline.items, tracks, offsets, trackStartTitles(timeline.tocLinks)),
    trackIndex,
    position: offsets[trackIndex] + navigator.currentTime(),
    total: tracks.reduce((sum, track) => sum + track.duration, 0),
  };
}

/** Where the chapter playing at `position` ends, in book seconds. */
export function chapterEndAt(clock: Pick<AudioBookClock, "chapters" | "total">, position: number): number {
  const index = chapterIndexAt(clock.chapters, position);
  return clock.chapters[index + 1]?.start ?? clock.total;
}

/** Moves to a time inside a track, loading that track first if it isn't playing. */
export function goToTrackTime(
  navigator: AudioBookClockNavigator,
  link: AudioTrackLink,
  seconds: number,
) {
  const current = navigator.currentLocator();
  if (current && bareHref(current.href) === bareHref(link.href)) {
    navigator.seek(seconds);
    return;
  }
  navigator.go(
    {
      href: link.href,
      type: link.type ?? "audio/mpeg",
      title: link.title,
      locations: { fragments: [`t=${ seconds }`] },
    },
    false,
    () => {},
  );
}

/** Moves playback to a book second. */
export function seekBookTime(
  navigator: AudioBookClockNavigator,
  clock: Pick<AudioBookClock, "links" | "tracks" | "offsets" | "total">,
  seconds: number,
) {
  const target = Math.max(0, Math.min(clock.total, seconds));
  const { trackIndex, time } = locateBookTime(clock.tracks, clock.offsets, target);
  const link = clock.links[trackIndex];
  if (link) goToTrackTime(navigator, link, time);
}
