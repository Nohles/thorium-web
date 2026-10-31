"use client";

import { CSSProperties, FocusEvent, RefObject, useCallback, useEffect, useMemo, useRef } from "react";

import {
  Button,
  Collection,
  Key,
  ListLayout,
  Selection,
  Tree,
  TreeItem,
  TreeItemContent,
  Virtualizer
} from "react-aria-components";

import { TocItem } from "@/helpers/buildTocTree";
import { ThFormSearchField } from "@/core/Components";

import Chevron from "./assets/icons/chevron_right.svg";
import tocStyles from "./assets/styles/thorium-web.toc.module.css";

import { useI18n } from "@/i18n/useI18n";

export interface TocContentProps {
  filterValue: string;
  onFilterChange: (value: string) => void;
  displayedTocTree: TocItem[];
  tocTree: TocItem[] | undefined;
  tocEntry: Key | string | undefined;
  expandedKeys: Set<Key>;
  onExpandedChange: (keys: Set<Key>) => void;
  onSelectionChange: (keys: Selection) => void;
  isRTL?: boolean;
  treeRef?: RefObject<HTMLDivElement | null>;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  compounds?: {
    tree?: { className?: string };
    treeWrapper?: { className?: string };
  };
}

// Matches the min-height of .treeItem; rows that wrap are measured once rendered.
const ESTIMATED_ROW_HEIGHT = 40;
// Upper bound for centering the current entry while the sheet opens and rows are measured.
const MAX_SCROLL_SETTLE_MS = 1500;

const getScrollParent = (element: HTMLElement | null): HTMLElement | null => {
  let parent = element?.parentElement ?? null;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) return parent;
    parent = parent.parentElement;
  }
  return null;
};

