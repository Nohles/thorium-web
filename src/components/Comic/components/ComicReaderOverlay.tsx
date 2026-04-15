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
import { ThLayoutUI } from "@/preferences/models";
import { CSSProperties } from "react";
import { ComicReaderProgressNavigator } from "./ComicReaderProgressNavigator";
import { ComicProgressItem } from "../lib/comicProgress";

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
  progressItems,
  direction,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onJumpTo,
  settings,
  isVisible,
  layoutUI,
}: {
  mode: ComicReadingMode;
  pageCount: number;
  cursorIndex: number;
  progressItems: ComicProgressItem[];
  direction: ComicReadingDirection;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJumpTo: (index: number) => void;
  settings: typeof defaultComicSettings;
  isVisible: boolean;
  layoutUI: ThLayoutUI;
}) => {
  const { t } = useI18n();
  const effectivePosition = resolveEffectiveProgressPosition(settings, mode);
  const layeredBarInset =
    layoutUI === ThLayoutUI.layered && isVisible ? "calc(var(--th-icon-size, 24px) * 2.5)" : 0;
  const progressRailSize = 40;
  const progressPosition: CSSProperties =
    effectivePosition === ComicProgressBarPosition.left
      ? { insetInlineStart: 0, top: layeredBarInset, bottom: layeredBarInset, width: progressRailSize }
      : effectivePosition === ComicProgressBarPosition.right
        ? { insetInlineEnd: 0, top: layeredBarInset, bottom: layeredBarInset, width: progressRailSize }
        : { left: 0, right: 0, bottom: layeredBarInset, height: progressRailSize };

  const showProgressBar = settings.progressBarType === ComicProgressBarType.standard;
  if (!isVisible && !showProgressBar) return null;

  const isRtl = direction === ComicReadingDirection.rtl;
  const leftAria = isRtl ? t("reader.actions.goToNextPage.descriptive") : t("reader.actions.goToPreviousPage.descriptive");
  const rightAria = isRtl ? t("reader.actions.goToPreviousPage.descriptive") : t("reader.actions.goToNextPage.descriptive");
  const leftOnPress = isRtl ? onNext : onPrev;
  const rightOnPress = isRtl ? onPrev : onNext;
  const leftDisabled = isRtl ? !canGoNext : !canGoPrev;
  const rightDisabled = isRtl ? !canGoPrev : !canGoNext;

  return (
    <>
      {isVisible ? (
        <>
          <div style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", zIndex: 12 }}>
            <ThNavigationButton direction="left" aria-label={leftAria} isDisabled={leftDisabled} onPress={leftOnPress} />
          </div>
          <div style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", zIndex: 12 }}>
            <ThNavigationButton direction="right" aria-label={rightAria} isDisabled={rightDisabled} onPress={rightOnPress} />
          </div>

        </>
      ) : null}

      {showProgressBar ? (
        <div
          style={{
            position: "absolute",
            zIndex: 13,
            ...progressPosition,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            transition: "top 200ms ease-in-out, bottom 200ms ease-in-out, inset-inline-start 200ms ease-in-out, inset-inline-end 200ms ease-in-out",
          }}
        >
          <ComicReaderProgressNavigator
            items={progressItems}
            position={effectivePosition}
            currentPage={Math.min(cursorIndex + 1, pageCount)}
            totalPages={pageCount}
            onJumpTo={onJumpTo}
          />
        </div>
      ) : null}
    </>
  );
};
