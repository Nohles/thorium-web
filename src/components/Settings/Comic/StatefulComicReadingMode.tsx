"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { ComicReadingMode } from "@/lib/comicSettingsReducer";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";

import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicReadingMode = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  const options = useMemo(
    () => [
      { value: ComicReadingMode.default, label: t("reader.comic.readingMode.default") },
      { value: ComicReadingMode.singlePage, label: t("reader.comic.readingMode.singlePage") },
      { value: ComicReadingMode.doublePage, label: t("reader.comic.readingMode.doublePage") },
      { value: ComicReadingMode.continuousVertical, label: t("reader.comic.readingMode.continuousVertical") },
      { value: ComicReadingMode.continuousHorizontal, label: t("reader.comic.readingMode.continuousHorizontal") },
      { value: ComicReadingMode.webtoon, label: t("reader.comic.readingMode.webtoon") },
    ],
    [t]
  );

  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.readingMode.label")}
      value={settings.readingMode}
      onChange={(v) => patch({ readingMode: v as ComicReadingMode })}
      items={options}
    />
  );
};
