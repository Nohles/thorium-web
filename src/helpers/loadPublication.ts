import {
  Feature,
  Fetcher,
  HttpFetcher,
  Layout,
  Link,
  Manifest,
  Profile,
  Publication,
  ReadingProgression,
} from "@readium/shared";
import { getScriptMode } from "@readium/navigator";
import { deserializePositions } from "@/helpers/deserializePositions";
import { buildTocTree } from "@/helpers/buildTocTree";
import type { ReaderProfile } from "@/lib/readerReducer";

export interface LoadedPublication {
  publication: Publication;
  manifest: object;
  selfLink: string;
  localDataKey: string;
  profile: ReaderProfile;
  isRTL: boolean;
  isFXL: boolean;
  hasDisplayTransformability: boolean;
  positionsList: ReturnType<typeof deserializePositions>;
  tocTree: ReturnType<typeof buildTocTree> | null;
}

const detectProfile = (manifest: Manifest): ReaderProfile => {
  const metadata = manifest.metadata;
  if (!metadata) return "webPub";

  const conformsTo = metadata.conformsTo;
  if (!conformsTo) return "webPub";

  const profiles = Array.isArray(conformsTo) ? conformsTo : [conformsTo];

  if (profiles.some((profile: Profile) => profile === Profile.AUDIOBOOK)) {
    return "audio";
  }

  if (profiles.some((profile: Profile) => profile === Profile.EPUB)) {
    return "epub";
  }

  return "webPub";
};

export async function loadPublicationFromUrl(
  url: string,
  fetcher?: Fetcher,
  localDataKeySuffix = "current-location"
): Promise<LoadedPublication> {
  const decodedUrl = decodeURIComponent(url);
  const manifestLink = new Link({ href: decodedUrl });
  const initialFetcher = fetcher ?? new HttpFetcher(undefined);

  const link = await initialFetcher.get(manifestLink).link();
  const selfHref = link.toURL(decodedUrl);
  if (!selfHref) {
    throw new Error("Could not resolve manifest self link");
  }

  const manifestFetcher = fetcher ?? new HttpFetcher(undefined, selfHref);
  const manifestData = await manifestFetcher.get(manifestLink).readAsJSON();
  const manifestObj = Manifest.deserialize(manifestData)!;
  manifestObj.setSelfLink(selfHref);

  const detectedProfile = detectProfile(manifestObj);
  if (detectedProfile !== "epub" && detectedProfile !== "audio") {
    throw new Error(`Unsupported publication profile for read-along: ${detectedProfile}`);
  }

  const publication = new Publication({
    manifest: manifestObj,
    fetcher: manifestFetcher,
  });

  const mode = getScriptMode(publication.metadata);
  const rtl = publication.metadata.effectiveReadingProgression === ReadingProgression.rtl;
  const isFXL = detectedProfile === "epub"
    && publication.metadata.effectiveLayout === Layout.fixed;

  const hasDisplayTransformability = publication.metadata.accessibility?.feature?.some(
    (feature) => feature && feature.value === Feature.DISPLAY_TRANSFORMABILITY.value
  ) || false;

  let positionsList: ReturnType<typeof deserializePositions> = [];
  if (detectedProfile === "epub") {
    try {
      const rawPositions = await publication.positionsFromManifest();
      positionsList = deserializePositions(rawPositions);
    } catch {
      positionsList = [];
    }
  }

  let tocTree: ReturnType<typeof buildTocTree> | null = null;
  if (detectedProfile === "audio") {
    const tocLinks = manifestObj.toc?.items?.length
      ? manifestObj.toc.items
      : manifestObj.readingOrder?.items || [];
    const publicationTitle = manifestObj.metadata.title.getTranslation("en");
    let idCounter = 0;
    tocTree = buildTocTree(
      tocLinks,
      () => `toc-${++idCounter}`,
      undefined,
      publicationTitle
    );
  }

  return {
    publication,
    manifest: manifestData as object,
    selfLink: selfHref,
    localDataKey: `${selfHref}-${localDataKeySuffix}`,
    profile: detectedProfile,
    isRTL: rtl,
    isFXL,
    hasDisplayTransformability,
    positionsList,
    tocTree,
  };
}
