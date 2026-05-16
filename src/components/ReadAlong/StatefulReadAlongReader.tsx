"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import classNames from "classnames";
import debounce from "debounce";

import {
  Layout,
  Locator,
  Publication,
  TimelineItem,
} from "@readium/shared";
import {
  BasicTextSelection,
  ContextMenuEvent,
} from "@readium/navigator-html-injectables";
import {
  AudioNavigatorListeners,
  EpubNavigatorListeners,
  KeyboardPeripheralEventData,
} from "@readium/navigator";

import readerStyles from "../assets/styles/thorium-web.reader.app.module.css";
import arrowStyles from "../assets/styles/thorium-web.reader.paginatedArrow.module.css";
import readAlongStyles from "./assets/styles/thorium-web.readAlong.module.css";

import { NavigatorProvider } from "@/core/Navigator";
import { useEpubNavigator } from "@/core/Hooks/Epub/useEpubNavigator";
import { useAudioNavigator } from "@/core/Hooks/Audio/useAudioNavigator";
import { useFonts } from "@/core/Hooks/fonts/useFonts";
import { useFullscreen } from "@/core/Hooks/useFullscreen";
import { useIsScroll } from "@/hooks";
import { useReadAlongHighlight } from "@/hooks/useReadAlongHighlight";
import { useReadAlongSync } from "@/hooks/useReadAlongSync";
import { usePositionStorage } from "@/hooks/usePositionStorage";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  setFullscreen,
  setImmersive,
  setLoading,
  setUserNavigated,
  toggleImmersive,
} from "@/lib/readerReducer";
import { setFollowAudio } from "@/lib/readAlongReducer";
import {
  setPublicationEnd,
  setPublicationStart,
} from "@/lib/publicationReducer";
import { toggleActionOpen } from "@/lib/actionsReducer";
import { fromActionPeripheralType } from "@/helpers/peripherals";
import { PositionStorage } from "@/components/Reader/StatefulReaderWrapper";
import { StatefulReaderHeader } from "@/components/StatefulReaderHeader";
import { StatefulReaderArrowButton } from "@/components/StatefulReaderArrowButton";
import { StatefulReaderFooter } from "@/components/StatefulReaderFooter";
import { StatefulAudioPlaybackControls } from "@/components/Audio/controls/StatefulAudioPlaybackControls";
import { StatefulAudioProgressBar } from "@/components/Audio/controls/StatefulAudioProgressBar";
import { StatefulReadAlongFollowToggle } from "./StatefulReadAlongFollowToggle";
import { useEpubReaderInit } from "@/components/Epub/Hooks/useReaderInit";
import { useAudioPlayerInit } from "@/components/Audio/Hooks/useAudioPlayerInit";
import { useEpubStatelessCache } from "@/components/Epub/Hooks/useEpubStatelessCache";
import { useAudioStatelessCache } from "@/components/Audio/Hooks/useAudioStatelessCache";
import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useAudioPreferences } from "@/preferences/hooks/useAudioPreferences";
import { useFilteredPreferenceKeys } from "@/preferences";
import {
  ThLayoutUI,
  ThProgressionFormat,
  ThSpacingSettingsKeys,
} from "@/preferences/models";
import { resolveContentProtectionConfig } from "@/preferences/models/protection";
import { resolveAudioContentProtectionConfig } from "@/preferences/models/protection";
import { useSpacingPresets } from "@/components/Settings/Spacing/hooks/useSpacingPresets";
import { usePaginatedArrows } from "@/hooks/usePaginatedArrows";
import { useEpubKeyboardPeripherals } from "@/components/Epub/Hooks/useEpubKeyboardPeripherals";
import { useAudioKeyboardPeripherals } from "@/components/Audio/Hooks/useAudioKeyboardPeripherals";
import { getReaderClassNames } from "@/components/Helpers/getReaderClassNames";
import type { ReadAlongSyncIndex } from "@/readAlong/types";

