"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";

/** Fallback labels for pages and chapters the manifest leaves untitled. */
export type ComicLabels = {
  page: (number: number) => string;
  chapter: (number: number) => string;
  chapterPage: (chapterTitle: string, number: number) => string;
};

export const defaultComicLabels: ComicLabels = {
  page: (number) => `Page ${number}`,
  chapter: (number) => `Chapter ${number}`,
  chapterPage: (chapterTitle, number) => `${chapterTitle} - Page ${number}`,
};

export const useComicLabels = (): ComicLabels => {
  const { t } = useI18n();
  return useMemo(
    () => ({
      page: (number) => t("reader.comic.labels.page", { number }),
      chapter: (number) => t("reader.comic.labels.chapter", { number }),
      chapterPage: (chapterTitle, number) => t("reader.comic.labels.chapterPage", { chapter: chapterTitle, number }),
    }),
    [t]
  );
};
