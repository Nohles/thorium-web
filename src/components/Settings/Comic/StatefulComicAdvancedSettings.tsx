"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import {
  ComicOverlayMode,
  ComicProgressBarPosition,
  ComicProgressBarType,
  defaultComicSettings,
} from "@/lib/comicSettingsReducer";
import { useComicSettings } from "@/components/Comic/hooks/useComicSettings";
import {
  isReaderWidthEditable,
  stretchAllowedForScale,
} from "@/components/Comic/lib/comicReaderLayout";
import { StatefulNumberField } from "../StatefulNumberField";
import { StatefulRadioGroup } from "../StatefulRadioGroup";
import { StatefulSlider } from "../StatefulSlider";
import { StatefulSwitch } from "../StatefulSwitch";

export const StatefulComicOverlayMode = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  const options = useMemo(
    () => [
      { value: ComicOverlayMode.auto, label: t("reader.comic.overlayMode.auto") },
      { value: ComicOverlayMode.pinned, label: t("reader.comic.overlayMode.pinned") },
    ],
    [t]
  );

  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.overlayMode.label")}
      value={settings.overlayMode}
      onChange={(value) => patch({ overlayMode: value as ComicOverlayMode })}
      items={options}
    />
  );
};

/** @deprecated The comic reader does not implement this setting yet; it has no effect. */
export const StatefulComicShowPageNumber = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.showPageNumber.label")}
      isSelected={settings.showPageNumber}
      onChange={(value) => patch({ showPageNumber: value })}
    />
  );
};

/** @deprecated The comic reader does not implement this setting yet; it has no effect. */
export const StatefulComicStaticNavigation = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.staticNavigation.label")}
      isSelected={settings.staticNavigation}
      onChange={(value) => patch({ staticNavigation: value })}
    />
  );
};

export const StatefulComicProgressBarType = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();

  const options = useMemo(
    () => [
      { value: ComicProgressBarType.hidden, label: t("reader.comic.progressBar.hidden") },
      { value: ComicProgressBarType.standard, label: t("reader.comic.progressBar.standard") },
    ],
    [t]
  );

  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.progressBar.type")}
      value={settings.progressBarType}
      onChange={(value) => patch({ progressBarType: value as ComicProgressBarType })}
      items={options}
    />
  );
};

export const StatefulComicProgressBarPosition = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  const options = useMemo(
    () => [
      { value: ComicProgressBarPosition.auto, label: t("reader.comic.progressBar.position.auto") },
      { value: ComicProgressBarPosition.bottom, label: t("reader.comic.progressBar.position.bottom") },
      { value: ComicProgressBarPosition.left, label: t("reader.comic.progressBar.position.left") },
      { value: ComicProgressBarPosition.right, label: t("reader.comic.progressBar.position.right") },
    ],
    [t]
  );
  return (
    <StatefulRadioGroup
      standalone={true}
      label={t("reader.comic.progressBar.position.label")}
      value={settings.progressBarPosition}
      onChange={(value) => patch({ progressBarPosition: value as ComicProgressBarPosition })}
      items={options}
    />
  );
};

export const StatefulComicStretchSmallPages = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  const scaleType = settings.scaleType;
  if (!stretchAllowedForScale(scaleType)) {
    return null;
  }
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.stretchSmallPages.label")}
      isSelected={settings.stretchSmallPages}
      onChange={(value) => patch({ stretchSmallPages: value })}
    />
  );
};

export const StatefulComicWidthLimitEnabled = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  const scaleType = settings.scaleType;
  if (!isReaderWidthEditable(scaleType)) {
    return null;
  }
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.widthLimit.enabled")}
      isSelected={settings.widthLimitEnabled}
      onChange={(value) => patch({ widthLimitEnabled: value })}
    />
  );
};

const WIDTH_LIMIT_SLIDER_RANGE: [number, number] = [10, 100];

export const StatefulComicWidthLimit = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  const scaleType = settings.scaleType;
  if (!isReaderWidthEditable(scaleType)) {
    return null;
  }
  const enabled = settings.widthLimitEnabled;
  return (
    <StatefulSlider
      standalone={true}
      label={t("reader.comic.widthLimit.label")}
      value={settings.widthLimitPercent}
      defaultValue={defaultComicSettings.widthLimitPercent}
      range={WIDTH_LIMIT_SLIDER_RANGE}
      step={1}
      isDisabled={!enabled}
      onChange={(v) => patch({ widthLimitPercent: v as number })}
    />
  );
};

export const StatefulComicScrollAmountPercent = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulNumberField
      standalone={true}
      label={t("reader.comic.scrollAmount.label")}
      range={[10, 100]}
      step={5}
      value={settings.scrollAmountPercent}
      onChange={(value) => patch({ scrollAmountPercent: value })}
    />
  );
};

/** @deprecated The comic reader does not implement this setting yet; it has no effect. */
export const StatefulComicAutoScrollEnabled = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.autoScroll.enabled")}
      isSelected={settings.autoScrollEnabled}
      onChange={(value) => patch({ autoScrollEnabled: value })}
    />
  );
};

/** @deprecated The comic reader does not implement this setting yet; it has no effect. */
export const StatefulComicAutoScrollSpeedSeconds = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulNumberField
      standalone={true}
      label={t("reader.comic.autoScroll.speed")}
      range={[1, 20]}
      step={1}
      value={settings.autoScrollSpeedSeconds}
      onChange={(value) => patch({ autoScrollSpeedSeconds: value })}
    />
  );
};

/** @deprecated The comic reader does not implement this setting yet; it has no effect. */
export const StatefulComicAutoScrollSmooth = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.autoScroll.smooth")}
      isSelected={settings.autoScrollSmooth}
      onChange={(value) => patch({ autoScrollSmooth: value })}
    />
  );
};

/** @deprecated The comic reader does not implement this setting yet; it has no effect. */
export const StatefulComicReadingModePreview = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.readingModePreview.label")}
      isSelected={settings.readingModePreview}
      onChange={(value) => patch({ readingModePreview: value })}
    />
  );
};

export const StatefulComicTapZonePreview = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.tapZonePreview.label")}
      isSelected={settings.tapZonePreview}
      onChange={(value) => patch({ tapZonePreview: value })}
    />
  );
};

export const StatefulComicImagePreloadAmount = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSettings();
  return (
    <StatefulNumberField
      standalone={true}
      label={t("reader.comic.imagePreloadAmount.label")}
      range={[0, 10]}
      step={1}
      value={settings.imagePreloadAmount}
      onChange={(value) => patch({ imagePreloadAmount: value })}
    />
  );
};
