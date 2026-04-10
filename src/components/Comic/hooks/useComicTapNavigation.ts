"use client";

import {
  ComicInvertTapZones,
  ComicReadingDirection,
  ComicTapZones,
} from "@/lib/comicSettingsReducer";

export const applyInvertTapZones = (
  x: number,
  y: number,
  invert: ComicInvertTapZones
): { x: number; y: number } => {
  if (invert === ComicInvertTapZones.horizontal || invert === ComicInvertTapZones.both) x = 1 - x;
  if (invert === ComicInvertTapZones.vertical || invert === ComicInvertTapZones.both) y = 1 - y;
  return { x, y };
};

export const resolveTapAction = (params: {
  x: number;
  y: number;
  zones: ComicTapZones;
  direction: ComicReadingDirection;
}): "prev" | "next" | "toggle" => {
  const { x, y, zones, direction } = params;
  const isCenter = x >= 0.33 && x <= 0.66 && y >= 0.33 && y <= 0.66;
  if (isCenter) return "toggle";
  if (zones === ComicTapZones.disabled) return "toggle";

  const sideToAction = (side: "left" | "right") => {
    if (direction === ComicReadingDirection.rtl) {
      return side === "left" ? "next" : "prev";
    }
    return side === "left" ? "prev" : "next";
  };

  switch (zones) {
    case ComicTapZones.edge:
      if (x < 0.2) return sideToAction("left");
      if (x > 0.8) return sideToAction("right");
      return "toggle";
    case ComicTapZones.kindle:
    case ComicTapZones.rightAndLeft:
      return sideToAction(x < 0.5 ? "left" : "right");
    case ComicTapZones.lShape: {
      const bottom = y > 0.75;
      if (x < 0.2 || (bottom && x < 0.5)) return sideToAction("left");
      if (x > 0.8 || (bottom && x >= 0.5)) return sideToAction("right");
      return "toggle";
    }
    case ComicTapZones.default:
    default:
      if (x < 0.25) return sideToAction("left");
      if (x > 0.75) return sideToAction("right");
      return "toggle";
  }
};
