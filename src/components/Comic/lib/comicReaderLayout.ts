import { CSSProperties } from "react";
import { ComicScaleType } from "@/lib/comicSettingsReducer";

export type ComicPageLayoutMode = "viewportBound" | "verticalStack";

const assertNever = (x: never): never => {
  throw new Error(`Unhandled ComicScaleType: ${String(x)}`);
};

/** Slider / stored value: 10–100 when the limit is used. */
export const clampWidthLimitPercent = (percent: number): number => {
  if (!Number.isFinite(percent) || percent <= 0) return 100;
  return Math.min(100, Math.max(10, percent));
};

export const isReaderWidthEditable = (scaleType: ComicScaleType): boolean =>
  scaleType === ComicScaleType.fitWidth || scaleType === ComicScaleType.fitScreen;

export const shouldApplyReaderWidth = (
  widthLimitEnabled: boolean,
  widthLimitPercent: number,
  scaleType: ComicScaleType
): boolean =>
  widthLimitEnabled &&
  isReaderWidthEditable(scaleType) &&
  clampWidthLimitPercent(widthLimitPercent) > 0;

/**
 * When width limit applies, returns the clamped percentage (10–100) for placeholders and sizing.
 */
export const getSetReaderWidth = (
  widthLimitEnabled: boolean,
  widthLimitPercent: number,
  scaleType: ComicScaleType
): number | undefined => {
  if (!shouldApplyReaderWidth(widthLimitEnabled, widthLimitPercent, scaleType)) {
    return undefined;
  }
  return clampWidthLimitPercent(widthLimitPercent);
};

export const isWidthDrivenScaleMode = (scaleType: ComicScaleType): boolean =>
  scaleType === ComicScaleType.fitWidth || scaleType === ComicScaleType.fitScreen;

export const isHeightDrivenScaleMode = (scaleType: ComicScaleType): boolean =>
  scaleType === ComicScaleType.fitHeight;

/**
 * Fraction of the reader content width for this page cell (0–1).
 * When limit applies: single = value/100; double = value/100/2.
 * When limit off: single = 1; double = 0.5 each.
 */
export const getPageWidthFraction = (
  widthLimitEnabled: boolean,
  widthLimitPercent: number,
  scaleType: ComicScaleType,
  isDoublePageCell: boolean
): number => {
  if (shouldApplyReaderWidth(widthLimitEnabled, widthLimitPercent, scaleType)) {
    const p = clampWidthLimitPercent(widthLimitPercent) / 100;
    return isDoublePageCell ? p / 2 : p;
  }
  return isDoublePageCell ? 0.5 : 1;
};

export const stretchAllowedForScale = (scaleType: ComicScaleType): boolean =>
  scaleType !== ComicScaleType.originalSize;

export const getReaderDimensionStyling = (
  scale: ComicScaleType,
  layoutMode: ComicPageLayoutMode
): Pick<CSSProperties, "maxWidth" | "maxHeight" | "minWidth" | "minHeight" | "width" | "height"> => {
  const inScrollStack = layoutMode === "verticalStack";
  /** Single-page / horizontal cell: bound to the flex viewport. Vertical scroll list: no image max-height — capping to 100dvh makes tall pages shrink in width under object-fit: contain. */
  const capHeight = inScrollStack ? ({} as const) : ({ maxHeight: "100%" } as const);

  switch (scale) {
    case ComicScaleType.fitWidth:
      return {
        width: "100%",
        height: "auto",
        maxWidth: "100%",
        ...capHeight,
      };
    case ComicScaleType.fitHeight:
      return {
        ...capHeight,
        width: "auto",
        height: "auto",
        maxWidth: "100%",
        ...(inScrollStack ? { maxHeight: "100dvh" } : {}),
      };
    case ComicScaleType.originalSize:
      return {
        width: "auto",
        height: "auto",
        maxWidth: "100%",
        ...capHeight,
      };
    case ComicScaleType.fitScreen:
      return {
        maxWidth: "100%",
        width: "auto",
        height: "auto",
        ...capHeight,
        ...(!inScrollStack ? { maxHeight: "100dvh" } : {}),
      };
    default:
      return assertNever(scale);
  }
};

export const getReaderImageStyling = (
  scale: ComicScaleType,
  shouldStretch: boolean,
  layoutMode: ComicPageLayoutMode
): CSSProperties => {
  const base: CSSProperties = {
    objectFit: "contain",
  };

  if (shouldStretch) {
    return {
      ...base,
      width: "100%",
      height: "auto",
      maxWidth: "100%",
    };
  }

  return {
    ...base,
    ...getReaderDimensionStyling(scale, layoutMode),
  };
};

export const getImagePlaceholderStyling = (
  scale: ComicScaleType,
  shouldStretch: boolean,
  layoutMode: ComicPageLayoutMode,
  aspectRatio?: number
): CSSProperties => {
  const img = getReaderImageStyling(scale, shouldStretch, layoutMode);
  const inScrollStack = layoutMode === "verticalStack";
  /** With a known aspect ratio the frame reserves the eventual page height — don't force a viewport-height minimum. */
  const hasKnownGeometry = inScrollStack && Number.isFinite(aspectRatio) && (aspectRatio ?? 0) > 0;
  const minH = inScrollStack ? "100dvh" : "50%";
  return {
    ...img,
    minHeight: hasKnownGeometry
      ? undefined
      : inScrollStack || scale !== ComicScaleType.originalSize
        ? minH
        : "4rem",
    minWidth: scale === ComicScaleType.fitHeight ? "4rem" : undefined,
    background: "color-mix(in srgb, var(--th-theme-text, #fff) 8%, transparent)",
  };
};
