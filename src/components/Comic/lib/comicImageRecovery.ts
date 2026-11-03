/** A page still loading after this long offers "Try again" beside its spinner. */
export const COMIC_IMAGE_RETRY_ACTION_DELAY_MS = 4_000;

/** Automatic retries after an `<img>` error, before the page reports failure. */
export const COMIC_IMAGE_AUTO_RETRY_LIMIT = 3;
const COMIC_IMAGE_AUTO_RETRY_BASE_DELAY_MS = 1_000;

const COMIC_IMAGE_RETRY_QUERY = "comicImageRetry";

/** Backoff before the next automatic retry, or `undefined` once they are used up. */
export const getComicImageAutoRetryDelay = (retriesSoFar: number): number | undefined =>
  retriesSoFar < COMIC_IMAGE_AUTO_RETRY_LIMIT
    ? COMIC_IMAGE_AUTO_RETRY_BASE_DELAY_MS * 2 ** retriesSoFar
    : undefined;

/**
 * URL that makes the browser really issue a new request. Remounting an `<img>` with
 * the same URL attaches to the in-flight image load, so retrying a stalled download
 * would wait on that same stalled request.
 */
export const getComicImageRetryUrl = (url: string, reloadCount: number): string => {
  if (reloadCount <= 0 || !/^https?:/i.test(url)) return url;
  const retryUrl = new URL(url);
  retryUrl.searchParams.set(COMIC_IMAGE_RETRY_QUERY, String(reloadCount));
  return retryUrl.toString();
};
