"use client";

import React, { useRef, useEffect } from "react";

import { StatefulSheet } from "./models/sheets";

import sheetStyles from "./assets/styles/thorium-web.sheets.module.css";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThContainerHeader } from "@/core/Components/Containers/ThContainerHeader";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { StatefulSheetHeaderControls } from "./StatefulSheetHeaderControls";

import { useWebkitPatch } from "./hooks/useWebkitPatch";

import classNames from "classnames";
import { prefixString } from "@/core/Helpers/prefixString";

export interface StatefulModalBaseProps extends StatefulSheet {
  sheetClassName: string;
  dialogClassName?: string;
};

export const StatefulModalBase = ({
    id,
    heading,
    headerVariant,
    className,
    sheetClassName,
    dialogClassName,
    isOpen,
    onOpenChange,
    onClosePress,
    onBackPress,
    docker,
    children,
    resetFocus,
    focusWithinRef,
    focusSelector,
    scrollTopOnFocus,
    dismissEscapeKeyClose
  }: StatefulModalBaseProps) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetHeaderRef = useRef<HTMLDivElement | null>(null);
  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen && sheetRef.current && sheetHeaderRef.current) {
      sheetRef.current.style.setProperty(
        `--${ prefixString("sheet-sticky-header") }`,
        `${ sheetHeaderRef.current.clientHeight }px`
      );
    }
  }, [isOpen]);

  // Warning: This is a temporary fix for a bug in React Aria Components.
  useWebkitPatch(!!isOpen);

  if (React.Children.toArray(children).length > 0) {
    return(
      <>
      <ThModal
        id={ id }
        ref={ sheetRef }
        focusOptions={{
          withinRef: focusWithinRef ?? sheetBodyRef,
          trackedState: isOpen,
          fallbackRef: sheetCloseRef,
          withSelector: focusSelector,
          action: {
            type: "focus",
            options: {
              preventScroll: scrollTopOnFocus ? true : false,
              scrollContainerToTop: scrollTopOnFocus
            }
          },
          updateState: resetFocus
        }}
        compounds={{
          dialog: {
            className: classNames(sheetStyles.dialog, dialogClassName, className)
          }
        }}
        isOpen={ isOpen }
        onOpenChange={ onOpenChange }
        isDismissable={ true }
        className={ sheetClassName }
        isKeyboardDismissDisabled={ dismissEscapeKeyClose }
      >
        <ThContainerHeader
          ref={ sheetHeaderRef }
          className={ sheetStyles.header }
          label={ heading }
          compounds={{
            heading: {
              className: sheetStyles.heading
            }
          }}
        >
          <StatefulSheetHeaderControls
            id={ id }
            headerVariant={ headerVariant }
            docker={ docker }
            className={ className }
            closeRef={ sheetCloseRef }
            onClosePress={ onClosePress }
            onBackPress={ onBackPress }
          />
        </ThContainerHeader>
        <ThContainerBody
          ref={ sheetBodyRef }
          className={ sheetStyles.body }
        >
          { children }
        </ThContainerBody>
      </ThModal>
      </>
    )
  }
}
