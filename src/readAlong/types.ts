import type { Locator } from "@readium/shared";

export type ReadAlongGranularity = "block" | "word";

export interface ReadAlongTextTarget {
  href: string;
  fragmentId?: string;
}

export interface ReadAlongSyncPoint {
  id: string;
  startTime: number;
  endTime?: number;
  audioHref: string;
  text: ReadAlongTextTarget;
  granularity: ReadAlongGranularity;
}

export interface ReadAlongSyncIndex {
  points: ReadAlongSyncPoint[];
  byAudioResource: Map<string, ReadAlongSyncPoint[]>;
}

export interface ReadAlongSyncPointMatch {
  point: ReadAlongSyncPoint;
  locator: Locator;
}
