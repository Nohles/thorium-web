"use client";

import { useMemo } from "react";

import { IKeyboardPeripheralsConfig } from "@readium/navigator";
import { ThActionsKeys, ThComicShortcutKeys, defaultComicShortcuts } from "@/preferences/models";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useActionsPreferences } from "@/preferences/hooks/useActionsPreferences";
import { useFilteredPreferenceKeys } from "@/preferences/hooks/useFilteredPreferenceKeys";
import { useFullscreen } from "@/core/Hooks/useFullscreen";
import { useActionComponentStatus } from "@/components/Actions/hooks/useActionComponentStatus";

import {
  NavPeripheralType,
  toActionPeripheralType,
  toComicPeripheralType,
  toDockingPeripheralType,
} from "@/helpers/peripherals";

/**
 * Keyboard shortcuts for the comic reader, built from preferences like the EPUB and
 * audio readers: shared action/docking shortcuts, page navigation, and the comic
 * shortcuts from `shortcuts.comic`.
 *
 * @param isPaged Paginated modes take Space, PageUp/PageDown, Up/Down, Home and End;
 * continuous modes leave them to native scrolling.
 */
export const useComicKeyboardPeripherals = ({ isPaged }: { isPaged: boolean }): IKeyboardPeripheralsConfig => {
  const { preferences } = usePreferences();
  const { actionsKeys, docking } = useActionsPreferences();
  const { isSupported: isFullscreenSupported } = useFullscreen();
  const { fxlActionKeys } = useFilteredPreferenceKeys();

  const { isComponentAvailable: isFullscreenAvailable }     = useActionComponentStatus({ actionKey: ThActionsKeys.fullscreen,     orderArray: fxlActionKeys, additionalCondition: isFullscreenSupported });
  const { isComponentAvailable: isTocAvailable }            = useActionComponentStatus({ actionKey: ThActionsKeys.toc,            orderArray: fxlActionKeys });
  const { isComponentAvailable: isSettingsAvailable }       = useActionComponentStatus({ actionKey: ThActionsKeys.settings,       orderArray: fxlActionKeys });
  const { isComponentAvailable: isJumpToPositionAvailable } = useActionComponentStatus({ actionKey: ThActionsKeys.jumpToPosition, orderArray: fxlActionKeys });

  const comicShortcuts = preferences.shortcuts.comic;

  return useMemo(() => {
    const actionAvailability: Record<string, boolean> = {
      [ThActionsKeys.fullscreen]:     isFullscreenAvailable,
      [ThActionsKeys.toc]:            isTocAvailable,
      [ThActionsKeys.settings]:       isSettingsAvailable,
      [ThActionsKeys.jumpToPosition]: isJumpToPositionAvailable,
    };

    const config: IKeyboardPeripheralsConfig = [
      { type: NavPeripheralType.moveLeft,  keyCombos: [{ keyCode: 37, suppressOnInteractiveElement: true }] },
      { type: NavPeripheralType.moveRight, keyCombos: [{ keyCode: 39, suppressOnInteractiveElement: true }] },
    ];

    if (isPaged) {
      config.push(
        { type: NavPeripheralType.progressForward,  keyCombos: [{ keyCode: 32,              suppressOnInteractiveElement: true }] },
        { type: NavPeripheralType.progressBackward, keyCombos: [{ keyCode: 32, shift: true, suppressOnInteractiveElement: true }] },
        { type: NavPeripheralType.moveUp,           keyCombos: [{ keyCode: 38,              suppressOnInteractiveElement: true },
                                                                { keyCode: 33,              suppressOnInteractiveElement: true }] },
        { type: NavPeripheralType.moveDown,         keyCombos: [{ keyCode: 40,              suppressOnInteractiveElement: true },
                                                                { keyCode: 34,              suppressOnInteractiveElement: true }] },
        { type: NavPeripheralType.moveHome,         keyCombos: [{ keyCode: 36,              suppressOnInteractiveElement: true }] },
        { type: NavPeripheralType.moveEnd,          keyCombos: [{ keyCode: 35,              suppressOnInteractiveElement: true }] },
      );
    }

    for (const key of Object.values(ThComicShortcutKeys)) {
      const shortcut = comicShortcuts && key in comicShortcuts ? comicShortcuts[key] : defaultComicShortcuts[key];
      if (shortcut) config.push({ type: toComicPeripheralType(key), keyCombos: shortcut.keyCombos });
    }

    for (const [key, tokens] of Object.entries(actionsKeys)) {
      const shortcut = tokens?.shortcut;
      const isAvailable = actionAvailability[key] ?? true;
      if (shortcut && isAvailable) config.push({ type: toActionPeripheralType(key), keyCombos: shortcut.keyCombos });
    }

    for (const [key, tokens] of Object.entries(docking.keys)) {
      if (tokens?.shortcut) config.push({ type: toDockingPeripheralType(key), keyCombos: tokens.shortcut.keyCombos });
    }

    return config;
  }, [isPaged, comicShortcuts, actionsKeys, docking.keys, isFullscreenAvailable, isTocAvailable, isSettingsAvailable, isJumpToPositionAvailable]);
};
