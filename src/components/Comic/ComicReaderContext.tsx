"use client";

import { createContext, useContext } from "react";

export interface ComicReaderContextValue {
  pageCount: number;
  currentIndex: number;
  goToIndex: (index: number) => void;
}

const ComicReaderContext = createContext<ComicReaderContextValue | null>(null);

export const ComicReaderProvider = ({
  value,
  children,
}: {
  value: ComicReaderContextValue;
  children: React.ReactNode;
}) => {
  return <ComicReaderContext.Provider value={value}>{children}</ComicReaderContext.Provider>;
};

export const useComicReader = () => {
  const ctx = useContext(ComicReaderContext);
  if (!ctx) {
    throw new Error("Comic reader hooks must be used within ComicReaderProvider");
  }
  return ctx;
};

