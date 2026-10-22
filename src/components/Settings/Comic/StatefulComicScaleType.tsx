"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { ComicScaleType } from "@/lib/comicSettingsReducer";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";
import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicScaleType = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  const items = useMemo(
    () => [
      { value: ComicScaleType.fitWidth, label: t("reader.comic.scaleType.fitWidth") },
      { value: ComicScaleType.fitHeight, label: t("reader.comic.scaleType.fitHeight") },
      { value: ComicScaleType.fitScreen, label: t("reader.comic.scaleType.fitScreen") },
      { value: ComicScaleType.originalSize, label: t("reader.comic.scaleType.originalSize") },
    ],
    [t]
  );

  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.scaleType.label")}
      value={settings.scaleType}
      onChange={(v) => patch({ scaleType: v as ComicScaleType })}
      items={items}
    />
  );
};
