"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Locator } from "@readium/shared";
import { Button } from "react-aria-components";
import { ThActionsKeys } from "@/preferences/models";
import { StatefulActionContainerProps } from "../models/actions";
import searchStyles from "./assets/styles/thorium-web.search.module.css";
import { StatefulSheetWrapper } from "../../Sheets/StatefulSheetWrapper";
import { ThFormSearchField } from "@/core/Components";
import { useDocking } from "../../Docking/hooks/useDocking";
import { useI18n } from "@/i18n/useI18n";
import { useNavigator } from "@/core/Navigator";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { setImmersive, setUserNavigated } from "@/lib/readerReducer";
import { usePublicationSearch } from "./usePublicationSearch";

const resultKey = (locator: Locator, index: number) =>
  `${locator.href}-${locator.locations.position ?? locator.locations.progression ?? index}`;

export const StatefulSearchContainer = ({
  triggerRef,
}: StatefulActionContainerProps) => {
  const { t } = useI18n();
  const { publication, unified } = useNavigator();
  const profile = useAppSelector((state) => state.reader.profile);
  const reducedMotion = useAppSelector(
    (state) => state.theming.prefersReducedMotion,
  );
  const actionState = useAppSelector((state) =>
    profile ? state.actions.keys[profile][ThActionsKeys.search] : undefined,
  );
  const dispatch = useAppDispatch();
  const docking = useDocking(ThActionsKeys.search);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const search = usePublicationSearch(publication);
  const resetSearch = search.reset;

  const setOpen = useCallback((value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({
        key: ThActionsKeys.search,
        isOpen: value,
        profile,
      }));
    }
  }, [dispatch, profile]);

  useEffect(() => {
    if (actionState?.isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setInputValue("");
      resetSearch();
    }
  }, [actionState?.isOpen, resetSearch]);

  if (!publication?.linkWithRel("search")) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void search.search(inputValue);
  };

  const handleResult = (locator: Locator) => {
    unified.go(locator, !reducedMotion, (ok) => {
      if (!ok) return;
      dispatch(setImmersive(true));
      dispatch(setUserNavigated(true));
      setOpen(false);
    });
  };

  const resultSummary = search.total !== undefined
    ? `${search.locators.length} of ${search.total} results`
    : `${search.locators.length} ${search.locators.length === 1 ? "result" : "results"}`;

  return (
    <StatefulSheetWrapper
      sheetType={ docking.sheetType }
      sheetProps={{
        id: ThActionsKeys.search,
        triggerRef,
        heading: t("reader.search.title"),
        className: searchStyles.wrapper,
        placement: "bottom",
        isOpen: actionState?.isOpen || false,
        onOpenChange: setOpen,
        onClosePress: () => setOpen(false),
        docker: docking.getDocker(),
        focusWithinRef: inputRef,
      }}
    >
      <form className={ searchStyles.form } onSubmit={ handleSubmit }>
        <ThFormSearchField
          aria-label={ t("reader.search.title") }
          value={ inputValue }
          onChange={ setInputValue }
          onClear={ () => {
            setInputValue("");
            search.reset();
          } }
          className={ searchStyles.searchField }
          compounds={{
            input: {
              ref: inputRef,
              className: searchStyles.input,
              placeholder: t("reader.search.placeholder"),
            },
            searchIcon: {
              className: searchStyles.searchIcon,
              hidden: Boolean(inputValue),
            },
            clearButton: {
              className: searchStyles.clearButton,
              isDisabled: !inputValue,
              "aria-label": t("common.actions.clear"),
            },
          }}
        />
        <Button
          type="submit"
          className={ searchStyles.submit }
          isDisabled={ !inputValue.trim() || search.isLoading }
        >
          {search.isLoading && search.locators.length === 0 ? "Searching…" : t("common.actions.search")}
        </Button>
      </form>

      {search.error ? (
        <div className={ searchStyles.error } role="alert">
          <span>{search.error}</span>
          <Button className={ searchStyles.retry } onPress={ () => void search.search(search.query) }>
            Try again
          </Button>
        </div>
      ) : null}

      {search.query && !search.error ? (
        <div className={ searchStyles.summary } aria-live="polite">
          <span>{resultSummary}</span>
          <span className={ searchStyles.query }>“{search.query}”</span>
        </div>
      ) : null}

      {search.query && !search.isLoading && search.locators.length === 0 && !search.error ? (
        <div className={ searchStyles.empty }>
          <strong>No matches found</strong>
          <span>Try a shorter word or another phrase.</span>
        </div>
      ) : null}

      {search.locators.length > 0 ? (
        <div className={ searchStyles.results } aria-label="Search results">
          {search.locators.map((locator, index) => (
            <Button
              key={ resultKey(locator, index) }
              className={ searchStyles.result }
              onPress={ () => handleResult(locator) }
            >
              <span className={ searchStyles.resultMeta }>
                <span>{locator.title || `Result ${index + 1}`}</span>
                {locator.locations.position ? <span>Position {locator.locations.position}</span> : null}
              </span>
              <span className={ searchStyles.snippet }>
                <span>{locator.text?.before}</span>
                <mark>{locator.text?.highlight}</mark>
                <span>{locator.text?.after}</span>
              </span>
            </Button>
          ))}
          {search.nextHref ? (
            <Button
              className={ searchStyles.loadMore }
              isDisabled={ search.isLoading }
              onPress={ () => void search.loadMore() }
            >
              {search.isLoading ? "Loading…" : "Load more results"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </StatefulSheetWrapper>
  );
};