export const TocContent = ({
  filterValue,
  onFilterChange,
  displayedTocTree,
  tocTree,
  tocEntry,
  expandedKeys,
  onExpandedChange,
  onSelectionChange,
  isRTL = false,
  treeRef,
  searchInputRef,
  compounds,
}: TocContentProps) => {
  const { t } = useI18n();

  // Long TOCs (thousands of entries) took seconds to mount when every row was rendered,
  // so only the rows in view are rendered. The sheet stays the scroll container:
  // React Aria's Virtualizer follows ancestor scrolling.
  const layout = useMemo(() => new ListLayout(), []);
  const layoutOptions = useMemo(() => ({ estimatedRowHeight: ESTIMATED_ROW_HEIGHT }), []);

  // Center the current entry when the TOC opens. Rows outside the rendered window can't be
  // relied on: React Aria keeps the selected row mounted but draws it at a stale position
  // until it is in view, so the sheet's focus and scrollIntoView logic sends the list to the
  // wrong place (usually near the top). Scroll to the entry's layout position instead, and
  // keep correcting while rendered rows are measured and shift it, until the row is drawn
  // where the layout says. Re-runs when parents expand since that changes the layout.
  const pendingScrollRef = useRef(false);
  useEffect(() => {
    pendingScrollRef.current = true;
  }, [tocEntry]);

  useEffect(() => {
    if (!tocEntry || filterValue || !pendingScrollRef.current) return;

    const deadline = performance.now() + MAX_SCROLL_SETTLE_MS;
    let frame = 0;
    let isFirstCheck = true;
    let stableFrames = 0;
    let lastTarget: number | null = null;
    let scroller: HTMLElement | null = null;

    // Don't fight the user once they start scrolling or navigating
    const onUserInput = () => stop();
    const userEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const setScroller = (next: HTMLElement | null) => {
      if (next === scroller) return;
      userEvents.forEach(type => scroller?.removeEventListener(type, onUserInput));
      scroller = next;
      userEvents.forEach(type => scroller?.addEventListener(type, onUserInput, { passive: true }));
    };
    const stop = () => {
      pendingScrollRef.current = false;
      cancelAnimationFrame(frame);
      setScroller(null);
    };

    const step = () => {
      const tree = treeRef?.current ?? null;
      setScroller(getScrollParent(tree));
      const rect = layout.getLayoutInfo(tocEntry)?.rect;

      if (tree && scroller && rect) {
        const treeRect = tree.getBoundingClientRect();
        const treeTop = treeRect.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        const rowTop = treeTop + rect.y;

        // Entry changed while it was already in view (e.g. picked from a docked TOC): leave it be
        if (isFirstCheck && rowTop >= scroller.scrollTop && rowTop + rect.height <= scroller.scrollTop + scroller.clientHeight) {
          stop();
          return;
        }
        isFirstCheck = false;

        const target = Math.round(rowTop - (scroller.clientHeight - rect.height) / 2);
        if (Math.abs(scroller.scrollTop - target) > 1) scroller.scrollTop = target;

        const row = tree.querySelector<HTMLElement>("[role='row'][data-selected]");
        const isDrawnInPlace = !!row && Math.abs(row.getBoundingClientRect().top - treeRect.top - rect.y) < 1;
        stableFrames = target === lastTarget && isDrawnInPlace ? stableFrames + 1 : 0;
        lastTarget = target;
        if (stableFrames >= 3) {
          stop();
          return;
        }
      }

      if (performance.now() < deadline) {
        frame = requestAnimationFrame(step);
      } else {
        stop();
      }
    };

    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      setScroller(null);
    };
  }, [tocEntry, filterValue, expandedKeys, layout, treeRef]);

  // React Aria scrolls focused rows within the Tree, which isn't the scroll container here.
  // Rows that scroll into view get measured and can push the focused row down,
  // so keep it in view for a few frames while the layout settles.
  const keepFocusedRowInView = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest?.("[role='row']");
    // While the current entry is being centered, its row may be drawn at a stale position
    if (!row || pendingScrollRef.current) return;
    let frames = 4;
    const step = () => {
      if (!row.isConnected || document.activeElement !== row) return;
      row.scrollIntoView({ block: "nearest" });
      if (--frames > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  if (!tocTree || tocTree.length === 0) {
    return <div className={ tocStyles.empty }>{ t("reader.tableOfContents.emptyState.description") }</div>;
  }

  return (
    <>
      <ThFormSearchField
        aria-label={ t("common.actions.search") }
        value={ filterValue }
        onChange={ onFilterChange }
        onClear={ () => onFilterChange("") }
        className={ tocStyles.search }
        compounds={ {
          label: { className: tocStyles.searchLabel },
          input: {
            ref: searchInputRef,
            className: tocStyles.searchInput,
            placeholder: t("common.actions.search")
          },
          searchIcon: { className: tocStyles.searchIcon, hidden: !!filterValue },
          clearButton: {
            className: tocStyles.clearButton,
            isDisabled: !filterValue,
            "aria-label": t("common.actions.clear")
          }
        } }
      />
      <div { ...compounds?.treeWrapper } onFocus={ keepFocusedRowInView }>
      <Virtualizer layout={ layout } layoutOptions={ layoutOptions }>
      <Tree
        ref={ treeRef }
        aria-label={ t("reader.toc.entries") }
        selectionMode="single"
        items={ displayedTocTree }
        className={ [tocStyles.tree, compounds?.tree?.className].filter(Boolean).join(" ") }
        onSelectionChange={ onSelectionChange }
        selectedKeys={ tocEntry ? [tocEntry] : [] }
        expandedKeys={ expandedKeys }
        onExpandedChange={ onExpandedChange }
        dir={ isRTL ? "rtl" : "ltr" }
      >
        { function renderItem(item) {
          return (
            <TreeItem
              className={ tocStyles.treeItem }
              textValue={ item.title || "" }
            >
              <TreeItemContent>
                { item.children && (
                  <Button
                    slot="chevron"
                    className={ tocStyles.treeItemButton }
                    style={ { transform: isRTL ? "scaleX(-1)" : "none" } as CSSProperties }
                  >
                    <Chevron aria-hidden="true" focusable="false" />
                  </Button>
                ) }
                <div className={ tocStyles.treeItemText }>
                  <div className={ tocStyles.treeItemTextTitle }>{ item.title }</div>
                  { item.position && <div className={ tocStyles.treeItemTextPosition }>{ item.position }</div> }
                </div>
              </TreeItemContent>
              <Collection items={ item.children }>
                { renderItem }
              </Collection>
            </TreeItem>
          );
        } }
      </Tree>
      </Virtualizer>
      </div>
    </>
  );
};
