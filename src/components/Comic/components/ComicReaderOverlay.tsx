"use client";

import { ThNavigationButton } from "@/core/Components/Buttons/ThNavigationButton";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";
import { StatefulBackLink } from "@/components/StatefulBackLink";
import { StatefulFullscreenTrigger } from "@/components/Actions/Fullscreen/StatefulFullscreenTrigger";
import { StatefulSettingsTrigger } from "@/components/Actions/Settings/StatefulSettingsTrigger";
import {
  ComicProgressBarPosition,
  ComicProgressBarType,
  defaultComicSettings,
} from "@/lib/comicSettingsReducer";
import { CSSProperties } from "react";

export const ComicReaderOverlay = ({
  pageCount,
  cursorIndex,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onJumpTo,
  settings,
  isVisible,
  settingsTriggerRef,
}: {
  pageCount: number;
  cursorIndex: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJumpTo: (index: number) => void;
  settings: typeof defaultComicSettings;
  isVisible: boolean;
  settingsTriggerRef: React.RefObject<HTMLElement | null>;
}) => {
  if (!isVisible) return null;

  const progressPosition: CSSProperties =
    settings.progressBarPosition === ComicProgressBarPosition.left
      ? { insetInlineStart: 0, top: 0, bottom: 0, width: settings.progressBarSizePx }
      : settings.progressBarPosition === ComicProgressBarPosition.right
      ? { insetInlineEnd: 0, top: 0, bottom: 0, width: settings.progressBarSizePx }
      : { left: 0, right: 0, bottom: 0, height: settings.progressBarSizePx };

  return (
    <>
      <header
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: 10,
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <StatefulBackLink />
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <StatefulFullscreenTrigger variant={ThActionsTriggerVariant.button} />
          <span ref={settingsTriggerRef as never}>
            <StatefulSettingsTrigger variant={ThActionsTriggerVariant.button} />
          </span>
        </div>
      </header>

      <div style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", zIndex: 12 }}>
        <ThNavigationButton direction="left" aria-label="Previous page" isDisabled={!canGoPrev} onPress={onPrev} />
      </div>
      <div style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", zIndex: 12 }}>
        <ThNavigationButton direction="right" aria-label="Next page" isDisabled={!canGoNext} onPress={onNext} />
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

      {settings.progressBarType === ComicProgressBarType.standard && (
        <div
          style={{
            position: "absolute",
            zIndex: 12,
            ...progressPosition,
            background: "color-mix(in srgb, var(--th-theme-text, #fff) 28%, transparent)",
          }}
        >
          <input
            aria-label="Reader progress"
            type="range"
            min={0}
            max={Math.max(0, pageCount - 1)}
            value={cursorIndex}
            onChange={(event) => onJumpTo(Number(event.target.value))}
            style={{
              width: progressPosition.height ? "100%" : "100vh",
              height: progressPosition.width ? "100%" : "100%",
              transform: progressPosition.width ? "rotate(-90deg) translateX(-100%)" : undefined,
              transformOrigin: progressPosition.width ? "top left" : undefined,
              background: "transparent",
            }}
          />
        </div>
      )}
    </>
  );
};
