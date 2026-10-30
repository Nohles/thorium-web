"use client";

import { CSSProperties, FocusEvent, RefObject, useCallback, useEffect, useMemo } from "react";

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

  // The current entry may not be rendered yet, so the sheet's focus/scrollIntoView logic
  // can't find it. Scroll its estimated position into view so the virtualizer renders it.
  useEffect(() => {
    if (!tocEntry || filterValue) return;
    const frame = requestAnimationFrame(() => {
      const tree = treeRef?.current;
      if (!tree || tree.querySelector("[data-selected]")) return;
      const rect = layout.getLayoutInfo(tocEntry)?.rect;
      const scroller = getScrollParent(tree);
      if (!rect || !scroller) return;
      const treeTop = tree.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = treeTop + rect.y - (scroller.clientHeight - rect.height) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [tocEntry, filterValue, layout, treeRef]);

  // React Aria scrolls focused rows within the Tree, which isn't the scroll container here.
  // Rows that scroll into view get measured and can push the focused row down,
  // so keep it in view for a few frames while the layout settles.
  const keepFocusedRowInView = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest?.("[role='row']");
    if (!row) return;
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
