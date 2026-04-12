"use client";

import { useCallback, useMemo } from "react";

import { ThActionsKeys, ThSheetTypes } from "@/preferences/models";
import { StatefulActionContainerProps } from "../models/actions";

import tocStyles from "./assets/styles/thorium-web.toc.module.css";

import { StatefulSheetWrapper } from "../../Sheets/StatefulSheetWrapper";
import { useDocking } from "../../Docking/hooks/useDocking";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { setImmersive, setUserNavigated } from "@/lib/readerReducer";
import { useComicReader } from "@/components/Comic/ComicReaderContext";

export const StatefulComicTocContainer = ({ triggerRef }: StatefulActionContainerProps) => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const actionState = useAppSelector((state) => state.actions.keys[ThActionsKeys.toc]);
  const docking = useDocking(ThActionsKeys.toc);
  const sheetType = docking.sheetType;

  const { pageCount, currentIndex, goToIndex } = useComicReader();

  const items = useMemo(() => {
    return Array.from({ length: pageCount }, (_, i) => ({
      index: i,
      label: `${i + 1}`,
    }));
  }, [pageCount]);

  const setOpen = useCallback(
    (value: boolean) => {
      dispatch(
        setActionOpen({
          key: ThActionsKeys.toc,
          isOpen: value,
        })
      );
    },
    [dispatch]
  );

  const handleGo = useCallback(
    (index: number) => {
      const cb =
        actionState?.isOpen && (sheetType === ThSheetTypes.dockedStart || sheetType === ThSheetTypes.dockedEnd)
          ? () => {
              dispatch(setImmersive(true));
              dispatch(setUserNavigated(true));
            }
          : () => {
              dispatch(setImmersive(true));
              dispatch(setUserNavigated(true));
              setOpen(false);
            };

      goToIndex(index);
      cb();
    },
    [actionState?.isOpen, dispatch, goToIndex, setOpen, sheetType]
  );

  return (
    <StatefulSheetWrapper
      sheetType={sheetType}
      sheetProps={{
        id: ThActionsKeys.toc,
        triggerRef,
        heading: t("reader.tableOfContents.title"),
        placement: "bottom",
        isOpen: actionState?.isOpen || false,
        onOpenChange: setOpen,
        onClosePress: () => setOpen(false),
        docker: docking.getDocker(),
        resetFocus: actionState?.isOpen,
        scrollTopOnFocus: true,
        className: tocStyles.wrapper,
      }}
    >
      <div className={tocStyles.tree} aria-label={t("reader.toc.entries")}>
        {items.map((item) => (
          <button
            key={item.index}
            type="button"
            onClick={() => handleGo(item.index)}
            className={tocStyles.treeItem}
            aria-current={item.index === currentIndex ? "page" : undefined}
            data-active={item.index === currentIndex ? "true" : "false"}
          >
            <span className={tocStyles.treeItemText}>
              <span className={tocStyles.treeItemTextTitle}>Page {item.label}</span>
            </span>
          </button>
        ))}
      </div>
    </StatefulSheetWrapper>
  );
};

