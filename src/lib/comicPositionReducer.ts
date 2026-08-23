import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ComicPosition {
  pageIndex: number;
  updatedAt: number;
  chapterIndex?: number;
  pageIndexInChapter?: number;
  pageHref?: string;
}

export interface ComicPositionReducerState {
  byKey: Record<string, ComicPosition>;
}

const initialState: ComicPositionReducerState = {
  byKey: {},
};

export const comicPositionSlice = createSlice({
  name: "comicPosition",
  initialState,
  reducers: {
    updateComicPosition: (
      state,
      action: PayloadAction<{
        key: string;
        pageIndex: number;
        chapterIndex?: number;
        pageIndexInChapter?: number;
        pageHref?: string;
      }>
    ) => {
      const { key, pageIndex, chapterIndex, pageIndexInChapter, pageHref } = action.payload;
      state.byKey[key] = {
        pageIndex,
        updatedAt: Date.now(),
        ...(chapterIndex !== undefined
          ? { chapterIndex, pageIndexInChapter, pageHref }
          : {}),
      };
    },
    clearComicPosition: (state, action: PayloadAction<{ key: string }>) => {
      delete state.byKey[action.payload.key];
    },
  },
});

export const { updateComicPosition, clearComicPosition } = comicPositionSlice.actions;

export default comicPositionSlice.reducer;
