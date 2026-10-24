import { ThShortcutConfig } from "./actions";

/** Comic reader commands that can be bound to keyboard shortcuts. */
export enum ThComicShortcutKeys {
  /** Page turn towards the left edge: previous in LTR, next in RTL. Complements ArrowLeft. */
  pageLeft = "pageLeft",
  /** Page turn towards the right edge: next in LTR, previous in RTL. Complements ArrowRight. */
  pageRight = "pageRight",
  toggleMenu = "toggleMenu",
  cycleScaleType = "cycleScaleType",
  cycleReadingMode = "cycleReadingMode",
  toggleDirection = "toggleDirection",
}

/**
 * Overrides for the comic shortcuts. Omitted keys keep their default;
 * `null` turns a shortcut off (single-character shortcuts must be
 * disableable to meet WCAG 2.1.4).
 */
export type ThComicShortcutsPref = Partial<Record<ThComicShortcutKeys, ThShortcutConfig | null>>;

const letter = (keyCode: number): ThShortcutConfig => ({
  keyCombos: [{ keyCode, suppressOnInteractiveElement: true }],
});

export const defaultComicShortcuts: Record<ThComicShortcutKeys, ThShortcutConfig> = {
  [ThComicShortcutKeys.pageLeft]: letter(65),         // A
  [ThComicShortcutKeys.pageRight]: letter(68),        // D
  [ThComicShortcutKeys.toggleMenu]: letter(77),       // M
  [ThComicShortcutKeys.cycleScaleType]: letter(73),   // I
  [ThComicShortcutKeys.cycleReadingMode]: letter(82), // R
  [ThComicShortcutKeys.toggleDirection]: letter(84),  // T
};
