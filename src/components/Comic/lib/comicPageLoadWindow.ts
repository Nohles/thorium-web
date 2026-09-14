type ComicPageIndex = {
  index: number;
};

/** Retain recently viewed pages so an image is not released while it is still on screen. */
export const COMIC_TRAILING_PAGE_BUFFER = 2;

export const getComicPageLoadSet = (
  pages: readonly ComicPageIndex[],
  cursorIndex: number,
  imagePreloadAmount: number,
  loadDirection: 1 | -1,
  trailingPageBuffer = COMIC_TRAILING_PAGE_BUFFER
): Set<number> => {
  if (pages.length === 0) return new Set();

  const cursorPosition = pages.findIndex((page) => page.index === cursorIndex);
  if (cursorPosition < 0) return new Set();

  const selected = new Set<number>([cursorIndex]);
  const preloadAmount = Math.max(0, Math.floor(imagePreloadAmount));
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
