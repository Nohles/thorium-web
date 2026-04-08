"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ComicInvertTapZones, updateComicSettings } from "@/lib/comicSettingsReducer";
import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicInvertTapZones = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  const value = settings?.invertTapZones ?? ComicInvertTapZones.default;

  const items = useMemo(
    () => [
      { value: ComicInvertTapZones.default, label: t("reader.comic.invertTapZones.default") },
      { value: ComicInvertTapZones.none, label: t("reader.comic.invertTapZones.none") },
      { value: ComicInvertTapZones.horizontal, label: t("reader.comic.invertTapZones.horizontal") },
      { value: ComicInvertTapZones.vertical, label: t("reader.comic.invertTapZones.vertical") },
      { value: ComicInvertTapZones.both, label: t("reader.comic.invertTapZones.both") },
    ],
    [t]
  );

  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.invertTapZones.label")}
      value={value}
      onChange={(v) => {
        if (!activeKey) return;
        dispatch(
          updateComicSettings({
            key: activeKey,
            patch: { invertTapZones: v as ComicInvertTapZones },
          })
        );
      }}
      items={items}
      allowUnset={false}
    />
  );
};

