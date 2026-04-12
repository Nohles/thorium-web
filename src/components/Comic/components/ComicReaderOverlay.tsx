"use client";

import { ThNavigationButton } from "@/core/Components/Buttons/ThNavigationButton";
import {
  ComicProgressBarPosition,
  ComicProgressBarType,
  ComicReadingDirection,
  ComicReadingMode,
  defaultComicSettings,
} from "@/lib/comicSettingsReducer";
import { useI18n } from "@/i18n/useI18n";
import { CSSProperties } from "react";

const isVerticalScrollMode = (mode: ComicReadingMode) =>
  mode === ComicReadingMode.continuousVertical || mode === ComicReadingMode.webtoon;

const resolveEffectiveProgressPosition = (
  settings: typeof defaultComicSettings,
  mode: ComicReadingMode
): ComicProgressBarPosition => {
  if (settings.progressBarPosition !== ComicProgressBarPosition.auto) {
    return settings.progressBarPosition;
  }
  if (isVerticalScrollMode(mode)) {
    return ComicProgressBarPosition.right;
  }
  return ComicProgressBarPosition.bottom;
};

export const ComicReaderOverlay = ({
  mode,
  pageCount,
  cursorIndex,
  scrollProgress,
  direction,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onJumpTo,
  onSeekScroll,
  settings,
  isVisible,
  integrateProgressInFooter,
}: {
  mode: ComicReadingMode;
  pageCount: number;
  cursorIndex: number;
  scrollProgress: number;
  direction: ComicReadingDirection;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJumpTo: (index: number) => void;
  onSeekScroll: (fraction: number) => void;
  settings: typeof defaultComicSettings;
  isVisible: boolean;
  /** When true, bottom standard progress is shown in {@link StatefulReaderFooter} instead. */
  integrateProgressInFooter?: boolean;
}) => {
  const { t } = useI18n();
  if (!isVisible) return null;

  const isRtl = direction === ComicReadingDirection.rtl;
  const leftAria = isRtl ? t("reader.actions.goToNextPage.descriptive") : t("reader.actions.goToPreviousPage.descriptive");
  const rightAria = isRtl ? t("reader.actions.goToPreviousPage.descriptive") : t("reader.actions.goToNextPage.descriptive");
  const leftOnPress = isRtl ? onNext : onPrev;
  const rightOnPress = isRtl ? onPrev : onNext;
  const leftDisabled = isRtl ? !canGoNext : !canGoPrev;
  const rightDisabled = isRtl ? !canGoPrev : !canGoNext;

  const effectivePosition = resolveEffectiveProgressPosition(settings, mode);

  const progressPosition: CSSProperties =
    effectivePosition === ComicProgressBarPosition.left
      ? { insetInlineStart: 0, top: 0, bottom: 0, width: settings.progressBarSizePx }
      : effectivePosition === ComicProgressBarPosition.right
        ? { insetInlineEnd: 0, top: 0, bottom: 0, width: settings.progressBarSizePx }
        : { left: 0, right: 0, bottom: 0, height: settings.progressBarSizePx };

  const showStandardProgressBar =
    settings.progressBarType === ComicProgressBarType.standard &&
    !(integrateProgressInFooter && settings.progressBarPosition === ComicProgressBarPosition.bottom);

  const verticalStrip = !!(progressPosition.width && !progressPosition.height);
  const useScrollProgress = isVerticalScrollMode(mode);

  return (
    <>
      <div style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", zIndex: 12 }}>
        <ThNavigationButton direction="left" aria-label={leftAria} isDisabled={leftDisabled} onPress={leftOnPress} />
      </div>
      <div style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", zIndex: 12 }}>
        <ThNavigationButton direction="right" aria-label={rightAria} isDisabled={rightDisabled} onPress={rightOnPress} />
      </div>

      {settings.showPageNumber && (
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 56,
            zIndex: 12,
            fontSize: 12,
            borderRadius: 999,
            background: "color-mix(in srgb, var(--th-theme-surface, #000) 86%, transparent)",
            color: "var(--th-theme-text, #fff)",
            padding: "4px 10px",
          }}
        >
          {Math.min(cursorIndex + 1, pageCount)} / {pageCount}
        </div>
      )}

      {showStandardProgressBar && (
        <div
          style={{
            position: "absolute",
            zIndex: 12,
            ...progressPosition,
            background: "color-mix(in srgb, var(--th-theme-text, #fff) 28%, transparent)",
          }}
        >
          {useScrollProgress ? (
            <input
              aria-label="Reader progress"
              type="range"
              min={0}
              max={1}
              step="any"
              value={scrollProgress}
              onChange={(event) => onSeekScroll(Number(event.target.value))}
              style={{
                width: verticalStrip ? "100%" : progressPosition.height ? "100%" : "100vw",
                height: verticalStrip ? "100%" : progressPosition.width ? "100%" : "100%",
                transform: verticalStrip ? "rotate(-90deg) translateX(-100%)" : undefined,
                transformOrigin: verticalStrip ? "top left" : undefined,
                background: "transparent",
              }}
            />
          ) : (
            <input
              aria-label="Reader progress"
              type="range"
              min={0}
              max={Math.max(0, pageCount - 1)}
              value={cursorIndex}
              onChange={(event) => onJumpTo(Number(event.target.value))}
              style={{
                width: verticalStrip ? "100%" : progressPosition.height ? "100%" : "100vh",
                height: verticalStrip ? "100%" : progressPosition.width ? "100%" : "100%",
                transform: verticalStrip ? "rotate(-90deg) translateX(-100%)" : undefined,
                transformOrigin: verticalStrip ? "top left" : undefined,
                background: "transparent",
              }}
            />
          )}
        </div>
      )}
    </>
  );
};
