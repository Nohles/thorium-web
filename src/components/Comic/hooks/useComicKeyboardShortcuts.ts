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
};

/** Widgets that consume arrow/letter keys themselves; the reader must not also act on them. */
const KEY_CONSUMING_ROLES = new Set([
  "slider",
  "spinbutton",
  "radio",
  "radiogroup",
  "listbox",
  "option",
  "menu",
  "menuitem",
  "menuitemradio",
  "menuitemcheckbox",
  "tab",
  "tablist",
  "tree",
  "treeitem",
  "grid",
  "gridcell",
  "combobox",
  "textbox",
  "searchbox",
]);

const isKeyConsumingTarget = (target: HTMLElement | null): boolean => {
  if (!target) return false;
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  ) {
    return true;
  }
  const role = target.getAttribute("role");
  if (role && KEY_CONSUMING_ROLES.has(role)) return true;
  // Sheets, popovers and modals own the keyboard while focus is inside them.
  return !!target.closest("[role='dialog'], [role='alertdialog']");
};

export const useComicKeyboardShortcuts = ({
  direction,
  onPrev,
  onNext,
  onToggleMenu,
  onCycleScaleType,
  onCycleReadingMode,
  onCycleDirection,
}: ComicKeyboardHandlers) => {
  useEffect(() => {
    const isRtl = direction === ComicReadingDirection.rtl;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isKeyConsumingTarget(event.target as HTMLElement | null)) return;

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
  ]);
};
