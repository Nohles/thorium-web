"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ComicTapZones, updateComicSettings } from "@/lib/comicSettingsReducer";
import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicTapZones = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  const value = settings?.tapZones ?? ComicTapZones.default;

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
      value={value}
      onChange={(v) => {
        if (!activeKey) return;
        dispatch(updateComicSettings({ key: activeKey, patch: { tapZones: v as ComicTapZones } }));
      }}
      items={items}
    />
  );
};

