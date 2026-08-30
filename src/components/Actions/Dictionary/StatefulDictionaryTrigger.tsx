"use client";

import { ThActionsKeys } from "@/preferences/models";

import DictionaryIcon from "./assets/icons/dictionary.svg";

import { StatefulActionTriggerProps } from "../models/actions";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";

import { StatefulActionIcon } from "../Triggers/StatefulActionIcon";
import { StatefulOverflowMenuItem } from "../Triggers/StatefulOverflowMenuItem";

import { useActionsPreferences } from "@/preferences/hooks/useActionsPreferences";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";

export const StatefulDictionaryTrigger = ({ variant }: StatefulActionTriggerProps) => {
  const preferences = useActionsPreferences();
  const { t } = useI18n();
  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThActionsKeys.dictionary] : undefined);
  const dispatch = useAppDispatch();

  const setOpen = (value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({
        key: ThActionsKeys.dictionary,
        isOpen: value,
        profile
      }));
    }
  };

  return(
    <>
    { (variant && variant === ThActionsTriggerVariant.menu)
      ? <StatefulOverflowMenuItem
          label={ t("reader.dictionary.title") }
          SVGIcon={ DictionaryIcon }
          shortcut={ preferences.actionsKeys[ThActionsKeys.dictionary].shortcut }
          id={ ThActionsKeys.dictionary }
          onAction={ () => setOpen(!actionState?.isOpen) }
        />
      : <StatefulActionIcon
          visibility={ preferences.actionsKeys[ThActionsKeys.dictionary].visibility }
          aria-label={ t("reader.dictionary.title") }
          placement="bottom"
          tooltipLabel={ t("reader.dictionary.title") }
          shortcut={ preferences.actionsKeys[ThActionsKeys.dictionary].shortcut }
          onPress={ () => setOpen(!actionState?.isOpen) }
        >
          <DictionaryIcon aria-hidden="true" focusable="false" />
        </StatefulActionIcon>
    }
    </>
  )
}
