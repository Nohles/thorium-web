import type { SerializedLocator } from "./serializePositions";

export interface PositionEntry {
  positionRange?: [number, number?];
}

// Extracted from the progress hook so range behavior and scale can be checked
// without constructing a navigator or mounting React.
export function publicationPositionEntries(
  readingOrder: readonly { href: string }[],
  positionsList?: readonly SerializedLocator[]
): Map<string, PositionEntry> {
  const entries = new Map<string, PositionEntry>();
  if (!positionsList?.length) return entries;
  // Track both endpoints in one pass. A scan per chapter turns large books
  // into readingOrder.length * positionsList.length comparisons on the UI thread.
  const ranges = new Map<string, { first: SerializedLocator; last: SerializedLocator }>();
  for (const position of positionsList) {
    const href = position.href;
    const range = ranges.get(href);
    if (!range) {
      ranges.set(href, { first: position, last: position });
      continue;
    }
    const value = position.locations?.position || 0;
    // Preserve the previous stable sort's first/last behavior for missing
    // positions (ranked as zero) and equal positions.
    if (value < (range.first.locations?.position || 0)) range.first = position;
    if (value >= (range.last.locations?.position || 0)) range.last = position;
  }
  for (const item of readingOrder) {
    const range = ranges.get(item.href);
    if (!range) continue;
    const start = range.first.locations;
    const end = range.last.locations;
    entries.set(item.href, {
      positionRange: start?.position !== undefined ? [start.position, end?.position] : undefined
    });
  }
  return entries;
}
