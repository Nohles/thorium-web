"use client";

import readerStyles from "@/components/assets/styles/thorium-web.reader.app.module.css";
import { ComicProgressBarPosition } from "@/lib/comicSettingsReducer";
import { useI18n } from "@/i18n/useI18n";
import { CSSProperties } from "react";
import { ComicProgressItem } from "../lib/comicProgress";

type ComicReaderProgressNavigatorProps = {
  items: ComicProgressItem[];
  position: ComicProgressBarPosition;
  currentPage: number;
  totalPages: number;
  onJumpTo: (index: number) => void;
};

export const ComicReaderProgressNavigator = ({
  items,
  position,
  currentPage,
  totalPages,
  onJumpTo,
}: ComicReaderProgressNavigatorProps) => {
  const { t } = useI18n();
  if (items.length === 0) return null;

  const isHorizontal = position === ComicProgressBarPosition.bottom;

  const compactStyle: CSSProperties = isHorizontal
    ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
    : { gridTemplateRows: `repeat(${items.length}, minmax(0, 1fr))` };

  const expandedStyle: CSSProperties = isHorizontal
    ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
    : { gridTemplateRows: `repeat(${items.length}, minmax(0, 1fr))` };

  return (
    <div
      className={readerStyles.comicProgressRoot}
      data-position={position}
      tabIndex={0}
      aria-label={t("reader.comic.progressNavigator.label")}
    >
      <div className={readerStyles.comicProgressCompactRail} style={compactStyle} aria-hidden="true">
        {items.map((item) => (
          <div
            key={`compact-${item.id}`}
            className={readerStyles.comicProgressIndicator}
            data-current={item.isCurrent}
            data-completed={item.isCompleted}
            data-loaded={item.isLoaded}
          />
        ))}
      </div>

      <div className={readerStyles.comicProgressExpandedRail}>
        <span className={readerStyles.comicProgressPageLabel}>{currentPage}</span>
        <div className={readerStyles.comicProgressExpandedTrack} style={expandedStyle}>
          {items.map((item) => (
            <button
              key={`expanded-${item.id}`}
              type="button"
              className={readerStyles.comicProgressButton}
              data-current={item.isCurrent}
              data-completed={item.isCompleted}
              data-loaded={item.isLoaded}
              onClick={() => onJumpTo(item.targetIndex)}
              aria-current={item.isCurrent ? "page" : undefined}
              aria-label={
                item.type === "spread"
                  ? t("reader.comic.progressNavigator.goToSpread", { label: item.label })
                  : t("reader.comic.progressNavigator.goToPage", { label: item.label })
              }
            />
          ))}
        </div>
        <span className={readerStyles.comicProgressPageLabel}>{totalPages}</span>
      </div>
    </div>
  );
};
