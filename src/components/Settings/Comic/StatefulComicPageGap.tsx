"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { updateComicSettings } from "@/lib/comicSettingsReducer";
import { StatefulSlider } from "../StatefulSlider";

export const StatefulComicPageGap = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  const value = settings?.pageGapPx ?? 5;

  const range = useMemo<[number, number]>(() => [0, 80], []);

  return (
    <StatefulSlider
      standalone={true}
      label={`${t("reader.comic.pageGap.label")} (px)`}
      value={value}
      defaultValue={5}
      range={range}
      step={1}
      onChange={(v) => {
        if (!activeKey) return;
        dispatch(updateComicSettings({ key: activeKey, patch: { pageGapPx: v as number } }));
      }}
    />
  );
};

