"use client";

import { ComponentType } from "react";

import { StatefulActionTriggerProps } from "../models/actions";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";
import { ThCollapsibilityVisibility } from "@/core/Components/Actions/hooks/useCollapsibility";

import readerSharedUI from "../../assets/styles/thorium-web.button.module.css";

import { StatefulOverflowMenuItem } from "../Triggers/StatefulOverflowMenuItem";
import { StatefulActionIcon } from "../Triggers/StatefulActionIcon";

import { useReaderNavigation } from "../../Reader/ReaderNavigationContext";

/**
 * Renders one host-supplied `headerActionItems` entry, looked up by id so the
 * component identity stays stable while the item's label/state/handler change.
 */
const HeaderActionItemTrigger = ({ id, variant }: StatefulActionTriggerProps & { id: string }) => {
  const { headerActionItems } = useReaderNavigation();
  const item = headerActionItems?.find((entry) => entry.id === id);
  if (!item) return null;

  const { Icon, label, onPress, isActive, tooltipLabel } = item;

  if (variant === ThActionsTriggerVariant.menu) {
    return (
      <StatefulOverflowMenuItem
        id={ id }
        label={ label }
        SVGIcon={ Icon }
        onAction={ onPress }
      />
    );
  }

  return (
    <StatefulActionIcon
      className={ readerSharedUI.iconCompSm }
      visibility={ item.visibility ?? ThCollapsibilityVisibility.always }
      aria-label={ label }
      aria-pressed={ isActive === undefined ? undefined : isActive }
      placement="bottom"
      tooltipLabel={ tooltipLabel ?? label }
      onPress={ onPress }
    >
      <Icon aria-hidden="true" focusable="false" />
    </StatefulActionIcon>
  );
};

const triggerCache = new Map<string, ComponentType<StatefulActionTriggerProps>>();

export const getHeaderActionItemTrigger = (id: string): ComponentType<StatefulActionTriggerProps> => {
  let Trigger = triggerCache.get(id);
  if (!Trigger) {
    const Bound = (props: StatefulActionTriggerProps) => <HeaderActionItemTrigger { ...props } id={ id } />;
    Bound.displayName = `HeaderActionItemTrigger(${ id })`;
    triggerCache.set(id, Bound);
    Trigger = Bound;
  }
  return Trigger;
};
