import { lazy, Suspense, useState, useEffect, useMemo, type ReactNode } from "react";

import { Publication, Locator } from "@readium/shared";
import { getScriptMode } from "@readium/navigator";
import { ThThemeKeys, ThemeKeyType, useTheming } from "@/preferences";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useAudioPreferences } from "@/preferences/hooks/useAudioPreferences";
import { ThAudioPreferencesProvider } from "@/preferences/ThAudioPreferencesProvider";
import { ThPreferencesProvider } from "@/preferences/ThPreferencesProvider";
import { ThI18nProvider } from "@/i18n/ThI18nProvider";

import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import {
  setBreakpoint,
  setContainerBreakpoint,
  setColorScheme,
  setContrast,
  setForcedColors,
  setMonochrome,
  setReducedMotion,
  setReducedTransparency,
} from "@/lib/themeReducer";
import { setFontLanguage, setCoverTheme } from "@/lib/publicationReducer";
import { propsToCSSVars } from "@/core/Helpers/propsToCSSVars";
import { prefixString } from "@/core/Helpers/prefixString";
import { useCoverBlobUrl } from "@/hooks/useCoverBlobUrl";
import { ThPlugin } from "../Plugins";
import { StatefulLoader } from "@/components/Misc";
import { ThPreferences, CustomizableKeys } from "@/preferences/preferences";
import { ThAudioPreferences } from "@/preferences/audioPreferences";
import { ThPreferencesAdapter } from "@/preferences/adapters/ThPreferencesAdapter";
import { ThAudioPreferencesAdapter } from "@/preferences/adapters/ThAudioPreferencesAdapter";
import { InitOptions } from "i18next";
import {
  ReaderNavigationProvider,
  type ReaderNavigation,
  type ReaderSourceSelection,
} from "./ReaderNavigationContext";
import type { ReaderInteractionProps } from "./ReaderInteractions";
import type { DictionaryReaderCallbacks } from "./DictionaryReaderAdapter";

export type {
  DictionaryReaderCallbacks,
  ReaderDecoration,
  ReaderDecorationActivation,
  ReaderTextSelection,
} from "./DictionaryReaderAdapter";

const StatefulEpubReader = lazy(() => import("@/components/Epub").then(mod => ({ default: mod.StatefulReader })));
const StatefulWebPubReader = lazy(() => import("@/components/WebPub").then(mod => ({ default: mod.ExperimentalWebPubStatefulReader })));
const StatefulPlayer = lazy(() => import("@/components/Audio").then(mod => ({ default: mod.StatefulPlayer })));

const StatefulComicReader = lazy(() => import("@/components/Comic/StatefulComicReader").then(mod => ({ default: mod.StatefulComicReader })));

export interface PositionStorage {
  get: () => Locator | undefined;
  set: (locator: Locator) => void | Promise<void>;
}

export interface StatefulReaderProps extends ReaderInteractionProps {
  publication: Publication;
  localDataKey: string | null;
  plugins?: ThPlugin[];
  positionStorage?: PositionStorage;
  coverUrl?: string;
  containerRefSetter?: (el: Element | null) => void;
  /** @deprecated Use ReaderInteractionProps directly. */
  dictionary?: DictionaryReaderCallbacks;
}

export type ThPluginFactory = () => ThPlugin[] | Promise<ThPlugin[]>;

export interface ReaderPlugins {
  epub?: ThPluginFactory;
  webPub?: ThPluginFactory;
  audio?: ThPluginFactory;
  comic?: ThPluginFactory;
}

export interface ReaderComponentProps<
  P extends "epub" | "webPub" | "audio" | "comic" | undefined | null = undefined,
  K extends CustomizableKeys = {}
> extends ReaderInteractionProps {
  profile: P;
  publication: Publication;
  localDataKey: string | null;
  isLoading?: boolean;
  positionStorage?: PositionStorage;
  coverUrl?: string;
  plugins?: ReaderPlugins;
  i18n?: Partial<InitOptions>;
  navigation?: ReaderNavigation;
  /** Multi-source selector rendered in the reader header. */
  sources?: ReaderSourceSelection;
  /** Application-owned controls rendered in the reader header. */
  headerActions?: ReactNode;
  preferences?: P extends "audio"
    ? { initialPreferences?: ThAudioPreferences<K>; adapter?: ThAudioPreferencesAdapter<K> }
    : P extends "epub" | "webPub" | "comic"
    ? { initialPreferences?: ThPreferences<K>; adapter?: ThPreferencesAdapter<K> }
    : never;
  /** @deprecated Use ReaderInteractionProps directly. */
  dictionary?: DictionaryReaderCallbacks;
}

