"use client";

import { useCallback, useRef } from "react";

import { READ_ALONG_HIGHLIGHT_ATTR } from "@/readAlong/guidedNavigation";

type FrameLike = { window?: Window } | undefined;

export const useReadAlongHighlight = (
  getCframes: () => FrameLike[] | undefined
) => {
  const lastFragmentId = useRef<string | null>(null);

  const clearHighlights = useCallback(() => {
    const frames = getCframes() ?? [];
    for (const frame of frames) {
      const doc = frame?.window?.document;
      if (!doc) continue;
      doc.querySelectorAll(`[${READ_ALONG_HIGHLIGHT_ATTR}]`).forEach((el) => {
        el.removeAttribute(READ_ALONG_HIGHLIGHT_ATTR);
        (el as HTMLElement).style.removeProperty("background-color");
      });
    }
    lastFragmentId.current = null;
  }, [getCframes]);

  const applyHighlight = useCallback((fragmentId?: string) => {
    if (!fragmentId) {
      clearHighlights();
      return;
    }
    if (lastFragmentId.current === fragmentId) return;

    clearHighlights();
    lastFragmentId.current = fragmentId;

    const frames = getCframes() ?? [];
    for (const frame of frames) {
      const doc = frame?.window?.document;
      if (!doc) continue;
      const target = doc.getElementById(fragmentId);
      if (target) {
        target.setAttribute(READ_ALONG_HIGHLIGHT_ATTR, "true");
        target.style.backgroundColor = "rgba(255, 214, 0, 0.45)";
      }
    }
  }, [clearHighlights, getCframes]);

  return { applyHighlight, clearHighlights };
};
