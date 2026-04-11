"use client";

import { ComicReadingDirection } from "@/lib/comicSettingsReducer";
import { useEffect } from "react";

export type ComicKeyboardHandlers = {
  direction: ComicReadingDirection;
  onPrev: () => void;
  onNext: () => void;
  onToggleMenu: () => void;
  onCycleScaleType: () => void;
  onCycleReadingMode: () => void;
  onCycleDirection: () => void;
  onToggleAutoScroll: () => void;
};

export const useComicKeyboardShortcuts = ({
  direction,
  onPrev,
  onNext,
  onToggleMenu,
  onCycleScaleType,
  onCycleReadingMode,
  onCycleDirection,
  onToggleAutoScroll,
}: ComicKeyboardHandlers) => {
  useEffect(() => {
    const isRtl = direction === ComicReadingDirection.rtl;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          event.preventDefault();
          if (isRtl) onNext();
          else onPrev();
          break;
        case "ArrowRight":
        case "d":
        case "D":
          event.preventDefault();
          if (isRtl) onPrev();
          else onNext();
          break;
        case "m":
        case "M":
          event.preventDefault();
          onToggleMenu();
          break;
        case "i":
        case "I":
          event.preventDefault();
          onCycleScaleType();
          break;
        case "r":
        case "R":
          event.preventDefault();
          onCycleReadingMode();
          break;
        case "t":
        case "T":
          event.preventDefault();
          onCycleDirection();
          break;
        case " ":
          event.preventDefault();
          onToggleAutoScroll();
          break;
        default:
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    direction,
    onPrev,
    onNext,
    onToggleMenu,
    onCycleScaleType,
    onCycleReadingMode,
    onCycleDirection,
    onToggleAutoScroll,
  ]);
};
