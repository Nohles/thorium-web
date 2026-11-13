"use client";

const BACKWARD_ARROW = "M347.39-126.77q-61.85-26.77-107.85-72.77-46-46-72.77-107.85Q140-369.23 140-440h60q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-10.62l63.54 63.54-42.15 43.38-136.92-137.3 137.69-137.31 42.15 43.38L469.38-780H480q70.77 0 132.61 26.77 61.85 26.77 107.85 72.77 46 46 72.77 107.85Q820-510.77 820-440q0 70.77-26.77 132.61-26.77 61.85-72.77 107.85-46 46-107.85 72.77Q550.77-100 480-100q-70.77 0-132.61-26.77Z";
const FORWARD_ARROW = "M347.39-126.77q-61.85-26.77-107.85-72.77-46-46-72.77-107.85Q140-369.23 140-440q0-70.77 26.77-132.61 26.77-61.85 72.77-107.85 46-46 107.85-72.77Q409.23-780 480-780h10.62l-64.31-64.31 42.15-43.38 137.69 137.31-136.92 137.3-42.15-43.38L490.62-720H480q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440h60q0 70.77-26.77 132.61-26.77 61.85-72.77 107.85-46 46-107.85 72.77Q550.77-100 480-100q-70.77 0-132.61-26.77Z";

/**
 * The skip arrow with its length written inside, for lengths without a
 * drawn glyph (15 or 60 seconds, say).
 */
export const SkipIntervalGlyph = ({
  direction,
  seconds,
}: {
  direction: "backward" | "forward";
  seconds: number;
}) => (
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="inherit" aria-hidden="true" focusable="false">
    <path d={ direction === "backward" ? BACKWARD_ARROW : FORWARD_ARROW } />
    <text
      x="480"
      y="-355"
      textAnchor="middle"
      fontSize={ seconds >= 100 ? 190 : 250 }
      fontWeight="700"
      fontFamily="system-ui, sans-serif"
    >
      { seconds }
    </text>
  </svg>
);
