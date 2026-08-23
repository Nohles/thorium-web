"use client";

import { ThActionsKeys } from "@/preferences/models";
import SearchIcon from "./assets/icons/search.svg";
import { StatefulActionTriggerProps } from "../models/actions";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";
import { StatefulActionIcon } from "../Triggers/StatefulActionIcon";
import { StatefulOverflowMenuItem } from "../Triggers/StatefulOverflowMenuItem";
import { useActionsPreferences } from "@/preferences/hooks/useActionsPreferences";
import { useI18n } from "@/i18n/useI18n";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { useNavigator } from "@/core/Navigator";

export const StatefulSearchTrigger = ({ variant }: StatefulActionTriggerProps) => {
  const preferences = useActionsPreferences();
  const { t } = useI18n();
  const { publication } = useNavigator();
  const profile = useAppSelector((state) => state.reader.profile);
  const actionState = useAppSelector((state) =>
    profile ? state.actions.keys[profile][ThActionsKeys.search] : undefined,
  );
  const dispatch = useAppDispatch();

  if (!publication?.linkWithRel("search")) return null;

  const setOpen = (value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({
        key: ThActionsKeys.search,
        isOpen: value,
        profile,
      }));
    }
  };
  const label = t("reader.search.title");

  return variant === ThActionsTriggerVariant.menu ? (
    <StatefulOverflowMenuItem
      label={ label }
      SVGIcon={ SearchIcon }
      shortcut={ preferences.actionsKeys[ThActionsKeys.search].shortcut }
      id={ ThActionsKeys.search }
      onAction={ () => setOpen(!actionState?.isOpen) }
    />
  ) : (
    <StatefulActionIcon
      visibility={ preferences.actionsKeys[ThActionsKeys.search].visibility }
      aria-label={ label }
      placement="bottom"
      tooltipLabel={ label }
      shortcut={ preferences.actionsKeys[ThActionsKeys.search].shortcut }
      onPress={ () => setOpen(!actionState?.isOpen) }
    >
      <SearchIcon aria-hidden="true" focusable="false" />
    </StatefulActionIcon>
  );
};
