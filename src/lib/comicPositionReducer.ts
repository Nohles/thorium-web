import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ComicPosition {
  pageIndex: number;
  updatedAt: number;
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
      action: PayloadAction<{ key: string; pageIndex: number }>
    ) => {
      const { key, pageIndex } = action.payload;
      state.byKey[key] = {
        pageIndex,
        updatedAt: Date.now(),
      };
    },
    clearComicPosition: (state, action: PayloadAction<{ key: string }>) => {
      delete state.byKey[action.payload.key];
    },
  },
});

export const { updateComicPosition, clearComicPosition } = comicPositionSlice.actions;

export default comicPositionSlice.reducer;
