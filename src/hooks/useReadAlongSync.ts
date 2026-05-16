"use client";

import { useCallback, useEffect, useRef } from "react";
import debounce from "debounce";

import { Locator, Publication } from "@readium/shared";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActiveSyncPointId } from "@/lib/readAlongReducer";
import { matchSyncPoint, normalizeResourceHref } from "@/readAlong/guidedNavigation";
import type { ReadAlongSyncIndex } from "@/readAlong/types";

interface EpubNavigatorApi {
  go: (locator: Locator, animated: boolean, callback: (ok: boolean) => void) => void;
  currentLocator: () => Locator | undefined;
  getCframes: () => ({ window?: Window } | undefined)[] | undefined;
}

interface AudioNavigatorApi {
  currentLocator: () => Locator | undefined;
  currentTime: () => number;
}

interface UseReadAlongSyncOptions {
  enabled: boolean;
  syncIndex: ReadAlongSyncIndex | null;
  epubPublication: Publication | null;
  audioPublication: Publication | null;
  epubNavigator: EpubNavigatorApi;
  audioNavigator: AudioNavigatorApi;
  applyHighlight: (fragmentId?: string) => void;
  pollIntervalMs?: number;
}

export const useReadAlongSync = ({
  enabled,
  syncIndex,
  epubPublication,
  audioPublication,
  epubNavigator,
  audioNavigator,
  applyHighlight,
  pollIntervalMs = 250,
}: UseReadAlongSyncOptions) => {
  const dispatch = useAppDispatch();
  const followAudio = useAppSelector((state) => state.readAlong.followAudio);
  const lastTextHref = useRef<string | null>(null);
  const lastSyncPointId = useRef<string | null>(null);

  const syncToAudio = useCallback(
    (time: number, force = false) => {
      if (!enabled || !followAudio || !syncIndex || !epubPublication || !audioPublication) {
        return;
      }

      const audioLocator = audioNavigator.currentLocator();
      if (!audioLocator) return;

      const audioHref = normalizeResourceHref(
        audioLocator.href,
        audioPublication.baseURL
      );

      const match = matchSyncPoint(
        syncIndex,
        audioHref,
        time,
        epubPublication,
        audioPublication.baseURL
      );

      if (!match) return;

      dispatch(setActiveSyncPointId(match.point.id));

      if (match.point.text.fragmentId) {
        applyHighlight(match.point.text.fragmentId);
      } else {
        applyHighlight(undefined);
      }

      const textHref = match.locator.href;
      const shouldNavigate =
        force
        || lastTextHref.current !== textHref
        || lastSyncPointId.current !== match.point.id;

      if (!shouldNavigate) return;

      lastTextHref.current = textHref;
      lastSyncPointId.current = match.point.id;

      epubNavigator.go(match.locator, true, () => {});
    },
    [
      enabled,
      followAudio,
      syncIndex,
      epubPublication,
      audioPublication,
      audioNavigator,
      epubNavigator,
      applyHighlight,
      dispatch,
    ]
  );

  const debouncedSync = useRef(
    debounce((time: number, force?: boolean) => {
      syncToAudio(time, force);
    }, 150)
  ).current;

  useEffect(() => {
    if (!enabled || !followAudio || !syncIndex) return;

    const tick = () => {
      syncToAudio(audioNavigator.currentTime());
    };

    tick();
    const id = window.setInterval(tick, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, followAudio, syncIndex, pollIntervalMs, audioNavigator, syncToAudio]);

  const onAudioPositionChanged = useCallback(() => {
    debouncedSync(audioNavigator.currentTime(), true);
  }, [audioNavigator, debouncedSync]);

  const onAudioSeek = useCallback(() => {
    syncToAudio(audioNavigator.currentTime(), true);
  }, [audioNavigator, syncToAudio]);

  const resetSyncRefs = useCallback(() => {
    lastTextHref.current = null;
    lastSyncPointId.current = null;
  }, []);

  return {
    onAudioPositionChanged,
    onAudioSeek,
    resetSyncRefs,
    syncToAudio,
  };
};
