"use client";

import { useMemo } from "react";

import { StatefulRadioGroup } from "../../Settings/StatefulRadioGroup";

import { useI18n } from "@/i18n/useI18n";

import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import { setProgressScope } from "@/lib/audioSettingsReducer";
import { defaultAudioProgressScope, isAudioProgressScope } from "../controls/progressScope";

export interface StatefulAudioProgressScopeProps {
  standalone?: boolean;
}

/** Whether the progress bar spans the whole book or the chapter playing now. */
export const StatefulAudioProgressScope = ({
  standalone = true
}: StatefulAudioProgressScopeProps) => {
  const { t } = useI18n();
  const progressScope = useAppSelector(state => state.audioSettings.progressScope) ?? defaultAudioProgressScope;
  const dispatch = useAppDispatch();

  const items = useMemo(() => [
    { id: "book", label: t("reader.playback.preferences.audio.progressScope.book"), value: "book" },
    { id: "chapter", label: t("reader.playback.preferences.audio.progressScope.chapter"), value: "chapter" }
  ], [t]);

  return (
    <StatefulRadioGroup
      standalone={ standalone }
      label={ t("reader.playback.preferences.audio.progressScope.title") }
      orientation="horizontal"
      value={ progressScope }
      onChange={ (value: string) => {
        if (isAudioProgressScope(value)) dispatch(setProgressScope(value));
      } }
      items={ items }
    />
  );
};
