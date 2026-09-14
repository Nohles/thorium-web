"use client";

import { RefObject } from "react";

import { ThDockingKeys, ThSheetHeaderVariant } from "@/preferences/models";
import { ActionsStateKeys } from "@/lib/actionsReducer";

import sheetStyles from "./assets/styles/thorium-web.sheets.module.css";
import readerSharedUI from "../assets/styles/thorium-web.button.module.css";

import { ThNavigationButton } from "@/core/Components/Buttons/ThNavigationButton";
import { ThCloseButton } from "@/core/Components/Buttons/ThCloseButton";
import { StatefulDocker } from "../Docking/StatefulDocker";
import { useI18n } from "@/i18n";
import { useAppSelector } from "@/lib/hooks";
import classNames from "classnames";

export const StatefulSheetHeaderControls = ({
  id,
  headerVariant,
  docker,
  className,
  closeRef,
  onClosePress,
  onBackPress,
  trailing = "docker",
}: {
  id: ActionsStateKeys;
  headerVariant?: ThSheetHeaderVariant;
  docker?: ThDockingKeys[];
  className?: string;
  closeRef: RefObject<HTMLButtonElement | null>;
  onClosePress: () => void;
  onBackPress?: () => void;
  trailing?: "docker" | "close";
}) => {
  const { t } = useI18n();
  const direction = useAppSelector((state) => state.reader.direction);
  const showBack = headerVariant === ThSheetHeaderVariant.previous;
  const showClose = !showBack || Boolean(onBackPress);

  const backButton = showBack ? (
    <ThNavigationButton
      direction={direction === "ltr" ? "left" : "right"}
      label={t("reader.app.back.trigger")}
      ref={onBackPress ? undefined : closeRef}
      className={classNames(className, readerSharedUI.backButton)}
      aria-label={t("reader.app.back.trigger")}
      onPress={onBackPress ?? onClosePress}
    />
  ) : null;

  const closeControl =
    trailing === "close" ? (
      <ThCloseButton
        ref={closeRef}
        className={readerSharedUI.closeButton}
        aria-label={t("common.actions.close")}
        onPress={onClosePress}
      />
    ) : (
      <StatefulDocker
        id={id}
        keys={docker || []}
        ref={closeRef}
        onClose={onClosePress}
      />
    );

  if (showBack && showClose) {
    return (
      <div className={sheetStyles.headerActions}>
        {backButton}
        {closeControl}
      </div>
    );
  }

  return showBack ? backButton : showClose ? closeControl : null;
};
