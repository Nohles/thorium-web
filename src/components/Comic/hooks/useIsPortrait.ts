"use client";

import { useSyncExternalStore } from "react";

const PORTRAIT_QUERY = "(orientation: portrait)";

const subscribe = (onChange: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(PORTRAIT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const getSnapshot = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(PORTRAIT_QUERY).matches;

/** True while the window is taller than wide. */
export const useIsPortrait = (): boolean => useSyncExternalStore(subscribe, getSnapshot, () => false);
