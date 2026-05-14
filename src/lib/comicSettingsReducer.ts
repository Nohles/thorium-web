import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export enum ComicReadingMode {
  default = "default",
  singlePage = "singlePage",
  doublePage = "doublePage",
  continuousVertical = "continuousVertical",
  continuousHorizontal = "continuousHorizontal",
  webtoon = "webtoon",
}

export enum ComicReadingDirection {
  ltr = "ltr",
  rtl = "rtl",
}

export enum ComicTapZones {
  default = "default",
  edge = "edge",
  kindle = "kindle",
  lShape = "lShape",
  rightAndLeft = "rightAndLeft",
  disabled = "disabled",
}

export enum ComicScaleType {
  fitWidth = "fitWidth",
  fitHeight = "fitHeight",
  fitScreen = "fitScreen",
  originalSize = "originalSize",
}

export enum ComicOverlayMode {
  auto = "auto",
  pinned = "pinned",
}

export enum ComicProgressBarType {
  hidden = "hidden",
  standard = "standard",
}

export enum ComicProgressBarPosition {
  auto = "auto",
  bottom = "bottom",
  left = "left",
  right = "right",
}

export interface ComicSettings {
  readingMode: ComicReadingMode;
  pageGapPx: number;
  direction: ComicReadingDirection;
  tapZones: ComicTapZones;
  scaleType: ComicScaleType;
  overlayMode: ComicOverlayMode;
  showPageNumber: boolean;
  staticNavigation: boolean;
  progressBarType: ComicProgressBarType;
  progressBarSizePx: number;
  progressBarPosition: ComicProgressBarPosition;
  stretchSmallPages: boolean;
  /** When false, the page column uses full reader width (slider ignored). */
  widthLimitEnabled: boolean;
  widthLimitPercent: number;
  scrollAmountPercent: number;
  autoScrollEnabled: boolean;
  autoScrollSpeedSeconds: number;
  autoScrollSmooth: boolean;
  readingModePreview: boolean;
  tapZonePreview: boolean;
  imagePreloadAmount: number;
  /** When true and the manifest TOC defines multiple segments, navigation stays within the current chapter until explicit next/previous chapter. */
  comicChapterBoundaries: boolean;
}

export const defaultComicSettings: ComicSettings = {
  readingMode: ComicReadingMode.default,
  pageGapPx: 5,
  direction: ComicReadingDirection.ltr,
  tapZones: ComicTapZones.default,
  scaleType: ComicScaleType.originalSize,
  overlayMode: ComicOverlayMode.auto,
  showPageNumber: true,
  staticNavigation: false,
  progressBarType: ComicProgressBarType.standard,
  progressBarSizePx: 4,
  progressBarPosition: ComicProgressBarPosition.auto,
  stretchSmallPages: false,
  widthLimitEnabled: false,
  widthLimitPercent: 50,
  scrollAmountPercent: 95,
  autoScrollEnabled: false,
  autoScrollSpeedSeconds: 5,
  autoScrollSmooth: true,
  readingModePreview: true,
  tapZonePreview: false,
  imagePreloadAmount: 5,
  comicChapterBoundaries: false,
};

export interface ComicSettingsReducerState {
  activeKey: string | null;
  byKey: Record<string, ComicSettings>;
}

const initialState: ComicSettingsReducerState = {
  activeKey: null,
  byKey: {},
};

export type LegacyComicSettings = Partial<ComicSettings> & Record<string, unknown>;

const LEGACY_DEFAULT_SCALE = "default" as const;

export const normalizeComicScaleType = (raw: unknown): ComicScaleType => {
  if (raw === LEGACY_DEFAULT_SCALE) {
    return ComicScaleType.originalSize;
  }
  if (
    typeof raw === "string" &&
    (Object.values(ComicScaleType) as string[]).includes(raw)
  ) {
    return raw as ComicScaleType;
  }
  return defaultComicSettings.scaleType;
};

export const normalizeComicSettings = (entry?: LegacyComicSettings): ComicSettings => {
  if (!entry) {
    return { ...defaultComicSettings };
  }
  const widthLimitEnabled =
    typeof entry.widthLimitEnabled === "boolean"
      ? entry.widthLimitEnabled
      : defaultComicSettings.widthLimitEnabled;
  const widthLimitPercent =
    typeof entry.widthLimitPercent === "number"
      ? entry.widthLimitPercent
      : defaultComicSettings.widthLimitPercent;
  const scaleType = normalizeComicScaleType(entry.scaleType);
  return {
    ...defaultComicSettings,
    ...(entry as ComicSettings),
    scaleType,
    widthLimitEnabled,
    widthLimitPercent,
  };
};

const ensureKey = (state: ComicSettingsReducerState, key: string): ComicSettings => {
  if (!state.byKey[key]) {
    state.byKey[key] = { ...defaultComicSettings };
  } else {
    state.byKey[key] = normalizeComicSettings(state.byKey[key] as LegacyComicSettings);
  }
  return state.byKey[key];
};

export const comicSettingsSlice = createSlice({
  name: "comicSettings",
  initialState,
  reducers: {
    setComicActiveKey: (state, action: PayloadAction<string | null>) => {
      state.activeKey = action.payload;
      if (action.payload) ensureKey(state, action.payload);
    },
    updateComicSettings: (
      state,
      action: PayloadAction<{ key: string; patch: Partial<ComicSettings> }>
    ) => {
      const { key, patch } = action.payload;
      const current = ensureKey(state, key);
      state.byKey[key] = normalizeComicSettings({ ...current, ...patch });
    },
    resetComicSettings: (state, action: PayloadAction<{ key: string }>) => {
      const { key } = action.payload;
      state.byKey[key] = { ...defaultComicSettings };
    },
  },
});

export const { setComicActiveKey, updateComicSettings, resetComicSettings } =
  comicSettingsSlice.actions;

export default comicSettingsSlice.reducer;

