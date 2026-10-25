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
  /** When true and the manifest TOC defines multiple segments, navigation stays within the current chapter until explicit next/previous chapter. */
  comicChapterBoundaries: boolean;
}

export const defaultComicSettings: ComicSettings = {
  readingMode: ComicReadingMode.default,
  pageGapPx: 0,
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
  comicChapterBoundaries: true,
};

/**
 * Settings that follow the publication rather than the reader: a manga and a
 * western comic need different reading directions. Everything else is shared.
 */
export const COMIC_PUBLICATION_SETTING_KEYS = ["direction"] as const;

export type ComicPublicationSettingKey = (typeof COMIC_PUBLICATION_SETTING_KEYS)[number];

export type ComicPublicationSettings = Pick<ComicSettings, ComicPublicationSettingKey>;

export interface ComicSettingsReducerState {
  activeKey: string | null;
  /** Reader-wide settings shared by every comic. Absent until a publication is first activated. */
  global?: ComicSettings;
  /**
   * Per-publication settings ({@link COMIC_PUBLICATION_SETTING_KEYS}).
   * Entries persisted before settings became global may still hold every field.
   */
  byKey: Record<string, Partial<ComicSettings>>;
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
  // Retired: pages now load in reading order without a user-tuned window.
  const { imagePreloadAmount: _retiredImagePreloadAmount, ...rest } = entry as ComicSettings & {
    imagePreloadAmount?: unknown;
  };
  return {
    ...defaultComicSettings,
    ...rest,
    scaleType,
    widthLimitEnabled,
    widthLimitPercent,
  };
};

const isPublicationSettingKey = (key: string): key is ComicPublicationSettingKey =>
  (COMIC_PUBLICATION_SETTING_KEYS as readonly string[]).includes(key);

const pickPublicationSettings = (entry?: Partial<ComicSettings>): Partial<ComicPublicationSettings> => {
  const picked: Partial<ComicPublicationSettings> = {};
  if (!entry) return picked;
  for (const key of COMIC_PUBLICATION_SETTING_KEYS) {
    if (entry[key] !== undefined) (picked as Record<string, unknown>)[key] = entry[key];
  }
  return picked;
};

const omitPublicationSettings = (entry: Partial<ComicSettings>): Partial<ComicSettings> =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !isPublicationSettingKey(key))) as Partial<ComicSettings>;

/**
 * Effective settings for a publication: the shared settings plus its own overrides.
 * Before the shared settings exist, a legacy full per-publication entry stands in for them.
 */
export const resolveComicSettings = (state: ComicSettingsReducerState, key: string | null): ComicSettings => {
  const entry = key ? state.byKey[key] : undefined;
  const shared = state.global ?? omitPublicationSettings(entry ?? {});
  return normalizeComicSettings({ ...shared, ...pickPublicationSettings(entry) } as LegacyComicSettings);
};

/** Creates the shared settings on first use, inheriting a legacy per-publication entry when there is one. */
const ensureGlobal = (state: ComicSettingsReducerState, key: string) => {
  if (state.global) return;
  state.global = normalizeComicSettings(omitPublicationSettings(state.byKey[key] ?? {}) as LegacyComicSettings);
};

/** Ensures the publication entry exists and only holds publication settings. */
const ensureKey = (state: ComicSettingsReducerState, key: string) => {
  state.byKey[key] = {
    ...pickPublicationSettings(defaultComicSettings),
    ...pickPublicationSettings(state.byKey[key]),
  };
};

export const comicSettingsSlice = createSlice({
  name: "comicSettings",
  initialState,
  reducers: {
    /**
     * Seeds the publication settings of a key seen for the first time (e.g. its reading
     * direction from manifest metadata). Existing publication settings win; shared keys are ignored.
     */
    initComicSettings: (
      state,
      action: PayloadAction<{ key: string; defaults: Partial<ComicSettings> }>
    ) => {
      const { key, defaults } = action.payload;
      ensureGlobal(state, key);
      if (state.byKey[key]) return;
      state.byKey[key] = { ...pickPublicationSettings(defaultComicSettings), ...pickPublicationSettings(defaults) };
    },
    setComicActiveKey: (state, action: PayloadAction<string | null>) => {
      state.activeKey = action.payload;
      if (!action.payload) return;
      ensureGlobal(state, action.payload);
      ensureKey(state, action.payload);
    },
    updateComicSettings: (
      state,
      action: PayloadAction<{ key: string; patch: Partial<ComicSettings> }>
    ) => {
      const { key, patch } = action.payload;
      ensureGlobal(state, key);
      ensureKey(state, key);
      state.global = normalizeComicSettings({ ...state.global, ...omitPublicationSettings(patch) } as LegacyComicSettings);
      state.byKey[key] = { ...state.byKey[key], ...pickPublicationSettings(patch) };
    },
    resetComicSettings: (state, action: PayloadAction<{ key: string }>) => {
      const { key } = action.payload;
      state.global = { ...defaultComicSettings };
      state.byKey[key] = pickPublicationSettings(defaultComicSettings);
    },
  },
});

export const { initComicSettings, setComicActiveKey, updateComicSettings, resetComicSettings } =
  comicSettingsSlice.actions;

export default comicSettingsSlice.reducer;
