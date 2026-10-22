import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Link, Manifest, Publication } from "@readium/shared";

import { buildComicTocTree } from "../buildComicTimeline";
import type { ComicPage } from "../hooks/useComicReaderController";
import { buildComicChapterSegments } from "./comicChapters";
import type { ComicLabels } from "./comicLabels";

const labels: ComicLabels = {
  page: (number) => `Seite ${number}`,
  chapter: (number) => `Kapitel ${number}`,
  chapterPage: (chapter, number) => `${chapter} – Seite ${number}`,
};

const makePublication = (toc: Array<{ href: string; title?: string }>) =>
  new Publication({
    manifest: Manifest.deserialize({
      metadata: { title: "Comic" },
      readingOrder: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"].map((href) => ({ href, type: "image/jpeg" })),
      toc,
    })!,
  });

const makePages = (publication: Publication): ComicPage[] =>
  publication.readingOrder.items.map((link, index) => ({
    index,
    link,
    href: link.href,
    title: link.title || labels.page(index + 1),
  }));

describe("buildComicChapterSegments", () => {
  test("uses the localized fallback for untitled chapters", () => {
    const publication = makePublication([
      { href: "1.jpg", title: "Prologue" },
      { href: "3.jpg" },
    ]);
    const segments = buildComicChapterSegments(publication, makePages(publication), labels);
    assert.deepEqual(segments.map((segment) => segment.title), ["Prologue", "Kapitel 2"]);
  });
});

describe("buildComicTocTree", () => {
  test("titles untitled pages with their page label", () => {
    const publication = makePublication([]);
    const tree = buildComicTocTree(publication, makePages(publication));
    assert.deepEqual(tree.map((item) => item.title), ["Seite 1", "Seite 2", "Seite 3", "Seite 4"]);
  });

  test("keeps titles the manifest provides", () => {
    const publication = makePublication([]);
    const pages = makePages(publication);
    pages[0] = { ...pages[0], link: new Link({ href: "1.jpg", type: "image/jpeg", title: "Cover" }) };
    assert.equal(buildComicTocTree(publication, pages)[0].title, "Cover");
  });
});
