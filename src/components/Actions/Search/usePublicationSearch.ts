"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locator, Publication } from "@readium/shared";
import { searchPublicationPage } from "./searchPublication";

interface PublicationSearchState {
  error?: string;
  isLoading: boolean;
  locators: Locator[];
  nextHref?: string;
  query: string;
  total?: number;
}

const initialState: PublicationSearchState = {
  isLoading: false,
  locators: [],
  query: "",
};

export function usePublicationSearch(publication: Publication | undefined) {
  const [state, setState] = useState<PublicationSearchState>(initialState);
  const abortController = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortController.current?.abort();
    abortController.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(initialState);
  }, [cancel]);

  const search = useCallback(async (query: string, append = false) => {
    const normalizedQuery = query.trim();
    if (!publication || !normalizedQuery) {
      reset();
      return;
    }

    cancel();
    const controller = new AbortController();
    abortController.current = controller;
    const nextHref = append ? state.nextHref : undefined;
    setState((current) => ({
      ...current,
      error: undefined,
      isLoading: true,
      locators: append ? current.locators : [],
      nextHref: append ? current.nextHref : undefined,
      query: normalizedQuery,
      total: append ? current.total : undefined,
    }));

    try {
      const page = await searchPublicationPage({
        publication,
        query: normalizedQuery,
        nextHref,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setState((current) => ({
        error: undefined,
        isLoading: false,
        locators: append
          ? [...current.locators, ...page.locators]
          : page.locators,
        nextHref: page.nextHref,
        query: normalizedQuery,
        total: page.total,
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Search failed.",
        isLoading: false,
      }));
    } finally {
      if (abortController.current === controller) {
        abortController.current = null;
      }
    }
  }, [cancel, publication, reset, state.nextHref]);

  useEffect(() => cancel, [cancel]);

  return {
    ...state,
    cancel,
    loadMore: () => search(state.query, true),
    reset,
    search: (query: string) => search(query),
  };
}
