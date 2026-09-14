import { createSlice } from "@reduxjs/toolkit";

import { defaultPlatformModifier, UnstablePlatformModifier } from "@/core/Helpers/keyboardUtilities";
import { ThSettingsContainerKeys, ThLayoutDirection } from "@/preferences/models";

// Export the profile type for use in other components
export type ReaderProfile = "epub" | "webPub" | "audio" | "comic" | undefined;

export interface ReaderReducerState {
  profile: ReaderProfile;
  direction: ThLayoutDirection;
  isLoading: boolean;
  isImmersive: boolean;
  isHovering: boolean;
  hasScrollAffordance: boolean;
  hasArrows: boolean;
  hasUserNavigated: boolean;
  isFullscreen: boolean;
  settingsContainer: ThSettingsContainerKeys;
  platformModifier: UnstablePlatformModifier;
  /** Filled by selection-menu search; applied while the panel is open and cleared when it closes. */
  pendingSearchQuery: string | null;
}

const initialState: ReaderReducerState = {
  profile: undefined,
  direction: ThLayoutDirection.ltr,
  isLoading: true,
  isImmersive: false,
  isHovering: false,
  hasScrollAffordance: false,
  hasArrows: true,
  hasUserNavigated: false,
  isFullscreen: false,
  settingsContainer: ThSettingsContainerKeys.initial,
  platformModifier: defaultPlatformModifier,
  pendingSearchQuery: null,
}

export const readerSlice = createSlice({
  name: "reader",
  initialState,
  reducers: {
    setReaderProfile: (state, action) => {
      state.profile = action.payload
    },
    setDirection: (state, action) => {
      state.direction = action.payload
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setPlatformModifier: (state, action) => {
      state.platformModifier = action.payload
    },
    setImmersive: (state, action) => {
      state.isImmersive = action.payload
      if (action.payload === true) {
        state.isHovering = false;
        state.hasScrollAffordance = false;
      }
    },
    toggleImmersive: (state) => {
      state.isImmersive = !state.isImmersive;
      if (state.isImmersive === true) {
        state.isHovering = false;
        state.hasScrollAffordance = false;
      }
    },
    setHovering: (state, action) => {
      state.isHovering = action.payload
    },
    setScrollAffordance: (state, action) => {
      state.hasScrollAffordance = action.payload
      if (action.payload === true) {
        state.isHovering = false;
        state.isImmersive = false;
      }
    },
    setHasArrows: (state, action) => {
      state.hasArrows = action.payload
    },
    setUserNavigated: (state, action) => {
      state.hasUserNavigated = action.payload;
    },
    setFullscreen: (state, action) => {
      state.isFullscreen = action.payload
    },
    setSettingsContainer: (state, action) => {
      state.settingsContainer = action.payload
    },
    setPendingSearchQuery: (state, action: { payload: string | null }) => {
      const query = typeof action.payload === "string" ? action.payload.trim() : "";
      state.pendingSearchQuery = query.length > 0 ? query : null;
    }
  }
})

// Action creators are generated for each case reducer function
export const { 
  setReaderProfile, 
  setDirection, 
  setLoading,
  setPlatformModifier, 
  setImmersive, 
  toggleImmersive, 
  setHovering,
  setScrollAffordance,
  setHasArrows,  
  setUserNavigated,
  setFullscreen,
  setSettingsContainer,
  setPendingSearchQuery,
} = readerSlice.actions;

export default readerSlice.reducer;