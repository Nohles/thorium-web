"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  ComicReadingDirection,
  updateComicSettings,
} from "@/lib/comicSettingsReducer";

import { StatefulRadioGroup } from "../StatefulRadioGroup";

export const StatefulComicReadingDirection = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  const value = settings?.direction ?? ComicReadingDirection.ltr;

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
      value={value}
      onChange={(v) => {
        if (!activeKey) return;
        dispatch(
          updateComicSettings({
            key: activeKey,
            patch: { direction: v as ComicReadingDirection },
          })
        );
      }}
      items={items}
    />
  );
};

