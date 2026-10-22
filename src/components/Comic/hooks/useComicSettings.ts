"use client";

import { useCallback, useMemo } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ComicSettings, resolveComicSettings, updateComicSettings } from "@/lib/comicSettingsReducer";

/**
 * Effective comic settings (shared settings plus the publication's own) and a patch function.
 * Defaults to the active publication, so settings components need no key.
 */
export const useComicSettings = (key?: string | null) => {
  const dispatch = useAppDispatch();
  const comicSettings = useAppSelector((state) => state.comicSettings);
  const resolvedKey = key ?? comicSettings.activeKey;

  const settings = useMemo(
    () => resolveComicSettings(comicSettings, resolvedKey),
    [comicSettings, resolvedKey]
  );

  const patch = useCallback(
    (values: Partial<ComicSettings>) => {
      if (!resolvedKey) return;
      dispatch(updateComicSettings({ key: resolvedKey, patch: values }));
    },
    [dispatch, resolvedKey]
  );

  return { settings, patch };
};
