"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  ComicReadingMode,
  updateComicSettings,
} from "@/lib/comicSettingsReducer";

import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicReadingMode = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  const value = settings?.readingMode ?? ComicReadingMode.default;

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
      value={value}
      onChange={(v) => {
        if (!activeKey) return;
        dispatch(
          updateComicSettings({
            key: activeKey,
            patch: { readingMode: v as ComicReadingMode },
          })
        );
      }}
      items={options}
    />
  );
};

