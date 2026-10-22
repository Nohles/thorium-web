"use client";

import { useI18n } from "@/i18n/useI18n";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";
import { StatefulSwitch } from "../StatefulSwitch";

export const StatefulComicChapterBoundaries = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.chapterBoundaries.label")}
      isSelected={settings.comicChapterBoundaries}
      onChange={(value) => patch({ comicChapterBoundaries: value })}
    />
  );
};
