"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  decorationFrameTargetsFromNavigator,
  pushDecorationsToFrames,
} from "./ReaderInteractions";
import type { ReaderDecorationInput } from "./ReaderInteractions";

interface UseReaderDecorationsProps {
  /** Returns the live navigator instance (or null while initializing). */
  getNavigator?: () => unknown;
  decorations?: readonly ReaderDecorationInput[];
}

/**
 * Pushes decorations into live reader frames. Frames are created and swapped
 * asynchronously by the navigator (and their comms channels come up lazily),
 * so we poll cheaply and re-push whenever the frame set changes — and keep
 * retrying until the frame-side Decorator acknowledges every request.
 *
 * Pushes are diffed against per-frame state, so re-running with identical
 * content is a no-op and genuine changes never flash (no clear+re-add-all).
 */
export function useReaderDecorations({
  getNavigator,
  decorations,
}: UseReaderDecorationsProps) {
  const signature = useMemo(
    () => JSON.stringify(decorations ?? []),
    [decorations],
  );
  const lastGoodKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const decorationsRef = useRef(decorations);
  decorationsRef.current = decorations;

  useEffect(() => {
    if (!getNavigator || decorations === undefined) return;
    let disposed = false;

    const tick = async () => {
      if (inFlightRef.current || disposed) return;
      const navigator = getNavigator();
      const targets = decorationFrameTargetsFromNavigator(navigator);
      const stateKey = JSON.stringify([
        signature,
        targets?.map((target) => [target.href, Boolean(target.msg)]) ?? null,
      ]);
      if (stateKey === lastGoodKeyRef.current) return;
      inFlightRef.current = true;
      try {
        const ok = await pushDecorationsToFrames(
          navigator,
          decorationsRef.current ?? [],
        );
        if (disposed) return;
        lastGoodKeyRef.current = ok ? stateKey : null;
      } finally {
        inFlightRef.current = false;
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), 600);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [getNavigator, decorations, signature]);

  // Remove decorations from live frames only when the hook stops rendering
  // them or unmounts — not on every incidental effect re-run, which used to
  // wipe and repaint the highlights on each parent render.
  const getNavigatorRef = useRef(getNavigator);
  getNavigatorRef.current = getNavigator;
  const hasDecorations = decorations !== undefined;
  useEffect(() => {
    return () => {
      if (!hasDecorations) return;
      lastGoodKeyRef.current = null;
      void pushDecorationsToFrames(getNavigatorRef.current, []);
    };
  }, [hasDecorations]);
}
