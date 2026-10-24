"use client";

import { ThDocumentTitleFormat } from "@/preferences/models";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useI18n } from "@/i18n/useI18n";
import { useDocumentTitle } from "@/core/Hooks/useDocumentTitle";

/**
 * Sets the document title from the `metadata.documentTitle.format` preference,
 * shared by every visual reader so they title the tab the same way.
 */
export const useReaderDocumentTitle = ({ title, chapter }: { title?: string; chapter?: string }) => {
  const { preferences } = usePreferences();
  const { t } = useI18n();

  const documentTitleFormat = preferences.metadata?.documentTitle?.format;

  let documentTitle: string | undefined;

  if (documentTitleFormat) {
    if (typeof documentTitleFormat === "object" && "key" in documentTitleFormat) {
      const translatedTitle = t(documentTitleFormat.key);
      documentTitle = translatedTitle !== documentTitleFormat.key
        ? translatedTitle
        : documentTitleFormat.fallback;
    } else {
      switch (documentTitleFormat) {
        case ThDocumentTitleFormat.title:
          documentTitle = title;
          break;
        case ThDocumentTitleFormat.chapter:
          documentTitle = chapter;
          break;
        case ThDocumentTitleFormat.titleAndChapter:
          if (title && chapter) {
            documentTitle = `${ title } – ${ chapter }`;
          }
          break;
        case ThDocumentTitleFormat.none:
          documentTitle = undefined;
          break;
        default:
          documentTitle = documentTitleFormat;
          break;
      }
    }
  }

  useDocumentTitle(documentTitle);
};
