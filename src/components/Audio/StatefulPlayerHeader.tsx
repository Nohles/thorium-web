"use client";

import audioLayoutStyles from "./assets/styles/thorium-web.audio.app.module.css";
import readerHeaderStyles from "../assets/styles/thorium-web.reader.header.module.css";
import overflowMenuStyles from "../Actions/assets/styles/thorium-web.overflow.module.css";

import { StatefulBackLink } from "../StatefulBackLink";
import { StatefulCollapsibleActionsBar } from "../Actions/StatefulCollapsibleActionsBar";

import { useReaderHeaderBase } from "../hooks/useReaderHeaderBase";
import { useAudioPreferences } from "@/preferences/hooks/useAudioPreferences";
import { useReaderNavigation } from "../Reader/ReaderNavigationContext";

import classNames from "classnames";

export const StatefulPlayerHeader = ({
  actionKeys,
  actionsOrder,
}: {
  actionKeys: string[];
  actionsOrder: string[];
}) => {
  const {
    headerRef, listActionItems, t,
  } = useReaderHeaderBase(actionKeys);

  const { preferences } = useAudioPreferences();
  const { headerActions } = useReaderNavigation();

  return (
    <>
      <div
        ref={ headerRef }
        className={ classNames(audioLayoutStyles.topBar, readerHeaderStyles.header) }
      >
        { preferences.theming.header?.backLink && <StatefulBackLink className={ readerHeaderStyles.backlinkWrapper } /> }

        <div className={ readerHeaderStyles.headerActionsArea }>
          { headerActions ? (
            <div className={ readerHeaderStyles.headerActions }>
              { headerActions }
            </div>
          ) : null }
          <StatefulCollapsibleActionsBar
            id="reader-header-overflowMenu"
            items={ listActionItems() }
            prefs={{ ...preferences.actions.secondary, displayOrder: actionsOrder }}
            className={ readerHeaderStyles.actionsWrapper }
            aria-label={ t("reader.app.header.actions") }
            overflowMenuClassName={ overflowMenuStyles.hint }
          />
        </div>
      </div>
    </>
  );
};
