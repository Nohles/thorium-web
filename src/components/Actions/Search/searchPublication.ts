import { Link, Locator, LocatorCollection, Publication } from "@readium/shared";

export const LOCATOR_COLLECTION_MEDIA_TYPE =
  "application/vnd.readium.locators+json";

export interface PublicationSearchPage {
  locators: Locator[];
  nextHref?: string;
  total?: number;
}

const absoluteHref = (href: string, baseUrl?: string) =>
  new Link({ href }).toURL(baseUrl);

export const publicationSearchHref = (
  publication: Publication,
  query: string,
) => {
  const searchLink = publication.linkWithRel("search");
  if (!searchLink) return undefined;
  return searchLink.expandTemplate({ query }).toURL(publication.baseURL);
};

export async function searchPublicationPage({
  publication,
  query,
  nextHref,
  signal,
}: {
  publication: Publication;
  query: string;
  nextHref?: string;
  signal?: AbortSignal;
}): Promise<PublicationSearchPage> {
  const href = nextHref ?? publicationSearchHref(publication, query);
  if (!href) {
    throw new Error("Search is not available for this publication.");
  }

  const response = await fetch(href, {
    signal,
    credentials: "same-origin",
    headers: { Accept: LOCATOR_COLLECTION_MEDIA_TYPE },
  });
  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}.`);
  }

  const collection = LocatorCollection.deserialize(await response.json());
  if (!collection) {
    throw new Error("The publication returned an invalid search response.");
  }

  const nextLink = collection.links.items.find((link) =>
    link.rels?.has("next"),
  );
  return {
    locators: collection.locators,
    total: collection.metadata.numberOfItems,
    nextHref: nextLink
      ? absoluteHref(nextLink.href, href)
      : undefined,
  };
}
