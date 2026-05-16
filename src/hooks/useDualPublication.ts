"use client";

import { useEffect, useRef, useState } from "react";
import { Fetcher, GuidedNavigationDocument, Publication } from "@readium/shared";

import { loadPublicationFromUrl } from "@/helpers/loadPublication";
import { ErrorHandler, ProcessedError } from "@/helpers/errorHandler";
import { useAppDispatch } from "@/lib/hooks";
import {
  setFXL,
  setHasDisplayTransformability,
  setPositionsList,
  setRTL,
  setScriptMode,
  setTocTree,
} from "@/lib/publicationReducer";
import { setReaderProfile } from "@/lib/readerReducer";
import {
  setGuidedNavigationError,
  setGuidedNavigationLoaded,
  resetReadAlong,
} from "@/lib/readAlongReducer";
import { getScriptMode } from "@readium/navigator";
import {
  buildSyncIndex,
  discoverGuidedNavigation,
} from "@/readAlong/guidedNavigation";
import type { ReadAlongSyncIndex } from "@/readAlong/types";

export interface UseDualPublicationOptions {
  epubUrl: string;
  audioUrl: string;
  guidedNavigationUrl?: string;
  fetcher?: Fetcher;
  onError?: (error: ProcessedError) => void;
}

export interface UseDualPublicationReturn {
  isLoading: boolean;
  error: ProcessedError | null;
  epubPublication: Publication | null;
  audioPublication: Publication | null;
  epubLocalDataKey: string | null;
  audioLocalDataKey: string | null;
  guidedNavigation: GuidedNavigationDocument | null;
  syncIndex: ReadAlongSyncIndex | null;
  isFXL: boolean;
  isRTL: boolean;
}

export const useDualPublication = ({
  epubUrl,
  audioUrl,
  guidedNavigationUrl,
  fetcher,
  onError,
}: UseDualPublicationOptions): UseDualPublicationReturn => {
  const dispatch = useAppDispatch();
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ProcessedError | null>(null);
  const [epubPublication, setEpubPublication] = useState<Publication | null>(null);
  const [audioPublication, setAudioPublication] = useState<Publication | null>(null);
  const [epubLocalDataKey, setEpubLocalDataKey] = useState<string | null>(null);
  const [audioLocalDataKey, setAudioLocalDataKey] = useState<string | null>(null);
  const [guidedNavigation, setGuidedNavigation] = useState<GuidedNavigationDocument | null>(null);
  const [syncIndex, setSyncIndex] = useState<ReadAlongSyncIndex | null>(null);
  const [isFXL, setIsFXL] = useState(false);
  const [isRTL, setIsRTL] = useState(false);

  useEffect(() => {
    if (!epubUrl || !audioUrl) {
      const validationError = ErrorHandler.process(
        new Error("Both epubUrl and audioUrl are required"),
        "Validation"
      );
      setError(validationError);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      dispatch(resetReadAlong());
      dispatch(setReaderProfile("readAlong"));
      dispatch(setGuidedNavigationLoaded(false));
      dispatch(setGuidedNavigationError(null));

      try {
        const [epubLoaded, audioLoaded] = await Promise.all([
          loadPublicationFromUrl(epubUrl, fetcher, "epub-current-location"),
          loadPublicationFromUrl(audioUrl, fetcher, "audio-current-location"),
        ]);

        if (cancelled) return;

        if (epubLoaded.profile !== "epub") {
          throw new Error("epubUrl must resolve to an EPUB publication");
        }
        if (audioLoaded.profile !== "audio") {
          throw new Error("audioUrl must resolve to an audiobook publication");
        }

        setEpubPublication(epubLoaded.publication);
        setAudioPublication(audioLoaded.publication);
        setEpubLocalDataKey(epubLoaded.localDataKey);
        setAudioLocalDataKey(audioLoaded.localDataKey);
        setIsFXL(epubLoaded.isFXL);
        setIsRTL(epubLoaded.isRTL || audioLoaded.isRTL);

        dispatch(setRTL(epubLoaded.isRTL || audioLoaded.isRTL));
        dispatch(setFXL(epubLoaded.isFXL));
        dispatch(setScriptMode(getScriptMode(epubLoaded.publication.metadata)));
        dispatch(setPositionsList(epubLoaded.positionsList));
        dispatch(setHasDisplayTransformability(epubLoaded.hasDisplayTransformability));

        if (audioLoaded.tocTree) {
          dispatch(setTocTree(audioLoaded.tocTree));
        }

        const gn = await discoverGuidedNavigation(
          epubLoaded.publication,
          audioLoaded.publication,
          guidedNavigationUrl
        );

        if (cancelled) return;

        if (!gn) {
          const gnError = "No Guided Navigation document found for this publication pair.";
          dispatch(setGuidedNavigationError(gnError));
          console.warn("[readAlong]", gnError);
        } else {
          setGuidedNavigation(gn);
          setSyncIndex(
            buildSyncIndex(gn, {
              audioBaseUrl: audioLoaded.publication.baseURL,
              epubBaseUrl: epubLoaded.publication.baseURL,
            })
          );
          dispatch(setGuidedNavigationLoaded(true));
        }

        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        const processed = ErrorHandler.process(err, "Read-along load");
        setError(processed);
        setIsLoading(false);
        onErrorRef.current?.(processed);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [epubUrl, audioUrl, guidedNavigationUrl, fetcher, dispatch]);

  useEffect(() => {
    if (error) onErrorRef.current?.(error);
  }, [error]);

  return {
    isLoading,
    error,
    epubPublication,
    audioPublication,
    epubLocalDataKey,
    audioLocalDataKey,
    guidedNavigation,
    syncIndex,
    isFXL,
    isRTL,
  };
};
