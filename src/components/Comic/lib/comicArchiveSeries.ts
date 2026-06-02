import { Link, Manifest } from "@readium/shared";

export const COMIC_ARCHIVE_MEDIA_TYPES = new Set([
  "application/vnd.comicbook+zip",
  "application/vnd.comicbook-rar",
  "application/x-cbz",
  "application/x-cbr",
]);

export type ComicArchiveChapter = {
  index: number;
  href: string;
  title: string;
  type?: string;
  manifestUrl?: string;
};

export type ComicArchivePageIdentity = {
  chapterIndex: number;
  chapterHref: string;
  pageIndexInChapter: number;
  pageHref: string;
};

export type ComicArchivePosition = ComicArchivePageIdentity & {
  href?: string;
};

export const isComicArchiveType = (type?: string): boolean => {
  if (!type) return false;
  return COMIC_ARCHIVE_MEDIA_TYPES.has(type.toLowerCase());
};

export const isComicArchiveSeriesManifest = (manifest: Manifest): boolean => {
  const items = manifest.readingOrder?.items ?? [];
  return items.length > 0 && items.every((item) => !item.templated && isComicArchiveType(item.type));
};

const stripHashAndQuery = (href: string): string => {
  const [base] = href.split("#");
  const [path] = base.split("?");
  return path;
};

const decodeBase64Url = (value: string): string => {
  if (typeof atob === "function") {
    const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
    return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  }
  return Buffer.from(value, "base64url").toString("utf8");
};

const encodeBase64Url = (value: string): string => {
  if (typeof btoa === "function") {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(value, "utf8").toString("base64url");
};

const decodeHrefPath = (href: string): string => {
  try {
    return decodeURIComponent(stripHashAndQuery(href));
  } catch {
    return stripHashAndQuery(href);
  }
};

export const deriveCliChildManifestUrl = (parentManifestUrl: string, chapterHref: string): string | null => {
  let url: URL;
  try {
    url = new URL(parentManifestUrl);
  } catch {
    return null;
  }

  const match = url.pathname.match(/^(.*\/webpub\/)([^/]+)\/manifest\.json$/);
  if (!match) return null;

  const [, prefix, token] = match;
  if (!token) return null;

  try {
    const parentPath = decodeBase64Url(token);
    const childPath = `${parentPath.replace(/\/+$/, "")}/${decodeHrefPath(chapterHref).replace(/^\/+/, "")}`;
    const child = new URL(url.href);
    child.pathname = `${prefix}${encodeBase64Url(childPath)}/manifest.json`;
    child.search = "";
    child.hash = "";
    return child.href;
  } catch {
    return null;
  }
};

export const buildComicArchiveChapters = (manifest: Manifest, parentManifestUrl: string): ComicArchiveChapter[] => {
  const readingOrder = manifest.readingOrder?.items ?? [];
  const tocItems = manifest.toc?.items ?? [];
  return readingOrder
    .filter((link) => !link.templated && isComicArchiveType(link.type))
    .map((link, index) => {
      const tocTitle = tocItems.find((toc) => stripHashAndQuery(toc.href) === stripHashAndQuery(link.href))?.title;
      const title = tocTitle || link.title || decodeHrefPath(link.href).replace(/\.[^.]+$/, "") || `Chapter ${index + 1}`;
      return {
        index,
        href: link.href,
        title,
        type: link.type,
        manifestUrl: deriveCliChildManifestUrl(parentManifestUrl, link.href) ?? undefined,
      };
    });
};

export const resolveChapterResourceHref = (chapterManifestUrl: string, href: string): string => {
  try {
    return new URL(href, chapterManifestUrl).href;
  } catch {
    return href;
  }
};

export const readManifestFromUrl = async (manifestUrl: string): Promise<Manifest> => {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch chapter manifest (${response.status}).`);
  }
  const data = await response.json();
  const manifest = Manifest.deserialize(data);
  if (!manifest) {
    throw new Error("Failed to parse chapter manifest.");
  }
  manifest.setSelfLink(manifestUrl);
  return manifest;
};

export const makeComicArchivePosition = (identity: ComicArchivePageIdentity, href: string): ComicArchivePosition => ({
  ...identity,
  href,
});

export const isComicArchivePosition = (value: unknown): value is ComicArchivePosition =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ComicArchivePosition).chapterIndex === "number" &&
  typeof (value as ComicArchivePosition).chapterHref === "string" &&
  typeof (value as ComicArchivePosition).pageIndexInChapter === "number" &&
  typeof (value as ComicArchivePosition).pageHref === "string";

export const makeChapterTocLink = (chapter: ComicArchiveChapter): Link =>
  new Link({
    href: chapter.href,
    type: chapter.type,
    title: chapter.title,
  });
