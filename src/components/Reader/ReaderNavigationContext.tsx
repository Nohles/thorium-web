"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ComicContinueElsewhereAction = {
  /** Fully formed button label, e.g. "Continue on Source 2". */
  label: string;
  onContinue: () => void;
};

export type ReaderSourceOption = {
  id: string;
  /** Primary label shown in the header trigger and list. */
  label: string;
  /** Optional secondary text shown only in the open list (e.g. library name). */
  description?: string;
};

export type ReaderSourceSelection = {
  items: ReaderSourceOption[];
  selectedId: string;
  isLoading?: boolean;
  disabled?: boolean;
  onSelect: (sourceId: string) => void;
  /** Accessible name for the control. Falls back to i18n. */
  label?: string;
};

export interface ReaderNavigation {
  /** Href for the media item page (e.g. One Piece details). */
  publicationHref?: string;
  /** Href for the app home / root route. */
  homeHref?: string;
  /**
   * Multi-source selector for the reader header.
   * Hidden automatically when fewer than two items are provided.
   */
  sources?: ReaderSourceSelection;
  /** Application-owned controls rendered in the reader header. */
  headerActions?: ReactNode;
  /**
   * Shown on the last-chapter exit page when another Media source can continue
   * reading past the current source's end.
   */
  continueElsewhere?: ComicContinueElsewhereAction;
}

const ReaderNavigationContext = createContext<ReaderNavigation>({});

export const ReaderNavigationProvider = ReaderNavigationContext.Provider;

export const useReaderNavigation = () => useContext(ReaderNavigationContext);
