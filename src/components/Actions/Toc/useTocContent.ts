"use client";

import { useEffect, useRef, useState } from "react";

import { Key, useFilter } from "react-aria-components";

import { TocItem } from "@/helpers/buildTocTree";

interface UseTocContentOptions {
  isOpen: boolean;
  tocTree: TocItem[] | undefined;
  tocEntry: string | undefined;
}

function filterTocTree(
  items: TocItem[],
  query: string,
  contains: (string: string, substring: string) => boolean
): TocItem[] {
  if (!query) return items;
  const recursiveFilter = (items: TocItem[]): TocItem[] =>
    items.reduce((acc: TocItem[], item: TocItem) => {
      if (item.title && contains(item.title, query)) acc.push({ ...item, children: undefined });
      if (item.children) acc.push(...recursiveFilter(item.children));
      return acc;
    }, []);
  return recursiveFilter(items);
}

export function useTocContent({ isOpen, tocTree, tocEntry }: UseTocContentOptions) {
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set());
  const [filterValue, setFilterValue] = useState("");
  const treeRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  /** Latest tree for expand-parents logic; avoids effect re-running on referentially unstable `tocTree` from Redux. */
  const tocTreeRef = useRef(tocTree);
  tocTreeRef.current = tocTree;

  const { contains } = useFilter({ sensitivity: "base" });

  // Reset filter when closed
  useEffect(() => {
    if (!isOpen) setFilterValue("");
  }, [isOpen]);

  // ESC clears filter and prevents container from dismissing
  useEffect(() => {
    if (!isOpen || !filterValue) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFilterValue("");
      }
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [isOpen, filterValue]);

  // Expand parents of current entry when the TOC is visible. Depends only on open state and `tocEntry`:
  // `tocTree` is read from a ref so a new array
  // reference on every timeline dispatch does not retrigger this effect (which would fight react-aria Tree
  // controlled `expandedKeys` / `onExpandedChange` and can cause a maximum-update-depth loop).
  useEffect(() => {
    const tree = tocTreeRef.current;
    if (!isOpen || !tocEntry || !tree?.length) return;
    setExpandedKeys(prev => {
      const next = new Set<Key>(prev);
      let changed = false;
      const expand = (items: TocItem[]): boolean =>
        items.some(item => {
          if (item.id === tocEntry) return true;
          if (item.children) {
            const found = expand(item.children);
            if (found && !next.has(item.id)) {
              next.add(item.id);
              changed = true;
            }
            return found;
          }
          return false;
        });
      expand(tree);
      return changed ? next : prev;
    });
  }, [isOpen, tocEntry]);

  const displayedTocTree = filterTocTree(tocTree || [], filterValue, contains);

  return { expandedKeys, setExpandedKeys, filterValue, setFilterValue, displayedTocTree, treeRef, searchInputRef };
}
