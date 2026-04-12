"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  ComicOverlayMode,
  ComicProgressBarPosition,
  ComicProgressBarType,
  defaultComicSettings,
  updateComicSettings,
} from "@/lib/comicSettingsReducer";
import {
  isReaderWidthEditable,
  stretchAllowedForScale,
} from "@/components/Comic/lib/comicReaderLayout";
import { StatefulNumberField } from "../StatefulNumberField";
import { StatefulRadioGroup } from "../StatefulRadioGroup";
import { StatefulSlider } from "../StatefulSlider";
import { StatefulSwitch } from "../StatefulSwitch";

const useComicSetting = () => {
  const dispatch = useAppDispatch();
  const activeKey = useAppSelector((s) => s.comicSettings.activeKey);
  const settings = useAppSelector((s) =>
    activeKey ? s.comicSettings.byKey[activeKey] : undefined
  );

  const patch = (values: Record<string, boolean | number | string>) => {
    if (!activeKey) return;
    dispatch(updateComicSettings({ key: activeKey, patch: values }));
  };

  return { settings, patch };
};

export const StatefulComicOverlayMode = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();

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
      value={settings?.overlayMode ?? ComicOverlayMode.auto}
      onChange={(value) => patch({ overlayMode: value })}
      items={options}
      allowUnset={false}
    />
  );
};

export const StatefulComicShowPageNumber = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.showPageNumber.label")}
      value={settings?.showPageNumber ?? true}
      onChange={(value) => patch({ showPageNumber: value })}
    />
  );
};

export const StatefulComicStaticNavigation = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.staticNavigation.label")}
      value={settings?.staticNavigation ?? false}
      onChange={(value) => patch({ staticNavigation: value })}
    />
  );
};

export const StatefulComicProgressBarType = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();

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
      value={settings?.progressBarType ?? ComicProgressBarType.standard}
      onChange={(value) => patch({ progressBarType: value })}
      items={options}
      allowUnset={false}
    />
  );
};

export const StatefulComicProgressBarSize = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulNumberField
      standalone={true}
      label={t("reader.comic.progressBar.size")}
      range={[2, 16]}
      step={1}
      value={settings?.progressBarSizePx ?? 4}
      onChange={(value) => patch({ progressBarSizePx: value })}
    />
  );
};

export const StatefulComicProgressBarPosition = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
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
      value={settings?.progressBarPosition ?? ComicProgressBarPosition.auto}
      onChange={(value) => patch({ progressBarPosition: value })}
      items={options}
      allowUnset={false}
    />
  );
};

export const StatefulComicStretchSmallPages = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  const scaleType = settings?.scaleType ?? defaultComicSettings.scaleType;
  if (!stretchAllowedForScale(scaleType)) {
    return null;
  }
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.stretchSmallPages.label")}
      value={settings?.stretchSmallPages ?? false}
      onChange={(value) => patch({ stretchSmallPages: value })}
    />
  );
};

export const StatefulComicWidthLimitEnabled = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  const scaleType = settings?.scaleType ?? defaultComicSettings.scaleType;
  if (!isReaderWidthEditable(scaleType)) {
    return null;
  }
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.widthLimit.enabled")}
      value={settings?.widthLimitEnabled ?? false}
      onChange={(value) => patch({ widthLimitEnabled: value })}
    />
  );
};

const WIDTH_LIMIT_SLIDER_RANGE: [number, number] = [10, 100];

export const StatefulComicWidthLimit = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  const scaleType = settings?.scaleType ?? defaultComicSettings.scaleType;
  if (!isReaderWidthEditable(scaleType)) {
    return null;
  }
  const enabled = settings?.widthLimitEnabled ?? false;
  return (
    <StatefulSlider
      standalone={true}
      label={t("reader.comic.widthLimit.label")}
      value={settings?.widthLimitPercent ?? defaultComicSettings.widthLimitPercent}
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
  const { settings, patch } = useComicSetting();
  return (
    <StatefulNumberField
      standalone={true}
      label={t("reader.comic.scrollAmount.label")}
      range={[10, 100]}
      step={5}
      value={settings?.scrollAmountPercent ?? 95}
      onChange={(value) => patch({ scrollAmountPercent: value })}
    />
  );
};

export const StatefulComicAutoScrollEnabled = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.autoScroll.enabled")}
      value={settings?.autoScrollEnabled ?? false}
      onChange={(value) => patch({ autoScrollEnabled: value })}
    />
  );
};

export const StatefulComicAutoScrollSpeedSeconds = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulNumberField
      standalone={true}
      label={t("reader.comic.autoScroll.speed")}
      range={[1, 20]}
      step={1}
      value={settings?.autoScrollSpeedSeconds ?? 5}
      onChange={(value) => patch({ autoScrollSpeedSeconds: value })}
    />
  );
};

export const StatefulComicAutoScrollSmooth = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.autoScroll.smooth")}
      value={settings?.autoScrollSmooth ?? true}
      onChange={(value) => patch({ autoScrollSmooth: value })}
    />
  );
};

export const StatefulComicReadingModePreview = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.readingModePreview.label")}
      value={settings?.readingModePreview ?? true}
      onChange={(value) => patch({ readingModePreview: value })}
    />
  );
};

export const StatefulComicTapZonePreview = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulSwitch
      standalone={true}
      label={t("reader.comic.tapZonePreview.label")}
      value={settings?.tapZonePreview ?? true}
      onChange={(value) => patch({ tapZonePreview: value })}
    />
  );
};

export const StatefulComicImagePreloadAmount = () => {
  const { t } = useI18n();
  const { settings, patch } = useComicSetting();
  return (
    <StatefulNumberField
      standalone={true}
      label={t("reader.comic.imagePreloadAmount.label")}
      range={[0, 10]}
      step={1}
      value={settings?.imagePreloadAmount ?? 5}
      onChange={(value) => patch({ imagePreloadAmount: value })}
    />
  );
};