export interface StatefulReadAlongReaderProps {
  epubPublication: Publication;
  audioPublication: Publication;
  syncIndex: ReadAlongSyncIndex | null;
  epubLocalDataKey: string | null;
  audioLocalDataKey: string | null;
  positionStorage?: {
    epub?: PositionStorage;
    audio?: PositionStorage;
  };
  containerRefSetter?: (el: Element | null) => void;
}

export const StatefulReadAlongReader = ({
  epubPublication,
  audioPublication,
  syncIndex,
  epubLocalDataKey,
  audioLocalDataKey,
  positionStorage,
  containerRefSetter,
}: StatefulReadAlongReaderProps) => {
  const { preferences, getFontMetadata, getFontInjectables } = usePreferences();
  const { preferences: audioPreferences } = useAudioPreferences();
  const { reflowActionKeys, reflowThemeKeys, fxlActionKeys, fxlThemeKeys } = useFilteredPreferenceKeys();
  const { t } = useI18n();
  const dispatch = useAppDispatch();

  const isFXL = useAppSelector((state) => state.publication.isFXL);
  const isRTL = useAppSelector((state) => state.publication.isRTL);
  const positionsList = useAppSelector((state) => state.publication.positionsList);
  const fontLanguage = useAppSelector((state) => state.publication.fontLanguage);
  const guidedNavigationError = useAppSelector((state) => state.readAlong.guidedNavigationError);
  const profile = useAppSelector((state) => state.reader.profile);
  const breakpoint = useAppSelector((state) => state.theming.breakpoint);
  const containerBreakpoint = useAppSelector((state) => state.theming.containerBreakpoint);
  const isImmersive = useAppSelector((state) => state.reader.isImmersive);
  const isHovering = useAppSelector((state) => state.reader.isHovering);
  const atPublicationStart = useAppSelector((state) => state.publication.atPublicationStart);
  const atPublicationEnd = useAppSelector((state) => state.publication.atPublicationEnd);
  const colorScheme = useAppSelector((state) => state.theming.colorScheme);
  const reducedMotion = useAppSelector((state) => state.theming.prefersReducedMotion);
  const themeObject = useAppSelector((state) => state.theming.theme);
  const theme = isFXL ? themeObject.fxl : themeObject.reflow;

  const pollInterval = useAppSelector((state) => state.audioSettings.pollInterval);
  const volume = useAppSelector((state) => state.audioSettings.volume);
  const playbackRate = useAppSelector((state) => state.audioSettings.playbackRate);
  const preservePitch = useAppSelector((state) => state.audioSettings.preservePitch);
  const skipBackwardInterval = useAppSelector((state) => state.audioSettings.skipBackwardInterval);
  const skipForwardInterval = useAppSelector((state) => state.audioSettings.skipForwardInterval);
  const skipInterval = useAppSelector((state) => state.audioSettings.skipInterval);
  const autoPlay = useAppSelector((state) => state.audioSettings.autoPlay);
  const enableMediaSession = useAppSelector((state) => state.audioSettings.enableMediaSession);
  const sleepOnTrackEnd = useAppSelector((state) => state.player.sleepTimer.onTrackEnd);
  const sleepOnFragmentEnd = useAppSelector((state) => state.player.sleepTimer.onFragmentEnd);
  const adjacentTimelineItems = useAppSelector((state) => state.publication.adjacentTimelineItems);

  const { getEffectiveSpacingValue } = useSpacingPresets();
  const { occupySpace: arrowsOccupySpace } = usePaginatedArrows();
  const { injectFontResources, removeFontResources, getAndroidFXLPatch } = useFonts();
  const isScroll = useIsScroll();

  const textAlign = useAppSelector((state) => state.settings.textAlign);
  const columnCount = useAppSelector((state) => state.settings.columnCount);
  const fontFamily = useAppSelector((state) => state.settings.fontFamily);
  const fontSize = useAppSelector((state) => state.settings.fontSize);
  const fontWeight = useAppSelector((state) => state.settings.fontWeight);
  const hyphens = useAppSelector((state) => state.settings.hyphens);
  const ligatures = useAppSelector((state) => state.settings.ligatures);
  const noRuby = useAppSelector((state) => state.settings.noRuby);
  const letterSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.letterSpacing);
  const lineLength = useAppSelector((state) => state.settings.lineLength);
  const lineHeight = getEffectiveSpacingValue(ThSpacingSettingsKeys.lineHeight);
  const paragraphIndent = getEffectiveSpacingValue(ThSpacingSettingsKeys.paragraphIndent);
  const paragraphSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.paragraphSpacing);
  const publisherStyles = useAppSelector((state) => state.settings.publisherStyles);
  const textNormalization = useAppSelector((state) => state.settings.textNormalization);
  const wordSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.wordSpacing);

  const layoutUI = isFXL
    ? preferences.theming.layout.ui?.fxl || ThLayoutUI.layered
    : isScroll
      ? preferences.theming.layout.ui?.reflow || ThLayoutUI.layered
      : ThLayoutUI.stacked;

  const container = useRef<HTMLDivElement>(null);
  const arrowsWidth = useRef(2 * ((preferences.theming.arrow.size || 40) + (preferences.theming.arrow.offset || 0)));

  const cache = useEpubStatelessCache(
    textAlign,
    columnCount,
    fontFamily,
    fontSize,
    fontWeight,
    hyphens,
    letterSpacing,
    ligatures,
    lineLength,
    lineHeight,
    noRuby,
    paragraphIndent,
    paragraphSpacing,
    publisherStyles,
    isScroll,
    textNormalization,
    wordSpacing,
    theme,
    positionsList,
    colorScheme,
    reducedMotion,
    layoutUI,
    isImmersive,
    isHovering,
    arrowsOccupySpace
  );

  const audioCache = useAudioStatelessCache(
    volume,
    playbackRate,
    preservePitch,
    skipBackwardInterval,
    skipForwardInterval,
    skipInterval,
    pollInterval,
    autoPlay,
    enableMediaSession,
    sleepOnTrackEnd,
    sleepOnFragmentEnd,
    adjacentTimelineItems
  );

  const epubNavigator = useEpubNavigator();
  const audioNavigator = useAudioNavigator();
  const { goLeft, goRight, getCframes } = epubNavigator;

  const { applyHighlight, clearHighlights } = useReadAlongHighlight(getCframes);

  const syncEnabled = Boolean(syncIndex?.points.length);

  const {
    onAudioPositionChanged,
    onAudioSeek,
    syncToAudio,
    resetSyncRefs,
  } = useReadAlongSync({
    enabled: syncEnabled,
    syncIndex,
    epubPublication,
    audioPublication,
    epubNavigator,
    audioNavigator,
    applyHighlight,
    pollIntervalMs: Math.min(pollInterval, 250),
  });

  const { setLocalData: setEpubLocalData, getLocalData: getEpubLocalData } = usePositionStorage(
    epubLocalDataKey,
    positionStorage?.epub
  );
  const { setLocalData: setAudioLocalData, getLocalData: getAudioLocalData } = usePositionStorage(
    audioLocalDataKey,
    positionStorage?.audio
  );

  const onUserEpubNavigation = useCallback(() => {
    dispatch(setUserNavigated(true));
    dispatch(setFollowAudio(false));
    clearHighlights();
  }, [dispatch, clearHighlights]);

  const toggleIsImmersive = useCallback(() => {
    dispatch(toggleImmersive());
  }, [dispatch]);

  const updatePublicationNavigationState = useCallback(() => {
    if (epubNavigator.canGoBackward()) {
      dispatch(setPublicationStart(false));
    } else {
      dispatch(setPublicationStart(true));
    }
    if (epubNavigator.canGoForward()) {
      dispatch(setPublicationEnd(false));
    } else {
      dispatch(setPublicationEnd(true));
    }
  }, [epubNavigator, dispatch]);

  const epubListeners: EpubNavigatorListeners = useMemo(() => ({
    frameLoaded: async () => {},
    positionChanged: async (locator: Locator) => {
      const debounced = debounce(async () => {
        setEpubLocalData(locator);
        updatePublicationNavigationState();
      }, 250);
      debounced();
    },
    tap: () => {
      toggleIsImmersive();
      return true;
    },
    click: () => true,
    zoom: () => {},
    miscPointer: () => {},
    scroll: () => {},
    customEvent: () => {},
    handleLocator: () => false,
    textSelected: (_selection: BasicTextSelection) => {},
    contentProtection: () => {},
    contextMenu: (_data: ContextMenuEvent) => {},
    peripheral: () => {},
  }), [setEpubLocalData, updatePublicationNavigationState, toggleIsImmersive]);

  const audioListeners: AudioNavigatorListeners = useMemo(() => ({
    timelineItemChanged: (item: TimelineItem | undefined) => {
      if (item) onAudioPositionChanged();
    },
    positionChanged: (locator) => {
      setAudioLocalData(locator);
      onAudioPositionChanged();
      if (audioNavigator.canGoBackward()) {
        dispatch(setPublicationStart(false));
      } else {
        dispatch(setPublicationStart(true));
      }
      if (audioNavigator.canGoForward()) {
        dispatch(setPublicationEnd(false));
      } else {
        dispatch(setPublicationEnd(true));
      }
    },
    trackLoaded: () => {
      onAudioSeek();
      syncToAudio(audioNavigator.currentTime(), true);
    },
    trackEnded: () => {},
    metadataLoaded: () => {},
    play: () => {},
    pause: () => {},
    stalled: () => {},
    seeking: (isSeeking) => {
      if (!isSeeking) onAudioSeek();
    },
    seekable: () => {},
    error: () => {},
    remotePlaybackStateChanged: () => {},
    contentProtection: () => {},
    peripheral: (data: KeyboardPeripheralEventData) => {
      const actionKey = fromActionPeripheralType(data.type);
      if (actionKey && profile) dispatch(toggleActionOpen({ key: actionKey, profile: "audio" }));
    },
    contextMenu: () => {},
  }), [
    setAudioLocalData,
    onAudioPositionChanged,
    onAudioSeek,
    syncToAudio,
    audioNavigator,
    dispatch,
    profile,
  ]);

  const keyboardPeripherals = useEpubKeyboardPeripherals();
  const audioKeyboardPeripherals = useAudioKeyboardPeripherals();

  const initialEpubPosition = useMemo(() => getEpubLocalData(), [getEpubLocalData]);
  const initialAudioPosition = useMemo(() => getAudioLocalData(), [getAudioLocalData]);

  const { navigatorReady: epubReady } = useEpubReaderInit({
    container,
    publication: epubPublication,
    positionsList,
    initialPosition: initialEpubPosition,
    listeners: epubListeners,
    preferences,
    cache,
    isFontFamilyUsed: Boolean(fontFamily),
    fontLanguage,
    getFontMetadata,
    injectFontResources,
    removeFontResources,
    getAndroidFXLPatch,
    getFontInjectables,
    fxlThemeKeys,
    reflowThemeKeys,
    arrowsOccupySpace,
    arrowsWidth,
    colorScheme,
    isFXL,
    contentProtectionConfig: resolveContentProtectionConfig(preferences.contentProtection, t),
    onNavigatorReady: () => dispatch(setLoading(false)),
  });

  useAudioPlayerInit({
    publication: audioPublication,
    initialPosition: initialAudioPosition,
    listeners: audioListeners,
    preferences: audioPreferences,
    cache: audioCache,
    contentProtectionConfig: resolveAudioContentProtectionConfig(audioPreferences.contentProtection, t),
    keyboardPeripherals: audioKeyboardPeripherals,
    onNavigatorLoaded: () => {
      if (syncEnabled) {
        syncToAudio(audioNavigator.currentTime(), true);
      }
    },
  });

  useFullscreen((isFullscreen) => dispatch(setFullscreen(isFullscreen)));

  useEffect(() => {
    dispatch(setImmersive(false));
    dispatch(setFollowAudio(true));
    resetSyncRefs();
  }, [dispatch, resetSyncRefs]);

  const actionKeys = isFXL ? fxlActionKeys : reflowActionKeys;
  const actionsOrder = isFXL ? preferences.actions.fxlOrder : preferences.actions.reflowOrder;

  const setContainerRef = useCallback(
    (el: Element | null) => {
      containerRefSetter?.(el);
    },
    [containerRefSetter]
  );

  useLayoutEffect(() => {
    if (!epubReady || !syncEnabled) return;
    syncToAudio(audioNavigator.currentTime(), true);
  }, [epubReady, syncEnabled, audioNavigator, syncToAudio]);

  return (
    <NavigatorProvider visualNavigator={ epubNavigator } mediaNavigator={ audioNavigator }>
      <main className={ classNames(readerStyles.main, readAlongStyles.main) }>
        { guidedNavigationError ? (
          <p className={ readAlongStyles.guidedNavWarning } role="status">
            { guidedNavigationError }
          </p>
        ) : null }
        <div className={ readAlongStyles.readerRegion }>
          <div
            ref={ setContainerRef }
            className={ getReaderClassNames({
              isScroll,
              isImmersive,
              isHovering,
              isFXL,
              layoutUI,
              breakpoint,
              containerBreakpoint,
            }) }
          >
            <StatefulReaderHeader
              actionKeys={ actionKeys }
              actionsOrder={ actionsOrder }
              layout={ layoutUI }
              runningHeadFormatPref={ preferences.theming.header?.runningHead?.format?.reflow }
            />

            { !isScroll ? (
              <nav className={ classNames(arrowStyles.container, arrowStyles.leftContainer) }>
                <StatefulReaderArrowButton
                  direction="left"
                  isDisabled={ isRTL ? atPublicationEnd : atPublicationStart }
                  onPress={ () => {
                    onUserEpubNavigation();
                    goLeft(!reducedMotion, () => {});
                  } }
                />
              </nav>
            ) : null }

            <article className={ readerStyles.wrapper } aria-label={ t("reader.app.publicationWrapper") }>
              <div
                id="thorium-web-container"
                className={ readerStyles.iframeContainer }
                ref={ container }
              />
            </article>

            { !isScroll ? (
              <nav className={ classNames(arrowStyles.container, arrowStyles.rightContainer) }>
                <StatefulReaderArrowButton
                  direction="right"
                  isDisabled={ isRTL ? atPublicationStart : atPublicationEnd }
                  onPress={ () => {
                    onUserEpubNavigation();
                    goRight(!reducedMotion, () => {});
                  } }
                />
              </nav>
            ) : null }

            <StatefulReaderFooter
              layout={ layoutUI }
              progressionFormatPref={ preferences.theming.progression?.format?.reflow }
              progressionFormatFallback={ ThProgressionFormat.resourceProgression }
            />
          </div>
        </div>

        <section className={ readAlongStyles.audioBar } aria-label={ t("audio.player.controls") }>
          <div className={ readAlongStyles.audioBarInner }>
            <div className={ readAlongStyles.audioBarTop }>
              <StatefulReadAlongFollowToggle />
            </div>
            <StatefulAudioProgressBar />
            <StatefulAudioPlaybackControls />
          </div>
        </section>
      </main>
    </NavigatorProvider>
  );
};
