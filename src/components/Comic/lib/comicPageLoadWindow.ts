type ComicPageIndex = {
  index: number;
};

/** Retain recently viewed pages so an image is not released while it is still on screen. */
export const COMIC_TRAILING_PAGE_BUFFER = 2;

/** Pages ahead of the cursor kept mounted regardless of viewport distance (e.g. after a jump). */
export const COMIC_MOUNT_AHEAD_PAGES = 3;

/** Pages ahead of the cursor downloaded first, before background warmup of the rest. */
export const COMIC_URGENT_WARMUP_PAGES = 3;

/** Upper bound on pages warmed ahead; keeps whole-volume publications from queueing thousands. */
export const COMIC_WARMUP_AHEAD_LIMIT = 150;

/** Pages warmed behind the cursor once everything ahead is queued. */
export const COMIC_WARMUP_BEHIND_LIMIT = 10;

export const getComicPageLoadSet = (
  pages: readonly ComicPageIndex[],
  cursorIndex: number,
  aheadAmount: number,
  loadDirection: 1 | -1,
  trailingPageBuffer = COMIC_TRAILING_PAGE_BUFFER
): Set<number> => {
  if (pages.length === 0) return new Set();

  const cursorPosition = pages.findIndex((page) => page.index === cursorIndex);
  if (cursorPosition < 0) return new Set();

  const selected = new Set<number>([cursorIndex]);
  const preloadAmount = Math.max(0, Math.floor(aheadAmount));
  const trailingAmount = Math.max(0, Math.floor(trailingPageBuffer));

  for (let offset = 1; offset <= preloadAmount; offset += 1) {
    const page = pages[cursorPosition + offset * loadDirection];
    if (page) selected.add(page.index);
  }

  for (let offset = 1; offset <= trailingAmount; offset += 1) {
    const page = pages[cursorPosition - offset * loadDirection];
    if (page) selected.add(page.index);
  }

  return selected;
};

export type ComicWarmupEntry<T extends ComicPageIndex> = {
  page: T;
  urgent: boolean;
};

/**
 * Order in which pages are downloaded: the cursor page and the next few pages in
 * the reading direction first (urgent), then one page behind, then everything
 * ahead in reading order, then the remaining pages behind.
 */
export const getComicPageWarmupOrder = <T extends ComicPageIndex>(
  pages: readonly T[],
  cursorIndex: number,
  loadDirection: 1 | -1,
  {
    urgentAhead = COMIC_URGENT_WARMUP_PAGES,
    aheadLimit = COMIC_WARMUP_AHEAD_LIMIT,
    behindLimit = COMIC_WARMUP_BEHIND_LIMIT,
  }: { urgentAhead?: number; aheadLimit?: number; behindLimit?: number } = {}
): ComicWarmupEntry<T>[] => {
  const cursorPosition = pages.findIndex((page) => page.index === cursorIndex);
  if (cursorPosition < 0) return [];

  const order: ComicWarmupEntry<T>[] = [{ page: pages[cursorPosition], urgent: true }];
  const pageAt = (offset: number) => pages[cursorPosition + offset * loadDirection];

  const urgentCount = Math.min(Math.max(0, Math.floor(urgentAhead)), aheadLimit);
  for (let offset = 1; offset <= urgentCount; offset += 1) {
    const page = pageAt(offset);
    if (page) order.push({ page, urgent: true });
  }

  const behindCount = Math.max(0, Math.floor(behindLimit));
  if (behindCount > 0) {
    const page = pageAt(-1);
    if (page) order.push({ page, urgent: false });
  }

  for (let offset = urgentCount + 1; offset <= aheadLimit; offset += 1) {
    const page = pageAt(offset);
    if (!page) break;
    order.push({ page, urgent: false });
  }

  for (let offset = 2; offset <= behindCount; offset += 1) {
    const page = pageAt(-offset);
    if (!page) break;
    order.push({ page, urgent: false });
  }

  return order;
};
