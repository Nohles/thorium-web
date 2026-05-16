import {
  GuidedNavigationDocument,
  GuidedNavigationObject,
  Link,
  Locator,
  LocatorLocations,
  Publication,
} from "@readium/shared";

import type {
  ReadAlongGranularity,
  ReadAlongSyncIndex,
  ReadAlongSyncPoint,
  ReadAlongSyncPointMatch,
  ReadAlongTextTarget,
} from "./types";

const GUIDED_NAV_MEDIA_TYPE = "application/guided-navigation+json";

export const READ_ALONG_HIGHLIGHT_ATTR = "data-thorium-read-along-active";

export const READ_ALONG_HIGHLIGHT_CSS = `
  [${READ_ALONG_HIGHLIGHT_ATTR}="true"] {
    background-color: rgba(255, 214, 0, 0.45) !important;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
`;

export function normalizeResourceHref(href: string, baseURL?: string): string {
  if (!href) return "";
  try {
    const url = baseURL ? new URL(href, baseURL) : new URL(href, "http://local/");
    return url.pathname + url.search + url.hash.split("#t=")[0];
  } catch {
    const hashIdx = href.indexOf("#");
    return hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  }
}

export function hrefsMatch(a: string, b: string, baseA?: string, baseB?: string): boolean {
  const na = normalizeResourceHref(a, baseA);
  const nb = normalizeResourceHref(b, baseB);
  if (na === nb) return true;
  return na.endsWith(nb) || nb.endsWith(na);
}

function resolveTextTarget(textref: string, epubBaseUrl?: string): ReadAlongTextTarget {
  const hashIdx = textref.indexOf("#");
  const href = hashIdx >= 0 ? textref.slice(0, hashIdx) : textref;
  const fragmentId = hashIdx >= 0 ? textref.slice(hashIdx + 1) : undefined;
  let resolvedHref = href;
  if (epubBaseUrl) {
    try {
      resolvedHref = new URL(href, epubBaseUrl).href;
    } catch {
      resolvedHref = href;
    }
  }
  return { href: resolvedHref, fragmentId };
}

function walkGuidedNodes(
  nodes: GuidedNavigationObject[] | undefined,
  granularity: ReadAlongGranularity,
  audioBaseUrl: string | undefined,
  epubBaseUrl: string | undefined,
  out: ReadAlongSyncPoint[],
  idRef: { value: number }
): void {
  if (!nodes?.length) return;

  for (const node of nodes) {
    const clip = node.clip;
    const textref = node.textref;

    if (clip?.start !== undefined && textref) {
      out.push({
        id: `read-along-${idRef.value++}`,
        startTime: clip.start,
        endTime: clip.end,
        audioHref: normalizeResourceHref(clip.audioResource, audioBaseUrl),
        text: resolveTextTarget(textref, epubBaseUrl),
        granularity,
      });
    }

    if (node.children?.length) {
      walkGuidedNodes(node.children, "word", audioBaseUrl, epubBaseUrl, out, idRef);
    }
  }
}

export function buildSyncIndex(
  document: GuidedNavigationDocument,
  options?: { audioBaseUrl?: string; epubBaseUrl?: string }
): ReadAlongSyncIndex {
  const points: ReadAlongSyncPoint[] = [];
  const idRef = { value: 0 };

  walkGuidedNodes(
    document.guided,
    "block",
    options?.audioBaseUrl,
    options?.epubBaseUrl,
    points,
    idRef
  );

  points.sort((a, b) => {
    const hrefCmp = a.audioHref.localeCompare(b.audioHref);
    if (hrefCmp !== 0) return hrefCmp;
    return a.startTime - b.startTime;
  });

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[i + 1];
    if (current.endTime === undefined && next && hrefsMatch(current.audioHref, next.audioHref)) {
      current.endTime = next.startTime;
    }
  }

  const byAudioResource = new Map<string, ReadAlongSyncPoint[]>();
  for (const point of points) {
    const list = byAudioResource.get(point.audioHref) ?? [];
    list.push(point);
    byAudioResource.set(point.audioHref, list);
  }

  return { points, byAudioResource };
}

