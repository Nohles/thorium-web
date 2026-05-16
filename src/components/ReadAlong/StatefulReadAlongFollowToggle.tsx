"use client";

import { useCallback } from "react";
import { Button } from "react-aria-components";

import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setFollowAudio } from "@/lib/readAlongReducer";
import { setUserNavigated } from "@/lib/readerReducer";

import readAlongStyles from "./assets/styles/thorium-web.readAlong.module.css";

export const StatefulReadAlongFollowToggle = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const followAudio = useAppSelector((state) => state.readAlong.followAudio);

  const toggle = useCallback(() => {
    const next = !followAudio;
    dispatch(setFollowAudio(next));
    if (next) {
      dispatch(setUserNavigated(false));
    }
  }, [dispatch, followAudio]);

  return (
    <Button
      className={ readAlongStyles.followToggle }
      onPress={ toggle }
      aria-pressed={ followAudio }
    >
      { followAudio
        ? t("reader.readAlong.followAudioOn")
        : t("reader.readAlong.followAudioOff") }
    </Button>
  );
};
