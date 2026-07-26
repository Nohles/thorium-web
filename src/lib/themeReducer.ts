import { createSlice } from "@reduxjs/toolkit";

import { ThColorScheme } from "@/core/Hooks/useColorScheme";
import { ThContrast } from "@/core/Hooks/useContrast";
import { ThBreakpoints } from "@/preferences/models";
import { ThemeTokens } from "@/preferences/hooks/useTheming";

export interface ThemeStateObject {
  reflow?: string;
  fxl?: string;
  audio?: string;
}

export interface ThemeStateChangePayload {
  type: string;
  payload: {
    key: "reflow" | "fxl" | "audio";
    value?: string;
  }
}

export interface ThemeReducerState {
  monochrome: boolean;
  colorScheme: ThColorScheme;
  theme: ThemeStateObject;
  customThemes?: Record<string, ThemeTokens>;
  coverTheme?: ThemeTokens;
  prefersReducedMotion: boolean;
  prefersReducedTransparency: boolean;
  prefersContrast: ThContrast;
  forcedColors: boolean;
  breakpoint?: ThBreakpoints;
  containerBreakpoint?: ThBreakpoints;
}

const initialState: ThemeReducerState = {
  monochrome: false,
  colorScheme: ThColorScheme.light,
  theme: {
    reflow: "auto",
    fxl: "auto",
    audio: "auto"
  },
  customThemes: {},
  coverTheme: undefined,
  prefersReducedMotion: false,
  prefersReducedTransparency: false, 
  prefersContrast: ThContrast.none,
  forcedColors: false, 
  breakpoint: undefined,
  containerBreakpoint: undefined
}

export const themeSlice = createSlice({
  name: "theming",
  initialState,
  reducers: {
    setMonochrome: (state, action) => {
      state.monochrome = action.payload
    },
    setColorScheme: (state, action) => {
      state.colorScheme = action.payload
    },
    setTheme: (state, action: ThemeStateChangePayload) => {
      state.theme[action.payload.key] = action.payload.value || "auto"
    },
    setCustomTheme: (
      state,
      action: { payload: { key: string; tokens: ThemeTokens } }
    ) => {
      state.customThemes = {
        ...state.customThemes,
        [action.payload.key]: action.payload.tokens
      }
    },
    setCoverTheme: (state, action) => {
      state.coverTheme = action.payload
    },
    setReducedMotion: (state, action) => {
      state.prefersReducedMotion = action.payload
    },
    setReducedTransparency: (state, action) => {
      state.prefersReducedTransparency = action.payload
    },
    setContrast: (state, action) => {
      state.prefersContrast = action.payload
    },
    setForcedColors: (state, action) => {
      state.forcedColors = action.payload
    },
    setBreakpoint: (state, action) => {
      state.breakpoint = action.payload
    },
    setContainerBreakpoint: (state, action) => {
      state.containerBreakpoint = action.payload
    }
  }
})

// Action creators are generated for each case reducer function
export const { 
  setMonochrome, 
  setColorScheme, 
  setTheme, 
  setCustomTheme,
  setCoverTheme,
  setReducedMotion, 
  setReducedTransparency, 
  setContrast, 
  setForcedColors, 
  setBreakpoint,
  setContainerBreakpoint,
} = themeSlice.actions;

export default themeSlice.reducer;