// ─── Outer wrapper — selects provider based on profile ────────────────────────

export const StatefulReaderWrapper = ({ profile, plugins, isLoading, preferences, navigation, sources, headerActions, i18n: i18nOptions, coverUrl: readerCoverUrl, ...props }: ReaderComponentProps<any, any>) => {
  const [resolvedPlugins, setResolvedPlugins] = useState<ThPlugin[] | undefined>(undefined);
  const navigationContext = useMemo(
    () => ({
      ...navigation,
      sources: sources ?? navigation?.sources,
      headerActions: headerActions ?? navigation?.headerActions,
    }),
    [headerActions, navigation, sources],
  );

  const pendingFactory = profile === "epub" ? plugins?.epub
    : profile === "webPub" ? plugins?.webPub
    : profile === "audio" ? plugins?.audio
    : profile === "comic" ? plugins?.comic
    : undefined;

  useEffect(() => {
    if (!pendingFactory) return;
    const result = pendingFactory();
    if (result instanceof Promise) {
      result.then(setResolvedPlugins);
    } else {
      setResolvedPlugins(result);
    }
  }, [pendingFactory]);

  if (pendingFactory && resolvedPlugins === undefined) return null;

  const manifestCoverUrl = props.publication?.getCover()?.toURL(props.publication.baseURL);
  const coverUrl = readerCoverUrl ?? manifestCoverUrl;

  if (profile === "audio") {
    return (
      <ReaderNavigationProvider value={ navigationContext }>
        <ThAudioPreferencesProvider
          devMode={ process.env.NODE_ENV !== "production" }
          initialPreferences={ preferences?.initialPreferences as ThAudioPreferences<any> | undefined }
          adapter={ preferences?.adapter as ThAudioPreferencesAdapter<any> | undefined }
        >
          <ThI18nProvider { ...i18nOptions }>
            <StatefulAudioContent { ...props } coverUrl={ coverUrl } externalLoading={ isLoading ?? false } />
          </ThI18nProvider>
        </ThAudioPreferencesProvider>
      </ReaderNavigationProvider>
    );
  }

  return (
    <ReaderNavigationProvider value={ navigationContext }>
      <ThPreferencesProvider
        devMode={ process.env.NODE_ENV !== "production" }
        initialPreferences={ preferences?.initialPreferences as ThPreferences<any> | undefined }
        adapter={ preferences?.adapter as ThPreferencesAdapter<any> | undefined }
      >
        <ThI18nProvider { ...i18nOptions }>
          <StatefulLoader isLoading={ isLoading ?? false }>
            <StatefulReaderContent profile={ profile } { ...props } coverUrl={ coverUrl } plugins={ resolvedPlugins } />
          </StatefulLoader>
        </ThI18nProvider>
      </ThPreferencesProvider>
    </ReaderNavigationProvider>
  );
};

// ─── Audio inner content ──────────────────────────────────────────────────────

interface AudioContentProps {
  publication: Publication;
  localDataKey: string | null;
  positionStorage?: PositionStorage;
  coverUrl?: string;
  externalLoading: boolean;
}

const StatefulAudioContent = ({ publication, localDataKey, positionStorage, coverUrl, externalLoading }: AudioContentProps) => {
  const { preferences } = useAudioPreferences();
  const themeObject = useAppSelector(state => state.theming?.theme ?? {});
  const dispatch = useAppDispatch();

  const { coverBlobUrl, coverReady } = useCoverBlobUrl(coverUrl);

  const { themeResolved, setContainerRef } = useTheming<ThemeKeyType>({
    theme: themeObject.audio ?? "auto",
    themeKeys: preferences.theming.themes.keys,
    systemKeys: preferences.theming.themes.systemThemes,
    breakpointsMap: preferences.theming.breakpoints,
    coverUrl: coverBlobUrl,
    autoThemeSource: "cover",
    initProps: {
      ...propsToCSSVars(preferences.theming.icon, { prefix: prefixString("icon") }),
      ...propsToCSSVars(preferences.theming.layout, {
        prefix: prefixString("layout"),
        exclude: ["ui", "compact", "expanded", "progressBar"]
      })
    },
    onCoverThemeGenerated: (themeTokens) => dispatch(setCoverTheme(themeTokens)),
    onBreakpointChange: (breakpoint) => dispatch(setBreakpoint(breakpoint)),
    onContainerBreakpointChange: (breakpoint) => dispatch(setContainerBreakpoint(breakpoint)),
    onColorSchemeChange: (colorScheme) => dispatch(setColorScheme(colorScheme)),
    onContrastChange: (contrast) => dispatch(setContrast(contrast)),
    onForcedColorsChange: (forcedColors) => dispatch(setForcedColors(forcedColors)),
    onMonochromeChange: (isMonochrome) => dispatch(setMonochrome(isMonochrome)),
    onReducedMotionChange: (reducedMotion) => dispatch(setReducedMotion(reducedMotion)),
    onReducedTransparencyChange: (reducedTransparency) => dispatch(setReducedTransparency(reducedTransparency))
  });

  return (
    <StatefulLoader isLoading={ externalLoading || !themeResolved || !coverReady }>
      <Suspense>
        <StatefulPlayer publication={ publication } localDataKey={ localDataKey } positionStorage={ positionStorage } coverUrl={ coverBlobUrl } containerRefSetter={ setContainerRef } />
      </Suspense>
    </StatefulLoader>
  );
};