export function findActiveSyncPoint(
  index: ReadAlongSyncIndex,
  audioResourceHref: string,
  time: number,
  audioBaseUrl?: string
): ReadAlongSyncPoint | undefined {
  const normalized = normalizeResourceHref(audioResourceHref, audioBaseUrl);

  let trackPoints = index.byAudioResource.get(normalized);
  if (!trackPoints) {
    for (const [key, list] of index.byAudioResource.entries()) {
      if (hrefsMatch(key, normalized, audioBaseUrl, audioBaseUrl)) {
        trackPoints = list;
        break;
      }
    }
  }

  if (!trackPoints?.length) return undefined;

  let active: ReadAlongSyncPoint | undefined;

  const isActive = (point: ReadAlongSyncPoint) =>
    point.startTime <= time && (point.endTime === undefined || time < point.endTime);

  const isBetter = (candidate: ReadAlongSyncPoint, current: ReadAlongSyncPoint) => {
    if (candidate.granularity === "word" && current.granularity !== "word") return true;
    if (candidate.granularity !== "word" && current.granularity === "word") return false;
    return candidate.startTime >= current.startTime;
  };

  for (const point of trackPoints) {
    if (!isActive(point)) continue;
    if (!active || isBetter(point, active)) {
      active = point;
    }
  }

  if (active) return active;

  for (const point of trackPoints) {
    if (point.startTime <= time && (!active || point.startTime >= active.startTime)) {
      active = point;
    }
  }
  return active;
}

export function syncPointToLocator(
  point: ReadAlongSyncPoint,
  epubPublication: Publication
): Locator | undefined {
  const link = epubPublication.linkWithHref(point.text.href)
    ?? epubPublication.readingOrder.items.find((item) =>
      hrefsMatch(item.href, point.text.href, epubPublication.baseURL, epubPublication.baseURL)
    );

  const href = link?.href ?? point.text.href;

  const manifestLocator = link
    ? epubPublication.manifest.locatorFromLink(link)
    : undefined;

  const locations = point.text.fragmentId
    ? new LocatorLocations({ fragments: [point.text.fragmentId] })
    : manifestLocator?.locations ?? new LocatorLocations({});

  if (manifestLocator) {
    return new Locator({
      href: manifestLocator.href,
      type: manifestLocator.type,
      title: manifestLocator.title,
      locations,
    });
  }

  return new Locator({
    href,
    type: "application/xhtml+xml",
    locations,
  });
}

export function matchSyncPoint(
  index: ReadAlongSyncIndex,
  audioResourceHref: string,
  time: number,
  epubPublication: Publication,
  audioBaseUrl?: string
): ReadAlongSyncPointMatch | undefined {
  const point = findActiveSyncPoint(index, audioResourceHref, time, audioBaseUrl);
  if (!point) return undefined;
  const locator = syncPointToLocator(point, epubPublication);
  if (!locator) return undefined;
  return { point, locator };
}

export async function discoverGuidedNavigation(
  epubPublication: Publication,
  audioPublication: Publication,
  explicitUrl?: string
): Promise<GuidedNavigationDocument | null> {
  if (explicitUrl) {
    return fetchGuidedNavigationFromUrl(explicitUrl, epubPublication);
  }

  const fromEpub = await guidedNavigationFromPublication(epubPublication);
  if (fromEpub) return fromEpub;

  return guidedNavigationFromPublication(audioPublication);
}

async function guidedNavigationFromPublication(
  publication: Publication
): Promise<GuidedNavigationDocument | null> {
  const manifestLink = publication.manifest.links.findWithMediaType(GUIDED_NAV_MEDIA_TYPE);
  if (manifestLink) {
    const json = await publication.get(manifestLink).readAsJSON();
    return GuidedNavigationDocument.deserialize(json) ?? null;
  }

  for (const item of publication.readingOrder.items) {
    const guide = await publication.guideForLink(item);
    if (guide) return guide;
  }

  const relLink = publication.linkWithRel("guided-navigation")
    ?? publication.linksWithRel("guided-navigation")[0];
  if (relLink) {
    const json = await publication.get(relLink).readAsJSON();
    return GuidedNavigationDocument.deserialize(json) ?? null;
  }

  return null;
}

async function fetchGuidedNavigationFromUrl(
  url: string,
  publication: Publication
): Promise<GuidedNavigationDocument | null> {
  try {
    const link = new Link({ href: url, type: GUIDED_NAV_MEDIA_TYPE });
    const json = await publication.get(link).readAsJSON();
    return GuidedNavigationDocument.deserialize(json) ?? null;
  } catch (error) {
    console.warn("[readAlong] Failed to load guided navigation from URL:", url, error);
    return null;
  }
}
