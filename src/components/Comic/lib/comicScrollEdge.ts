export type ComicScrollEdge = "start" | "end";

const EDGE_TOLERANCE_PX = 2;

/** Which end of a continuous scroller is reached; null while between them or with nothing to scroll. */
export const getComicScrollEdge = ({
  position,
  viewportSize,
  contentSize,
}: {
  position: number;
  viewportSize: number;
  contentSize: number;
}): ComicScrollEdge | null => {
  const maxPosition = contentSize - viewportSize;
  if (maxPosition <= EDGE_TOLERANCE_PX) return null;
  if (position <= EDGE_TOLERANCE_PX) return "start";
  if (position >= maxPosition - EDGE_TOLERANCE_PX) return "end";
  return null;
};
