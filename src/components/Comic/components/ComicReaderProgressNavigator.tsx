"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useLocale } from "react-aria";

import styles from "../assets/styles/thorium-web.comic.module.css";

import { ComicProgressBarPosition, ComicReadingDirection } from "@/lib/comicSettingsReducer";
import { useI18n } from "@/i18n/useI18n";
import { ComicProgressItem } from "../lib/comicProgress";

type ComicReaderProgressNavigatorProps = {
  items: ComicProgressItem[];
  position: ComicProgressBarPosition;
  direction: ComicReadingDirection;
  totalPages: number;
  onJumpTo: (index: number) => void;
};

/**
 * Page slider: one focusable thumb with arrow-key, drag and track-click navigation,
 * over a segmented track that shows read, loaded and current pages.
 *
 * react-aria puts a vertical slider's minimum at the bottom and lays horizontal sliders
 * out in the UI direction, while comics read top-down and in their own direction. The
 * value is mirrored where those disagree, and `aria-valuetext` states the real page.
 */
export const ComicReaderProgressNavigator = ({
  items,
  position,
  direction,
  totalPages,
  onJumpTo,
}: ComicReaderProgressNavigatorProps) => {
  const { t } = useI18n();
  const { direction: uiDirection } = useLocale();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const count = items.length;
  const isVertical = position !== ComicProgressBarPosition.bottom;
  const comicDir = direction === ComicReadingDirection.rtl ? "rtl" : "ltr";
  const isMirrored = isVertical || comicDir !== uiDirection;
  const toValue = (index: number) => (isMirrored ? count - 1 - index : index);
  const toIndex = (value: number) => Math.min(count - 1, Math.max(0, isMirrored ? count - 1 - value : value));

  const currentIndex = Math.max(0, items.findIndex((item) => item.isCurrent));
  const displayIndex = previewIndex ?? currentIndex;
  const displayItem = items[displayIndex];

  const valueText = displayItem
    ? t(
        displayItem.type === "spread"
          ? "reader.comic.progressNavigator.spreadValue"
          : "reader.comic.progressNavigator.pageValue",
        { label: displayItem.label, total: totalPages }
      )
    : "";

  // react-aria derives aria-valuetext from the (possibly mirrored) number; state the page instead.
  useLayoutEffect(() => {
    inputRef.current?.setAttribute("aria-valuetext", valueText);
  });

  if (count === 0) return null;

  return (
    <Slider
      className={styles.slider}
      dir={comicDir}
      orientation={isVertical ? "vertical" : "horizontal"}
      minValue={0}
      maxValue={Math.max(0, count - 1)}
      step={1}
      value={toValue(displayIndex)}
      isDisabled={count < 2}
      aria-label={t("reader.comic.progressNavigator.label")}
      onChange={(value) => setPreviewIndex(toIndex(value as number))}
      onChangeEnd={(value) => {
        setPreviewIndex(null);
        const item = items[toIndex(value as number)];
        if (item && !item.isCurrent) onJumpTo(item.targetIndex);
      }}
    >
      <span className={styles.sliderLabel} aria-hidden="true">{displayItem?.label}</span>
      <SliderTrack className={styles.sliderTrack}>
        {items.map((item, index) => (
          <div
            key={item.id}
            className={styles.sliderSegment}
            data-current={index === displayIndex}
            data-completed={previewIndex === null ? item.isCompleted : index <= displayIndex}
            data-loaded={item.isLoaded}
          />
        ))}
        <SliderThumb className={styles.sliderThumb} inputRef={inputRef} />
      </SliderTrack>
      <span className={styles.sliderLabel} aria-hidden="true">{totalPages}</span>
    </Slider>
  );
};
