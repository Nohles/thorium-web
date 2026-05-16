"use client";

import { lazy, Suspense, useEffect } from "react";

import { getScriptMode } from "@readium/navigator";
import { ThThemeKeys, ThemeKeyType, useTheming } from "@/preferences";
import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useAudioPreferences } from "@/preferences/hooks/useAudioPreferences";
import { ThAudioPreferencesProvider } from "@/preferences/ThAudioPreferencesProvider";
import { ThPreferencesProvider } from "@/preferences/ThPreferencesProvider";
import { ThI18nProvider } from "@/i18n/ThI18nProvider";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  setBreakpoint,
  setContainerBreakpoint,
  setColorScheme,
  setContrast,
  setCoverTheme,
  setForcedColors,
  setMonochrome,
  setReducedMotion,
  setReducedTransparency,
} from "@/lib/themeReducer";
import { setFontLanguage } from "@/lib/publicationReducer";
import { propsToCSSVars } from "@/core/Helpers/propsToCSSVars";
import { prefixString } from "@/core/Helpers/prefixString";
import { useDualPublication } from "@/hooks/useDualPublication";
import { ErrorDisplay } from "@/components/Misc";
import { StatefulLoader } from "@/components/Misc";
import { InitOptions } from "i18next";
import { PositionStorage } from "./StatefulReaderWrapper";
import { ThPreferences, CustomizableKeys } from "@/preferences/preferences";
import { ThAudioPreferences } from "@/preferences/audioPreferences";
import { ThPreferencesAdapter } from "@/preferences/adapters/ThPreferencesAdapter";
import { ThAudioPreferencesAdapter } from "@/preferences/adapters/ThAudioPreferencesAdapter";

const StatefulReadAlongReader = lazy(() =>
  import("@/components/ReadAlong").then((mod) => ({ default: mod.StatefulReadAlongReader }))
);

export interface StatefulReadAlongWrapperProps<K extends CustomizableKeys = {}> {
  epubUrl: string;
  audioUrl: string;
  guidedNavigationUrl?: string;
  isLoading?: boolean;
  positionStorage?: {
    epub?: PositionStorage;
    audio?: PositionStorage;
  };
  i18n?: Partial<InitOptions>;
  preferences?: {
    epub?: { initialPreferences?: ThPreferences<K>; adapter?: ThPreferencesAdapter<K> };
    audio?: { initialPreferences?: ThAudioPreferences<K>; adapter?: ThAudioPreferencesAdapter<K> };
  };
}

const ReadAlongThemedContent = ({
  externalLoading,
  positionStorage,
  ...dual
}: ReturnType<typeof useDualPublication> & {
  externalLoading: boolean;
  positionStorage?: StatefulReadAlongWrapperProps["positionStorage"];
}) => {
  const { preferences, resolveFontLanguage } = usePreferences();
  const { preferences: audioPreferences } = useAudioPreferences();
  const themeObject = useAppSelector((state) => state.theming.theme);
  const isFXL = useAppSelector((state) => state.publication.isFXL);
  const theme = isFXL ? themeObject.fxl : themeObject.reflow;
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!dual.epubPublication) return;
    const resolvedLang = resolveFontLanguage(
      dual.epubPublication.metadata.languages?.[0],
      getScriptMode(dual.epubPublication.metadata)
    );
    dispatch(setFontLanguage(resolvedLang));
  }, [dual.epubPublication, resolveFontLanguage, dispatch]);

  const { setContainerRef, themeResolved } = useTheming<ThemeKeyType>({
    theme: theme ?? ThThemeKeys.light,
    themeKeys: preferences.theming.themes.keys,
    systemKeys: preferences.theming.themes.systemThemes,
    breakpointsMap: preferences.theming.breakpoints,
    autoThemeSource: "system",
    initProps: {
      ...propsToCSSVars(preferences.theming.arrow, { prefix: prefixString("arrow") }),
      ...propsToCSSVars(preferences.theming.icon, { prefix: prefixString("icon") }),
      ...propsToCSSVars(preferences.theming.layout, {
        prefix: prefixString("layout"),
        exclude: ["ui"],
      }),
      ...propsToCSSVars(audioPreferences.theming.layout, {
        prefix: prefixString("layout"),
        exclude: ["ui", "compact", "expanded", "progressBar"],
      }),
    },
    onCoverThemeGenerated: (themeTokens) => dispatch(setCoverTheme(themeTokens)),
    onBreakpointChange: (breakpoint) => dispatch(setBreakpoint(breakpoint)),
    onContainerBreakpointChange: (breakpoint) => dispatch(setContainerBreakpoint(breakpoint)),
    onColorSchemeChange: (colorScheme) => dispatch(setColorScheme(colorScheme)),
    onContrastChange: (contrast) => dispatch(setContrast(contrast)),
    onForcedColorsChange: (forcedColors) => dispatch(setForcedColors(forcedColors)),
    onMonochromeChange: (isMonochrome) => dispatch(setMonochrome(isMonochrome)),
    onReducedMotionChange: (reducedMotion) => dispatch(setReducedMotion(reducedMotion)),
    onReducedTransparencyChange: (reducedTransparency) =>
      dispatch(setReducedTransparency(reducedTransparency)),
  });

  if (!dual.epubPublication || !dual.audioPublication) {
    return null;
  }

  return (
    <StatefulLoader isLoading={ externalLoading || dual.isLoading || !themeResolved }>
      <Suspense>
        <StatefulReadAlongReader
          epubPublication={ dual.epubPublication }
          audioPublication={ dual.audioPublication }
          syncIndex={ dual.syncIndex }
          epubLocalDataKey={ dual.epubLocalDataKey }
          audioLocalDataKey={ dual.audioLocalDataKey }
          positionStorage={ positionStorage }
          containerRefSetter={ setContainerRef }
        />
      </Suspense>
    </StatefulLoader>
  );
};

export const StatefulReadAlongWrapper = ({
  epubUrl,
  audioUrl,
  guidedNavigationUrl,
  isLoading: externalLoading = false,
  positionStorage,
  i18n: i18nOptions,
  preferences,
}: StatefulReadAlongWrapperProps) => {
  const dual = useDualPublication({
    epubUrl,
    audioUrl,
    guidedNavigationUrl,
  });

  if (dual.error) {
    return <ErrorDisplay error={ dual.error } />;
  }

  return (
    <ThPreferencesProvider
      devMode={ process.env.NODE_ENV !== "production" }
      initialPreferences={ preferences?.epub?.initialPreferences }
      adapter={ preferences?.epub?.adapter }
    >
      <ThAudioPreferencesProvider
        devMode={ process.env.NODE_ENV !== "production" }
        initialPreferences={ preferences?.audio?.initialPreferences }
        adapter={ preferences?.audio?.adapter }
      >
        <ThI18nProvider { ...i18nOptions }>
          <ReadAlongThemedContent
            { ...dual }
            externalLoading={ externalLoading }
            positionStorage={ positionStorage }
          />
        </ThI18nProvider>
      </ThAudioPreferencesProvider>
    </ThPreferencesProvider>
  );
};
