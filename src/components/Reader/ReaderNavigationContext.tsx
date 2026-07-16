"use client";

import { createContext, useContext } from "react";

export interface ReaderNavigation {
  publicationHref?: string;
}

const ReaderNavigationContext = createContext<ReaderNavigation>({});

export const ReaderNavigationProvider = ReaderNavigationContext.Provider;

export const useReaderNavigation = () => useContext(ReaderNavigationContext);