// ─── Reader inner content ─────────────────────────────────────────────────────

interface ReaderContentProps extends ReaderInteractionProps {
  profile: "epub" | "webPub" | "comic" | undefined | null;
  publication: Publication;
  localDataKey: string | null;
  positionStorage?: PositionStorage;
  plugins?: ThPlugin[];
  coverUrl?: string;
  dictionary?: DictionaryReaderCallbacks;
}

const StatefulReaderContent = ({ profile, publication, plugins, coverUrl, dictionary, ...props }: ReaderContentProps) => {
  const { preferences, resolveFontLanguage } = usePreferences();
  const themeObject = useAppSelector(state => state.theming?.theme ?? {});
  const customThemes = useAppSelector(state => state.theming.customThemes);
  const isFXL = useAppSelector(state => state.publication.isFXL);
  const themeKeys = useMemo(
    () => ({
      ...preferences.theming.themes.keys,
      ...customThemes
    }),
    [customThemes, preferences.theming.themes.keys]
  );
  const theme = profile === "epub"
    ? ((isFXL ? themeObject.fxl : themeObject.reflow) ?? "auto")
    : profile === "comic"
      ? (themeObject.fxl ?? "auto")
      : ThThemeKeys.light;
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!publication) return;
    const resolvedLang = resolveFontLanguage(
      publication.metadata.languages?.[0],
      getScriptMode(publication.metadata)
    );
    dispatch(setFontLanguage(resolvedLang));
  }, [publication, resolveFontLanguage, dispatch]);

  const { setContainerRef } = useTheming<ThemeKeyType>({
    theme,
    themeKeys,
    systemKeys: preferences.theming.themes.systemThemes,
    breakpointsMap: preferences.theming.breakpoints,
    coverUrl,
    autoThemeSource: "system",
    initProps: {
      ...propsToCSSVars(preferences.theming.arrow, { prefix: prefixString("arrow") }),
      ...propsToCSSVars(preferences.theming.icon, { prefix: prefixString("icon") }),
      ...propsToCSSVars(preferences.theming.layout, {
        prefix: prefixString("layout"),
        exclude: ["ui"]
      })
    },
    onCoverThemeGenerated: (themeTokens) => dispatch(setCoverTheme(themeTokens)),
    onBreakpointChange: (breakpoint) => dispatch(setBreakpoint(breakpoint)),
    onContainerBreakpointChange: (breakpoint) => dispatch(setContainerBreakpoint(breakpoint)),
    onColorSchemeChange: (colorScheme) => dispatch(setColorScheme(colorScheme)),
    onContrastChange: (contrast) => dispatch(setContrast(contrast)),
    onForcedColorsChange: (forcedColors) => dispatch(setForcedColors(forcedColors)),
    onMonochromeChange: (isMonochrome) => dispatch(setMonochrome(isMonochrome)),
    onReducedMotionChange: (reducedMotion) => dispatch(setReducedMotion(reducedMotion)),
    onReducedTransparencyChange: (reducedTransparency) => dispatch(setReducedTransparency(reducedTransparency))
  });

  switch (profile) {
    case "epub":
      return <Suspense><StatefulEpubReader publication={ publication } { ...props } plugins={ plugins } containerRefSetter={ setContainerRef } dictionary={ dictionary } /></Suspense>;
    case "comic":
      return <Suspense><StatefulComicReader publication={ publication } { ...props } plugins={ plugins } /></Suspense>;
    case "webPub":
    default:
      return <Suspense><StatefulWebPubReader publication={ publication } { ...props } plugins={ plugins } containerRefSetter={ setContainerRef } dictionary={ dictionary } /></Suspense>;
  }
};
