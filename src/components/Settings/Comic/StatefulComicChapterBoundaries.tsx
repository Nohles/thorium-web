"use client";

import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { updateComicSettings } from "@/lib/comicSettingsReducer";
import { StatefulSwitch } from "../StatefulSwitch";

export const StatefulComicChapterBoundaries = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.chapterBoundaries.label")}
      isSelected={settings?.comicChapterBoundaries ?? false}
      onChange={(value) => {
        if (!activeKey) return;
        dispatch(updateComicSettings({ key: activeKey, patch: { comicChapterBoundaries: value } }));
      }}
    />
  );
};
