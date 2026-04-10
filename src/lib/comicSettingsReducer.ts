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

export enum ComicInvertTapZones {
  default = "default",
  none = "none",
  horizontal = "horizontal",
  vertical = "vertical",
  both = "both",
}

export enum ComicScaleType {
  default = "default",
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
  invertTapZones: ComicInvertTapZones;
  scaleType: ComicScaleType;
  overlayMode: ComicOverlayMode;
  showPageNumber: boolean;
  staticNavigation: boolean;
  progressBarType: ComicProgressBarType;
  progressBarSizePx: number;
  progressBarPosition: ComicProgressBarPosition;
  stretchSmallPages: boolean;
  widthLimitEnabled: boolean;
  widthLimitPercent: number;
  scrollAmountPercent: number;
  autoScrollEnabled: boolean;
  autoScrollSpeedSeconds: number;
  autoScrollSmooth: boolean;
  readingModePreview: boolean;
  tapZonePreview: boolean;
  imagePreloadAmount: number;
}

export const defaultComicSettings: ComicSettings = {
  readingMode: ComicReadingMode.default,
  pageGapPx: 5,
  direction: ComicReadingDirection.ltr,
  tapZones: ComicTapZones.default,
  invertTapZones: ComicInvertTapZones.default,
  scaleType: ComicScaleType.default,
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
  tapZonePreview: true,
  imagePreloadAmount: 5,
};

export interface ComicSettingsReducerState {
  activeKey: string | null;
  byKey: Record<string, ComicSettings>;
}

const initialState: ComicSettingsReducerState = {
  activeKey: null,
  byKey: {},
};

const ensureKey = (state: ComicSettingsReducerState, key: string): ComicSettings => {
  if (!state.byKey[key]) {
    state.byKey[key] = { ...defaultComicSettings };
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
      state.byKey[key] = { ...current, ...patch };
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

