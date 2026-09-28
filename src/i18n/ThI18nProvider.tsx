"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n, initI18n } from "./config";
import { InitOptions } from "i18next";
import { useGlobalPreferences } from "@/preferences/hooks/useGlobalPreferences";

export type ThI18nProviderProps = {
  children: ReactNode;
} & Partial<InitOptions>;

export const ThI18nProvider = ({
  children,
  ...options
}: ThI18nProviderProps) => {
  const { preferences: { locale } } = useGlobalPreferences();
  const [isInitialized, setIsInitialized] = useState(i18n.isInitialized);
  
  useEffect(() => {
    if (!i18n.isInitialized) {      
      initI18n({
        ...options,
        lng: locale || options.lng,
      }).then(() => setIsInitialized(true));
    }
  });

  useEffect(() => {
    if (isInitialized && locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    const lang = locale || i18n.resolvedLanguage || i18n.language || "en";
    document.documentElement.lang = lang;
  }, [locale, isInitialized]);

  // Render children even before i18n initialises. Returning null here blanks
  // the whole reader — including any loading surface — on a cold first open,
  // which is exactly when a loading surface is needed most. `useI18n` tolerates
  // an uninitialised instance and echoes keys back, so the only cost is that
  // untranslated text may briefly render untranslated instead of not at all.
  return <I18nextProvider i18n={ i18n }>{ children }</I18nextProvider>;
};

export default ThI18nProvider;
