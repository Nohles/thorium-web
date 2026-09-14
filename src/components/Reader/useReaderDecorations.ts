"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  DecorationLayout,
  DecorationStyleType,
  DecorationWidth,
  type Decoration,
  type DecorationObserver,
  type OnDecorationActivatedEvent,
} from "@readium/navigator";
import { Locator } from "@readium/shared";
import {
  decorationFrameTargetsFromNavigator,
  ensureNavigatorFrameListeners,
  pushDecorationsToFrames,
  setDecorationGroupActivatable,
} from "./ReaderInteractions";
import type {
  ReaderDecorationInput,
  ReadiumDecorationActivatedEvent,
} from "./ReaderInteractions";

const ACTIVATION_GROUP = "reader-decoration-activations";
const ACTIVATION_REGISTRY_HREF = "reader-decoration-activation-registry";

interface NativeDecorationNavigator {
  applyDecorations(decorations: Decoration[], group: string): void;
  registerDecorationObserver(group: string, observer: DecorationObserver): void;
  unregisterDecorationObserver(observer: DecorationObserver): void;
}

const isNativeDecorationNavigator = (
  value: unknown,
): value is NativeDecorationNavigator => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NativeDecorationNavigator>;
  return (
    typeof candidate.applyDecorations === "function" &&
    typeof candidate.registerDecorationObserver === "function" &&
    typeof candidate.unregisterDecorationObserver === "function"
  );
};

const activationDecoration = (
  decoration: ReaderDecorationInput,
): Decoration | null => {
  if (decoration.activation && decoration.activation !== "both") return null;
  const source =
    decoration.locator && typeof decoration.locator === "object"
      ? (decoration.locator as Record<string, unknown>)
      : null;
  if (!source) return null;
  const locator = Locator.deserialize({
    ...source,
    type: source.type ?? "application/xhtml+xml",
  });
  if (!locator) return null;
  return {
    id: decoration.id,
    locator,
    extras: decoration.extras,
    // Rendering remains owned by the existing diffed decoration group. This
    // transparent copy only lets Readium perform exact range hit-testing.
    style: {
      type: DecorationStyleType.Highlight,
      tint: "rgba(0, 0, 0, 0)",
      layout: DecorationLayout.Boxes,
      width: DecorationWidth.Wrap,
      enforceContrast: false,
    },
  };
};

interface UseReaderDecorationsProps {
  /** Returns the live navigator instance (or null while initializing). */
  getNavigator?: () => unknown;
  decorations?: readonly ReaderDecorationInput[];
  onDecorationActivated?: (event: ReadiumDecorationActivatedEvent) => void;
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
  onDecorationActivated,
}: UseReaderDecorationsProps) {
  const signature = useMemo(
    () => JSON.stringify(decorations ?? []),
    [decorations],
  );
  const lastGoodKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const decorationsRef = useRef(decorations);
  decorationsRef.current = decorations;
  const activationRef = useRef(onDecorationActivated);
  activationRef.current = onDecorationActivated;
  const nativeActivationEnabled = Boolean(onDecorationActivated);

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

  useEffect(() => {
    if (!getNavigator || decorations === undefined || !nativeActivationEnabled) {
      return;
    }
    let disposed = false;
    let activeNavigator: NativeDecorationNavigator | null = null;
    const observer: DecorationObserver = {
      onDecorationActivated: (event: OnDecorationActivatedEvent) => {
        const original = nativeDecorationsById.get(event.decoration.id);
        activationRef.current?.({
          ...event,
          decoration: original ?? event.decoration,
        } as ReadiumDecorationActivatedEvent);
        return true;
      },
    };
    const nativeDecorations = decorations
      .map(activationDecoration)
      .filter((item): item is Decoration => item !== null);
    const nativeDecorationsById = new Map(
      nativeDecorations.map((decoration) => [decoration.id, decoration]),
    );
    const activatableIds = new Set(nativeDecorationsById.keys());
    const activatableDecorations = decorations.filter((decoration) =>
      activatableIds.has(decoration.id),
    );
    // Readium's observer resolves events through its internal decoration map.
    // Registry locators intentionally never match a publication resource; the
    // real transparent ranges are synced below through the live frame channel.
    const registryDecorations = nativeDecorations.map((decoration) => ({
      ...decoration,
      locator: new Locator({
        href: `${ACTIVATION_REGISTRY_HREF}/${encodeURIComponent(decoration.id)}`,
        type: decoration.locator.type,
        title: decoration.locator.title,
        locations: decoration.locator.locations,
        text: decoration.locator.text,
      }),
    }));

    const disconnect = () => {
      if (!activeNavigator) return;
      activeNavigator.applyDecorations([], ACTIVATION_GROUP);
      activeNavigator.unregisterDecorationObserver(observer);
      setDecorationGroupActivatable(
        activeNavigator,
        ACTIVATION_GROUP,
        false,
      );
      void pushDecorationsToFrames(activeNavigator, [], {
        group: ACTIVATION_GROUP,
        activationOnly: true,
      });
      activeNavigator = null;
    };
    const tick = () => {
      if (disposed) return;
      const navigator = getNavigator();
      if (!isNativeDecorationNavigator(navigator)) {
        disconnect();
        return;
      }
      if (navigator !== activeNavigator) {
        disconnect();
        activeNavigator = navigator;
        navigator.registerDecorationObserver(ACTIVATION_GROUP, observer);
        navigator.applyDecorations(registryDecorations, ACTIVATION_GROUP);
      }
      ensureNavigatorFrameListeners(navigator);
      void pushDecorationsToFrames(
        navigator,
        activatableDecorations,
        {
          group: ACTIVATION_GROUP,
          activationOnly: true,
        },
      ).then((synced) => {
        if (synced && !disposed && navigator === activeNavigator) {
          // The frame creates a decoration group on its first `decorate`
          // message. The navigator may not expose that pooled frame through
          // its current viewport yet, so enable activation on the same direct
          // channel used to sync the ranges.
          setDecorationGroupActivatable(
            navigator,
            ACTIVATION_GROUP,
            true,
          );
        }
      });
    };

    tick();
    const interval = setInterval(tick, 600);
    return () => {
      disposed = true;
      clearInterval(interval);
      disconnect();
    };
  }, [decorations, getNavigator, nativeActivationEnabled, signature]);
}
