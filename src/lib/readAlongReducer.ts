import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ReadAlongReducerState {
  followAudio: boolean;
  activeSyncPointId: string | null;
  guidedNavigationLoaded: boolean;
  guidedNavigationError: string | null;
}

const initialState: ReadAlongReducerState = {
  followAudio: true,
  activeSyncPointId: null,
  guidedNavigationLoaded: false,
  guidedNavigationError: null,
};

export const readAlongSlice = createSlice({
  name: "readAlong",
  initialState,
  reducers: {
    setFollowAudio: (state, action: PayloadAction<boolean>) => {
      state.followAudio = action.payload;
    },
    setActiveSyncPointId: (state, action: PayloadAction<string | null>) => {
      state.activeSyncPointId = action.payload;
    },
    setGuidedNavigationLoaded: (state, action: PayloadAction<boolean>) => {
      state.guidedNavigationLoaded = action.payload;
    },
    setGuidedNavigationError: (state, action: PayloadAction<string | null>) => {
      state.guidedNavigationError = action.payload;
    },
    resetReadAlong: () => initialState,
  },
});

export const {
  setFollowAudio,
  setActiveSyncPointId,
  setGuidedNavigationLoaded,
  setGuidedNavigationError,
  resetReadAlong,
} = readAlongSlice.actions;

export default readAlongSlice.reducer;
