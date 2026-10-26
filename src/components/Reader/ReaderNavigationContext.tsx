"use client";

import { createContext, useContext, type ComponentType, type ReactNode, type SVGProps } from "react";
import type { ThCollapsibilityVisibility } from "@/core/Components/Actions/hooks/useCollapsibility";

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

/**
 * An application-owned action rendered inside the reader header's actions bar,
 * alongside the built-in actions (settings, TOC, fullscreen…), so it shares
 * their look and collapses into the overflow menu the same way.
 */
export type ReaderHeaderActionItem = {
  /** Stable id; must not collide with built-in action keys. */
  id: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGElement>>;
  onPress: () => void;
  /** Rendered as a pressed toggle when defined (e.g. page already bookmarked). */
  isActive?: boolean;
  /** Defaults to `label`. */
  tooltipLabel?: string;
  /** Defaults to `always`. */
  visibility?: ThCollapsibilityVisibility;
  /** Lower values collapse into the overflow menu first (built-ins default to 0, fullscreen -1). */
  collapsePriority?: number;
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
   * Application-owned actions rendered as icons in the header actions bar,
   * before the built-in actions.
   */
  headerActionItems?: ReaderHeaderActionItem[];
  /**
   * Application-owned bar rendered in place of the built-in footer (progression
   * and pagination). It sits in the layout flow, so the publication is sized
   * above it, and it stays visible in immersive mode.
   */
  footer?: ReactNode;
  /**
   * Shown on the last-chapter exit page when another Media source can continue
   * reading past the current source's end.
   */
  continueElsewhere?: ComicContinueElsewhereAction;
}

const ReaderNavigationContext = createContext<ReaderNavigation>({});

export const ReaderNavigationProvider = ReaderNavigationContext.Provider;

export const useReaderNavigation = () => useContext(ReaderNavigationContext);
