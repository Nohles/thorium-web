"use client";

import { CSSProperties } from "react";

import styles from "../assets/styles/thorium-web.comic.module.css";

import {
  ComicProgressBarPosition,
  ComicProgressBarType,
  ComicReadingDirection,
  ComicReadingMode,
  ComicSettings,
} from "@/lib/comicSettingsReducer";
import { ThLayoutUI } from "@/preferences/models";
import { ComicReaderProgressNavigator } from "./ComicReaderProgressNavigator";
import { ComicProgressItem } from "../lib/comicProgress";

const resolveEffectiveProgressPosition = (
  settings: ComicSettings,
  mode: ComicReadingMode
): ComicProgressBarPosition => {
  if (settings.progressBarPosition !== ComicProgressBarPosition.auto) {
    return settings.progressBarPosition;
  }
  return mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon
    ? ComicProgressBarPosition.right
    : ComicProgressBarPosition.bottom;
};

export const ComicReaderProgress = ({
  mode,
  direction,
  settings,
  layoutUI,
  isChromeVisible,
  items,
  totalPages,
  onJumpTo,
}: {
  mode: ComicReadingMode;
  direction: ComicReadingDirection;
  settings: ComicSettings;
  layoutUI: ThLayoutUI;
  /** Layered header/footer are showing, so the rail moves clear of them. */
  isChromeVisible: boolean;
  items: ComicProgressItem[];
  totalPages: number;
  onJumpTo: (index: number) => void;
}) => {
  if (settings.progressBarType !== ComicProgressBarType.standard) return null;

  const position = resolveEffectiveProgressPosition(settings, mode);
  const inset =
    layoutUI === ThLayoutUI.layered && isChromeVisible ? "calc(var(--th-icon-size, 24px) * 2.5)" : "0px";

  return (
    <div
      className={styles.progress}
      data-position={position}
      style={{ "--th-comic-progress-inset": inset } as CSSProperties}
    >
      <ComicReaderProgressNavigator
        items={items}
        position={position}
        direction={direction}
        totalPages={totalPages}
        onJumpTo={onJumpTo}
      />
    </div>
  );
};
