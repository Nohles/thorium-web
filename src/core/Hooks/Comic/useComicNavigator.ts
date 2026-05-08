"use client";

import { useCallback, useRef } from "react";
import { getScriptMode } from "@readium/navigator";
import { Link, Locator, Publication } from "@readium/shared";

type NavigationCallback = (ok: boolean) => void;

export interface ComicNavigatorBind {
  publication: Publication;
  links: Link[];
  cursorIndex: number;
  setCursorIndex: (index: number) => void;
  step: number;
}

const normalizeHref = (href: string) => {
  const [base] = href.split("#");
  const [path] = base.split("?");
  return path;
};

const linkMatches = (a: Link, b: Link) => normalizeHref(a.href) === normalizeHref(b.href);

/**
 * Lightweight comic “navigator” compatible with {@link NavigatorProvider} / {@link useNavigator}.
 * State is driven by the reader via {@link ComicNavigatorBind}; call `bind` each time index/links change.
 */
export const useComicNavigator = () => {
  const bindStore = useRef<ComicNavigatorBind | null>(null);

  const bind = useCallback((config: ComicNavigatorBind) => {
    bindStore.current = config;
  }, []);

  const locatorAtIndex = useCallback((index: number): Locator | null => {
    const b = bindStore.current;
    if (!b?.publication?.manifest || index < 0 || index >= b.links.length) return null;
    const link = b.links[index];
    return b.publication.manifest.locatorFromLink(link) ?? null;
  }, []);

  const indexForLink = useCallback((link: Link): number => {
    const b = bindStore.current;
    if (!b) return -1;
    return b.links.findIndex((l) => linkMatches(l, link));
  }, []);

  const indexForLocator = useCallback(
    (locator: Locator) => indexForLink(new Link({ href: locator.href })),
    [indexForLink]
  );

  const currentLocator = useCallback((): Locator | undefined => {
    const b = bindStore.current;
    if (!b || b.links.length === 0) return undefined;
    return locatorAtIndex(b.cursorIndex) ?? undefined;
  }, [locatorAtIndex]);

  const go = useCallback(
    (locator: Locator, _animated: boolean, callback: NavigationCallback) => {
      const idx = indexForLocator(locator);
      const b = bindStore.current;
      if (idx < 0 || !b) {
        callback(false);
        return;
      }
      b.setCursorIndex(idx);
      callback(true);
    },
    [indexForLocator]
  );

  const goLink = useCallback(
    (link: Link, _animated: boolean, callback: NavigationCallback) => {
      const idx = indexForLink(link);
      const b = bindStore.current;
      if (idx < 0 || !b) {
        callback(false);
        return;
      }
      b.setCursorIndex(idx);
      callback(true);
    },
    [indexForLink]
  );

  const previousLocator = useCallback((): Locator | null => {
    const b = bindStore.current;
    if (!b) return null;
    const idx = b.cursorIndex - b.step;
    if (idx < 0) return null;
    return locatorAtIndex(idx);
  }, [locatorAtIndex]);

  const nextLocator = useCallback((): Locator | null => {
    const b = bindStore.current;
    if (!b) return null;
    const idx = b.cursorIndex + b.step;
    if (idx >= b.links.length) return null;
    return locatorAtIndex(idx);
  }, [locatorAtIndex]);

  const goBackward = useCallback((_animated: boolean, callback: NavigationCallback) => {
    const b = bindStore.current;
    if (!b) {
      callback(false);
      return;
    }
    const next = Math.max(0, b.cursorIndex - b.step);
    if (next === b.cursorIndex) {
      callback(false);
      return;
    }
    b.setCursorIndex(next);
    callback(true);
  }, []);

  const goForward = useCallback((_animated: boolean, callback: NavigationCallback) => {
    const b = bindStore.current;
    if (!b) {
      callback(false);
      return;
    }
    const next = Math.min(b.links.length - 1, b.cursorIndex + b.step);
    if (next === b.cursorIndex) {
      callback(false);
      return;
    }
    b.setCursorIndex(next);
    callback(true);
  }, []);

  const getSetting = useCallback(() => undefined, []);

  const submitPreferences = useCallback(async () => {}, []);

  const getCframes = useCallback(() => undefined, []);

  const currentScriptMode = useCallback(() => {
    const metadata = bindStore.current?.publication?.metadata;
    if (!metadata) return undefined;
    return getScriptMode(metadata);
  }, []);

  return {
    isComicNavigator: true as const,
    bind,
    go,
    goLink,
    currentLocator,
    previousLocator,
    nextLocator,
    goForward,
    goBackward,
    getSetting,
    submitPreferences,
    preferencesEditor: undefined,
    getCframes,
    getScriptMode: currentScriptMode,
  };
};

export type ComicNavigator = ReturnType<typeof useComicNavigator>;
