"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { ComicReadingDirection } from "@/lib/comicSettingsReducer";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";

import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicReadingDirection = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  const items = useMemo(
    () => [
      { value: ComicReadingDirection.ltr, label: t("reader.comic.readingDirection.ltr") },
      { value: ComicReadingDirection.rtl, label: t("reader.comic.readingDirection.rtl") },
    ],
    [t]
  );

  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.readingDirection.label")}
      value={settings.direction}
      onChange={(v) => patch({ direction: v as ComicReadingDirection })}
      items={items}
    />
  );
};
