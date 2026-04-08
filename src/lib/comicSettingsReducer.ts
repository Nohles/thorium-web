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

export interface ComicSettings {
  readingMode: ComicReadingMode;
  pageGapPx: number;
  direction: ComicReadingDirection;
  tapZones: ComicTapZones;
  invertTapZones: ComicInvertTapZones;
  scaleType: ComicScaleType;
}

export const defaultComicSettings: ComicSettings = {
  readingMode: ComicReadingMode.default,
  pageGapPx: 5,
  direction: ComicReadingDirection.ltr,
  tapZones: ComicTapZones.default,
  invertTapZones: ComicInvertTapZones.default,
  scaleType: ComicScaleType.default,
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

