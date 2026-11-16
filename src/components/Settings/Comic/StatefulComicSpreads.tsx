"use client";

import { useI18n } from "@/i18n/useI18n";
import { ComicReadingMode } from "@/lib/comicSettingsReducer";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";
import { StatefulSwitch } from "../StatefulSwitch";

/** Spread settings only apply to double-page mode, so they hide otherwise. */
const useDoublePageSettings = () => {
  const comicSettings = useComicSettings();
  return { ...comicSettings, visible: comicSettings.settings.readingMode === ComicReadingMode.doublePage };
};

export const StatefulComicSpreadCoverAlone = () => {
  const { t } = useI18n();
  const { settings, patch, visible } = useDoublePageSettings();
  if (!visible) return null;
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.spreads.coverAlone")}
      isSelected={settings.spreadCoverAlone}
      onChange={(value) => patch({ spreadCoverAlone: value })}
    />
  );
};

export const StatefulComicSpreadShift = () => {
  const { t } = useI18n();
  const { settings, patch, visible } = useDoublePageSettings();
  if (!visible) return null;
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.spreads.shift")}
      isSelected={settings.spreadShift}
      onChange={(value) => patch({ spreadShift: value })}
    />
  );
};

export const StatefulComicDoublePageInPortrait = () => {
  const { t } = useI18n();
  const { settings, patch, visible } = useDoublePageSettings();
  if (!visible) return null;
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.spreads.inPortrait")}
      isSelected={settings.doublePageInPortrait}
      onChange={(value) => patch({ doublePageInPortrait: value })}
    />
  );
};
