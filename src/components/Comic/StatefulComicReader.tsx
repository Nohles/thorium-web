"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, Publication } from "@readium/shared";

import { StatefulReaderProps } from "../Reader/StatefulReaderWrapper";

type ComicPage = {
  index: number;
  link: Link;
};

const getReadingOrderImages = (publication: Publication): ComicPage[] => {
  const items = publication.readingOrder?.items ?? [];

  return items
    .filter((item) => !item.templated)
    .filter((item) => typeof item.type === "string" && item.type.startsWith("image/"))
    .map((link, index) => ({ index, link }));
};

export const StatefulComicReader = ({ publication }: StatefulReaderProps) => {
  const pages = useMemo(() => getReadingOrderImages(publication), [publication]);
  const [pageIndex, setPageIndex] = useState(0);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const current = pages[pageIndex];
  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex < pages.length - 1;

  useEffect(() => {
    setPageIndex(0);
  }, [publication]);

  useEffect(() => {
    let cancelled = false;
    let previousUrl: string | null = null;

    const load = async () => {
      setError(null);

      if (!current) {
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }

      setIsLoading(true);
      try {
        const bytes = await publication.get(current.link).read();
        if (cancelled) return;
        if (!bytes) {
          setError("Failed to load image bytes.");
          return;
        }

        const mime = current.link.type || "image/jpeg";
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        previousUrl = url;
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load image.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    };
  }, [publication, current]);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        background: "var(--th-color-bg, #fff)",
        color: "var(--th-color-text, #111)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          disabled={!canGoPrev}
        >
          Previous
        </button>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {pages.length > 0 ? `${pageIndex + 1} / ${pages.length}` : "No pages"}
        </div>

        <button
          type="button"
          onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
          disabled={!canGoNext}
        >
          Next
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          padding: 8,
        }}
      >
        {error ? (
          <div style={{ maxWidth: 720, padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Unable to render this page</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>{error}</div>
          </div>
        ) : objectUrl ? (
          <img
            src={objectUrl}
            alt={current?.link.title || `Page ${pageIndex + 1}`}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
            }}
          />
        ) : isLoading ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 13 }}>No image to display.</div>
        )}
      </div>
    </div>
  );
};

