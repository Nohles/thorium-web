"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { ComicTapZones } from "@/lib/comicSettingsReducer";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";
import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicTapZones = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  const items = useMemo(
    () => [
      { value: ComicTapZones.default, label: t("reader.comic.tapZones.default") },
      { value: ComicTapZones.edge, label: t("reader.comic.tapZones.edge") },
      { value: ComicTapZones.kindle, label: t("reader.comic.tapZones.kindle") },
      { value: ComicTapZones.lShape, label: t("reader.comic.tapZones.lShape") },
      { value: ComicTapZones.rightAndLeft, label: t("reader.comic.tapZones.rightAndLeft") },
      { value: ComicTapZones.disabled, label: t("reader.comic.tapZones.disabled") },
    ],
    [t]
  );

  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.tapZones.label")}
      value={settings.tapZones}
      onChange={(v) => patch({ tapZones: v as ComicTapZones })}
      items={items}
    />
  );
};
