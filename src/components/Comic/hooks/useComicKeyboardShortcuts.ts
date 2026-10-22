"use client";

import { useEffect, useRef } from "react";

import { IKeyboardPeripheralsConfig } from "@readium/navigator";
import { KeyCombinationManager, KeyCombo } from "@readium/navigator-html-injectables";

/** Widgets that handle keys themselves; the reader must not also act on them. */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "switch",
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

const isInteractiveElement = (element: Element | null): boolean => {
  if (!element || element === document.body || element === document.documentElement) return false;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  if (element.matches("a[href], button, input, select, textarea, summary")) return true;
  const role = element.getAttribute("role");
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  // Sheets, popovers and modals own the keyboard while focus is inside them.
  return !!element.closest("[role='dialog'], [role='alertdialog']");
};

const isSuppressed = (rule: KeyCombo["suppressOnInteractiveElement"], active: Element | null): boolean => {
  if (!rule) return false;
  if (Array.isArray(rule)) return !!active && rule.some((selector) => active.matches(selector));
  return isInteractiveElement(active);
};

const keyCombinations = new KeyCombinationManager();

/**
 * Listens on the window for the comic peripherals and reports the matched peripheral type,
 * mirroring how the Readium navigators deliver `peripheral` events to the other readers.
 */
export const useComicKeyboardShortcuts = (
  config: IKeyboardPeripheralsConfig,
  onPeripheral: (type: string) => void
) => {
  const onPeripheralRef = useRef(onPeripheral);

  useEffect(() => {
    onPeripheralRef.current = onPeripheral;
  }, [onPeripheral]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const active = document.activeElement;
      for (const peripheral of config) {
        for (const combo of peripheral.keyCombos) {
          if (!keyCombinations.match(event, [combo])) continue;
          if (isSuppressed(combo.suppressOnInteractiveElement, active)) return;
          event.preventDefault();
          onPeripheralRef.current(peripheral.type);
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [config]);
};
