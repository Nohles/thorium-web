"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ComicScaleType, updateComicSettings } from "@/lib/comicSettingsReducer";
import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicScaleType = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  const value = settings?.scaleType ?? ComicScaleType.originalSize;

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
      value={value}
      onChange={(v) => {
        if (!activeKey) return;
        dispatch(updateComicSettings({ key: activeKey, patch: { scaleType: v as ComicScaleType } }));
      }}
      items={items}
    />
  );
};

