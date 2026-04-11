"use client";

import { ComicReadingDirection, ComicTapZones } from "@/lib/comicSettingsReducer";

export const resolveTapAction = (params: {
  x: number;
  y: number;
  zones: ComicTapZones;
  direction: ComicReadingDirection;
}): "prev" | "next" | "toggle" => {
  const { x, y, zones, direction } = params;

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
      // Horizontal thirds: outer columns turn pages (full height); middle opens menu in auto-overlay mode.
      if (x < 1 / 3) return sideToAction("left");
      if (x > 2 / 3) return sideToAction("right");
      return "toggle";
    case ComicTapZones.lShape: {
      const bottom = y > 0.75;
      if (x < 0.2 || (bottom && x < 0.5)) return sideToAction("left");
      if (x > 0.8 || (bottom && x >= 0.5)) return sideToAction("right");
      return "toggle";
    }
    case ComicTapZones.default:
    default:
      if (x < 1 / 3) return sideToAction("left");
      if (x > 2 / 3) return sideToAction("right");
      return "toggle";
  }
};
