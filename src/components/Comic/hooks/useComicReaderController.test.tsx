import assert from "node:assert/strict";
import { test } from "node:test";
import { act, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JSDOM } from "jsdom";
import { Link } from "@readium/shared";
import { defaultComicSettings } from "@/lib/comicSettingsReducer";
import { findClosestArchivePageIndex, remapCursorToSamePage } from "../lib/comicCursorAnchor";
import { useComicReaderController, type ComicPage } from "./useComicReaderController";

const pagesFor = (chapters: number[]): ComicPage[] => chapters.flatMap(chapterIndex =>
  Array.from({ length: 24 }, (_, pageIndexInChapter) => ({
    index: 0,
    href: `${chapterIndex}/${pageIndexInChapter}.png`,
    link: new Link({ href: `${chapterIndex}/${pageIndexInChapter}.png` }),
    title: `Chapter ${chapterIndex}, page ${pageIndexInChapter}`,
    archive: { chapterIndex, chapterHref: `${chapterIndex}.cbz`, pageIndexInChapter, pageHref: `${pageIndexInChapter}.png` },
  })),
).map((page, index) => ({ ...page, index }));

for (const firstChapter of [6, 5]) {
  for (const savedPage of [0, 7, 30]) {
    test(`restores page ${savedPage} before saving when chapter ${firstChapter} arrives first`, async () => {
      const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://reader.test" });
      const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
      const descriptors = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      Object.entries(globals).forEach(([key, value]) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }));
      const { createRoot } = await import("react-dom/client");
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      const writes: Array<{ chapterIndex: number; pageIndexInChapter: number }> = [];
      let nextPage = () => {};

      function Reader({ pages }: { pages: ComicPage[] }) {
        const [position, setPosition] = useState({ chapterIndex: 5, pageIndexInChapter: savedPage });
        const pagesRef = useRef(pages);
        useEffect(() => { pagesRef.current = pages; }, [pages]);
        const persist = useCallback((index: number) => {
          const page = pagesRef.current[index]?.archive;
          if (!page) return;
          writes.push(page);
          // Bound a failing test: the old restore/remap feedback writes alternate
          // chapters indefinitely rather than reaching the assertion below.
          if (writes.length > 12) throw new Error("Position restore/save loop");
          setPosition(page);
        }, []);
        const storedPosition = useMemo(() => {
          const index = pages.findIndex(page => page.archive?.chapterIndex === position.chapterIndex && page.archive.pageIndexInChapter === position.pageIndexInChapter);
          if (index >= 0) return index;
          const fallback = findClosestArchivePageIndex(pages, position);
          return fallback < 0 ? undefined : fallback;
        }, [pages, position]);
        const { cursorIndex, setCursorIndex, isRestoringPosition, goNext } = useComicReaderController({
          pages, settings: defaultComicSettings, savedPosition: storedPosition,
          onPersistPosition: persist, chapterSegments: [], chapterBoundariesEnabled: false,
        });
        nextPage = goNext;
        // Exercise the archive consumer's restore and prepend-remapping paths
        // together; testing either path alone misses the race.
        useEffect(() => {
          if (storedPosition !== undefined) setCursorIndex(previous => previous === storedPosition ? previous : storedPosition);
        }, [storedPosition, setCursorIndex]);
        const [anchorPages, setAnchorPages] = useState(pages);
        if (anchorPages !== pages) {
          setAnchorPages(pages);
          if (!isRestoringPosition) {
            const next = remapCursorToSamePage(anchorPages, pages, cursorIndex);
            if (next !== cursorIndex) setCursorIndex(next);
          }
        }
        const page = pages[cursorIndex]?.archive;
        return <output>{page ? `${page.chapterIndex}:${page.pageIndexInChapter}` : "loading"}</output>;
      }

      try {
        const restoredPage = Math.min(savedPage, 23);
        await act(async () => root.render(<Reader pages={[]} />));
        await act(async () => root.render(<Reader pages={pagesFor([firstChapter])} />));
        await act(async () => root.render(<Reader pages={pagesFor([5, 6])} />));
        assert.equal(container.textContent, `5:${restoredPage}`);
        assert.ok(writes.every(page => page.chapterIndex === 5 && page.pageIndexInChapter === restoredPage));
        await act(async () => root.render(<Reader pages={pagesFor([4, 5, 6])} />));
        assert.equal(container.textContent, `5:${restoredPage}`);
        if (restoredPage < 23) {
          await act(async () => nextPage());
          assert.equal(container.textContent, `5:${restoredPage + 1}`);
          assert.deepEqual(writes.at(-1) && { chapterIndex: writes.at(-1)!.chapterIndex, pageIndexInChapter: writes.at(-1)!.pageIndexInChapter }, { chapterIndex: 5, pageIndexInChapter: restoredPage + 1 });
        }
      } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of descriptors) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else Reflect.deleteProperty(globalThis, key);
        }
      }
    });
  }
}
