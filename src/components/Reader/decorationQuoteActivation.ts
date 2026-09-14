/**
 * Chooses which decoration a click/caret should activate from quote
 * positions in a block of text. Tightest containing range wins; a nearby
 * mention must not steal a click that landed on a shorter automatic mark.
 */

export interface DecorationQuoteCandidate {
  id: string;
  quote: string;
  before?: string;
  after?: string;
}

export interface DecorationQuoteHit {
  id: string;
  start: number;
  end: number;
  distance: number;
  source: "containing" | "painted" | "snap";
}

export interface PickDecorationQuoteHitOptions {
  /** Highlight ids stacked under the pointer, innermost/top first. */
  paintedIds?: readonly string[];
}

/** Max character distance used only when the pointer is in highlight padding. */
export const DECORATION_QUOTE_SNAP_CHARS = 2;

export function pickDecorationQuoteHit(
  candidates: readonly DecorationQuoteCandidate[],
  blockText: string,
  caretOffset: number,
  options: PickDecorationQuoteHitOptions = {},
): DecorationQuoteHit | null {
  const hits: DecorationQuoteHit[] = [];
  for (const candidate of candidates) {
    if (!candidate.quote) continue;
    let searchFrom = 0;
    while (true) {
      const start = blockText.indexOf(candidate.quote, searchFrom);
      if (start === -1) break;
      const end = start + candidate.quote.length;
      const hasBefore =
        !candidate.before ||
        blockText
          .slice(Math.max(0, start - candidate.before.length), start)
          .endsWith(candidate.before);
      const hasAfter =
        !candidate.after ||
        blockText
          .slice(end, end + candidate.after.length)
          .startsWith(candidate.after);
      if (!hasBefore || !hasAfter) {
        searchFrom = start + 1;
        continue;
      }
      const distance =
        caretOffset < start
          ? start - caretOffset
          : caretOffset > end
            ? caretOffset - end
            : 0;
      hits.push({
        id: candidate.id,
        start,
        end,
        distance,
        source: distance === 0 ? "containing" : "snap",
      });
      searchFrom = start + 1;
    }
  }

  const painted = options.paintedIds ?? [];
  const paintedSet = new Set(painted);
  const containing = hits.filter((hit) => hit.distance === 0);
  if (containing.length > 0) {
    return selectTightest(containing, paintedSet, "containing");
  }

  if (painted.length > 0) {
    const paintedHits = hits.filter((hit) => paintedSet.has(hit.id));
    if (paintedHits.length > 0) {
      const nearest = selectNearest(paintedHits, paintedSet);
      return { ...nearest, source: "painted" };
    }
    const paintedId = painted.find((id) =>
      candidates.some((candidate) => candidate.id === id),
    );
    if (paintedId) {
      return {
        id: paintedId,
        start: caretOffset,
        end: caretOffset,
        distance: 0,
        source: "painted",
      };
    }
  }

  const nearest = hits.length > 0 ? selectNearest(hits, paintedSet) : null;
  if (nearest && nearest.distance <= DECORATION_QUOTE_SNAP_CHARS) {
    return { ...nearest, source: "snap" };
  }
  return null;
}

function rangeLength(hit: DecorationQuoteHit): number {
  return hit.end - hit.start;
}

function selectTightest(
  hits: readonly DecorationQuoteHit[],
  painted: ReadonlySet<string>,
  source: DecorationQuoteHit["source"],
): DecorationQuoteHit {
  const ranked = [...hits].sort((left, right) => {
    const lengthDelta = rangeLength(left) - rangeLength(right);
    if (lengthDelta !== 0) return lengthDelta;
    const paintedDelta =
      Number(painted.has(right.id)) - Number(painted.has(left.id));
    if (paintedDelta !== 0) return paintedDelta;
    return 0;
  });
  return { ...ranked[0]!, source };
}

function selectNearest(
  hits: readonly DecorationQuoteHit[],
  painted: ReadonlySet<string>,
): DecorationQuoteHit {
  const ranked = [...hits].sort((left, right) => {
    if (left.distance !== right.distance) return left.distance - right.distance;
    const lengthDelta = rangeLength(left) - rangeLength(right);
    if (lengthDelta !== 0) return lengthDelta;
    const paintedDelta =
      Number(painted.has(right.id)) - Number(painted.has(left.id));
    if (paintedDelta !== 0) return paintedDelta;
    return 0;
  });
  return ranked[0]!;
}
