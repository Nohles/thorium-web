"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { ComicReadingMode } from "@/lib/comicSettingsReducer";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";
import { StatefulSlider } from "../StatefulSlider";

export const StatefulComicPageGap = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  const range = useMemo<[number, number]>(() => [0, 80], []);

  if (
    settings.readingMode === ComicReadingMode.default ||
    settings.readingMode === ComicReadingMode.singlePage
  ) {
    return null;
  }

  return (
    <StatefulSlider
      standalone={true}
      label={`${t("reader.comic.pageGap.label")} (px)`}
      value={settings.pageGapPx}
      defaultValue={0}
      range={range}
      step={1}
      onChange={(v) => patch({ pageGapPx: v as number })}
    />
  );
};
