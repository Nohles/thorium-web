# Comic Reader Functions and Settings

This document describes the current Thorium Web comic reader behavior. It is intended as an implementation reference for bringing the `react-native-readium` comic reader in line with this reader.

The comic reader is implemented by `StatefulComicReader`. It reads image resources from the publication reading order, manages a page cursor, persists the current page, renders one of several comic layouts, and exposes a lightweight visual navigator compatible with the shared reader UI.

## Reader Model

The reader builds its page list from non-templated `readingOrder` links whose media type starts with `image/`. Each page has a zero-based `index`, `href`, `Link`, and display title.

For comic archive series manifests, the reader loads chapter manifests on demand, flattens their images into a single global page list, and preloads adjacent chapter manifests around the current chapter.

The reader stores settings per `activeKey`, using `localDataKey` when available or a publication-derived fallback. The current reading position is persisted separately in `comicPosition` and, when a Readium locator can be created, through the supplied `positionStorage`.

## Defaults

| Setting | Default |
| --- | --- |
| `readingMode` | `default` |
| `pageGapPx` | `5` |
| `direction` | `ltr` |
| `tapZones` | `default` |
| `scaleType` | `originalSize` |
| `overlayMode` | `auto` |
| `showPageNumber` | `true` |
| `staticNavigation` | `false` |
| `progressBarType` | `standard` |
| `progressBarSizePx` | `4` |
| `progressBarPosition` | `auto` |
| `stretchSmallPages` | `false` |
| `widthLimitEnabled` | `false` |
| `widthLimitPercent` | `50` |
| `scrollAmountPercent` | `95` |
| `autoScrollEnabled` | `false` |
| `autoScrollSpeedSeconds` | `5` |
| `autoScrollSmooth` | `true` |
| `readingModePreview` | `true` |
| `tapZonePreview` | `false` |
| `imagePreloadAmount` | `5` |
| `comicChapterBoundaries` | `true` |

Legacy `scaleType: "default"` is normalized to `originalSize`. Existing settings are normalized when loaded. During normalization, `comicChapterBoundaries` is forced to `true`.

## Default Settings Panel

The default comic settings order is:

1. Theme
2. Progress bar type
3. Progress bar position
4. Reading mode
5. Reading mode preview
6. Page gap
7. Reading direction
8. Tap zones
9. Tap zone preview
10. Scale type
11. Stretch small pages
12. Limit page width
13. Width limit
14. Scroll amount
15. Image preload amount

Some settings exist in state and have UI components, but are not included in the default comic settings order. Those are called out in the settings inventory below.

`Theme` is also part of the default comic settings panel. It is a shared reader preference, not a `ComicSettings` field. The comic viewport consumes the active theme through CSS variables such as `--th-theme-background` and `--th-theme-text`, so theme changes affect the reader background, text, overlays, controls, placeholders, and error surfaces.

## Reading Modes

`default`

`default` resolves to `singlePage` at runtime. It is stored as a separate setting value, but layout and navigation use the effective mode `singlePage`.

`singlePage`

Shows one page at a time in a viewport-bound flex layout. Navigation step is 1 page. The current page image is always loaded. Page transitions update the cursor directly.

`doublePage`

Shows a two-page spread and uses a navigation step of 2 pages.

In left-to-right mode, the spread is `[current, next]`. In right-to-left mode, the spread is `[current, previous]`. This means the second visible page changes side based on reading direction.

When `scaleType` is `originalSize`, the double-page container uses an auto-overflow layout with `min-width: fit-content`, so oversized original images can scroll rather than being squeezed into the viewport. For other scale types, the spread uses a two-column grid with equal columns.

`continuousVertical`

Shows all pages in a vertically scrollable column. The active page is the page containing the viewport center line; if the center is in a gap, the closest page midpoint is used. Programmatic page changes scroll the target page into the center of the viewport.

`continuousHorizontal`

Shows all pages in a horizontally scrollable row. The active page is the page containing the viewport center line on the x-axis; if the center is in a gap, the closest page midpoint is used. Programmatic page changes scroll the target page into the center of the viewport.

`webtoon`

Currently uses the same layout path as `continuousVertical`: a vertically scrollable column, hidden scrollbar, vertical panning, and center-line active page detection. The separate mode value exists so callers can distinguish webtoon intent even though the current rendering behavior matches vertical continuous scrolling.

## Navigation

The comic reader cursor is a global zero-based page index.

For single-page and continuous modes, previous and next move by 1 page. For double-page mode, previous and next move by 2 pages.

The overlay arrow buttons are mapped through reading direction:

| Direction | Left arrow | Right arrow |
| --- | --- | --- |
| `ltr` | Previous page/spread | Next page/spread |
| `rtl` | Next page/spread | Previous page/spread |

Keyboard shortcuts:

| Key | Behavior |
| --- | --- |
| `ArrowLeft`, `A` | Previous in `ltr`, next in `rtl` |
| `ArrowRight`, `D` | Next in `ltr`, previous in `rtl` |
| `M` | Toggle the reader menu/immersive state |
| `I` | Cycle scale type: `fitWidth`, `fitHeight`, `fitScreen`, `originalSize` |
| `R` | Cycle reading mode: `singlePage`, `doublePage`, `continuousVertical`, `continuousHorizontal`, `webtoon` |
| `T` | Toggle reading direction between `ltr` and `rtl` |
| Space | Toggle `autoScrollEnabled` in settings |

Keyboard shortcuts are ignored when focus is in an input, textarea, contenteditable element, or when meta/control/alt is pressed.

The shared visual navigator supports `go`, `goLink`, `goForward`, `goBackward`, `currentLocator`, `previousLocator`, and `nextLocator`. It maps links and locators to the current comic page list by normalized href, ignoring fragments and query strings.

## Chapter Boundaries

`comicChapterBoundaries` is intended to keep navigation within manifest TOC chapters when a publication has multiple chapter segments.

For normal image-only comic manifests, chapter segments are built from TOC links that match reading-order image hrefs. If the first TOC match is not page 0, a first segment is inserted starting at page 0. A publication needs at least two segments for chapter-boundary behavior to activate.

For comic archive series, segments are built from loaded chapter manifests.

When chapter-boundary mode is active:

- The viewport page list is sliced to the active chapter segment.
- The TOC switches from page entries to chapter entries.
- Progress labels and counts are relative to the active chapter.
- In paginated modes, next/previous can move to adjacent chapter boundaries.
- In scroll modes, reaching a boundary shows a full-page boundary screen. The first next/previous action scrolls to that boundary screen; the second action moves into the adjacent chapter.

The overlay contains support for next/previous chapter call-to-action buttons, but those flags are currently hard-coded to `false`, so the CTA buttons do not appear.

## Progress Bar

The progress bar is rendered by `ComicReaderProgressNavigator` when `progressBarType` is `standard`.

It has two visual states:

- Compact rail: a small rail of page/spread indicators.
- Expanded rail: a clickable rail with start/end labels and individual buttons for pages or spreads.

The progress bar is present even when the main overlay is hidden, unless the progress bar type is `hidden`. It is not controlled by `overlayMode`.

Progress bar items are built from the current viewport pages:

- In single-page and continuous modes, each page is one progress item.
- In double-page mode, pages are grouped into spreads of up to 2 pages.
- The current item uses `aria-current="page"`.
- Completed state is based on whether the item is at or before the current cursor.
- Loaded state is based on image load tracking.
- Clicking a page or spread target sets the cursor to that item target.

In `rtl` double-page mode, spread labels reverse their display order and spread targets use the last page index in the spread.

`progressBarPosition`

| Value | Behavior |
| --- | --- |
| `auto` | Uses `right` for `continuousVertical` and `webtoon`; uses `bottom` for all other modes |
| `bottom` | Places the rail along the bottom |
| `left` | Places the rail along the left side |
| `right` | Places the rail along the right side |

When the reader layout UI is layered and the overlay is visible, the progress rail is inset away from the header/footer controls.

`progressBarType`

| Value | Behavior |
| --- | --- |
| `standard` | Shows the progress navigator |
| `hidden` | Hides the progress navigator |

`progressBarSizePx`

This setting is stored with default `4`, but the current progress navigator does not read it. The overlay uses a fixed 40 px rail area.

## Image Scale Type

All scale types use `object-fit: contain`.

`fitWidth`

The image width is `100%`, height is automatic, and max width is `100%`. In non-scroll viewport-bound layouts, max height is capped to `100%`.

`fitHeight`

The image uses automatic width and height, max width `100%`, and height capping. In vertical scroll stacks, max height is `100dvh`.

`fitScreen`

The image uses automatic width and height, max width `100%`, and max height capping in viewport-bound layouts. This is the closest option to "contain within the viewport".

`originalSize`

The image uses automatic width and height, max width `100%`, and viewport height capping outside vertical scroll stacks. Small-page stretching is disabled for this scale type.

## Page Width Limit

`widthLimitEnabled` and `widthLimitPercent` only apply when `scaleType` is `fitWidth` or `fitScreen`.

`widthLimitPercent` is clamped to 10-100. When enabled:

- Single-page cells use `widthLimitPercent` percent of the reader content width.
- Double-page cells use half of `widthLimitPercent`, so the whole spread fits within the selected width.

When disabled, single-page cells use 100 percent width and double-page cells use 50 percent each.

The width-limit slider is visible only for `fitWidth` and `fitScreen`, and it is disabled until `widthLimitEnabled` is true.

## Stretch Small Pages

`stretchSmallPages` is only available when `scaleType` is not `originalSize`.

When enabled, an image can stretch to the page frame width if its natural width is smaller than the frame width. This stretch check is not applied for width-driven scale modes (`fitWidth` and `fitScreen`) because those modes already drive width.

## Page Gap

`pageGapPx` controls the CSS gap between pages or spread cells. The default settings control exposes a slider from 0 to 80 px, step 1. The viewport also applies 8 px padding around the page area.

## Reading Direction

`direction` can be `ltr` or `rtl`.

It changes:

- Which side/arrow/tap zone means next or previous.
- Double-page spread composition.
- Double-page progress label order and spread jump target.

It does not reverse the underlying page list. The cursor index still increases through the publication reading order.

## Tap Zones

Tap zones are resolved from normalized pointer coordinates: `x` and `y` range from 0 to 1 within the reader container.

If a tap resolves to `toggle`, it toggles the overlay only when `overlayMode` is `auto`. In pinned overlay mode, toggle taps do nothing. If a tap resolves to `next` or `prev`, it triggers page navigation.

`default`

Equivalent to `rightAndLeft` at runtime.

`rightAndLeft`

The left third navigates to the logical previous side; the right third navigates to the logical next side; the middle third toggles the overlay in auto mode.

`kindle`

Currently identical to `rightAndLeft`.

`edge`

The left 20 percent navigates to the logical previous side; the right 20 percent navigates to the logical next side; the center 60 percent toggles the overlay in auto mode.

`lShape`

The left 20 percent is previous and the right 20 percent is next. In the bottom quarter of the screen, the bottom-left half is previous and the bottom-right half is next. The remaining center area toggles the overlay in auto mode.

`disabled`

All taps resolve to `toggle`. In auto overlay mode this toggles the overlay; in pinned overlay mode it has no visible effect.

In `rtl`, left/right navigation actions are swapped: left means next and right means previous.

`tapZonePreview`

When enabled, the reader draws a 12 by 12 transparent grid over the content. Each cell is colored by the action it would trigger: previous, next, or toggle. The overlay is pointer-events none and is for visualization only.

## Overlay Mode

`auto`

The reader can enter immersive mode. The header/footer overlay is visible when the reader is not immersive. Tap-zone `toggle` actions and the `M` key toggle immersive mode.

`pinned`

The header/footer overlay is always visible. Tap-zone `toggle` actions do not toggle the overlay.

The overlay mode setting exists as a component but is not in the default comic settings order.

## Image Loading and Preloading

The reader reads comic images through `publication.get(link).read()` unless the link href is an HTTP or HTTPS URL, in which case the href is used directly as the image URL.

Publication image blobs are cached in a `WeakMap` by publication and href. Reads are queued with a maximum of 4 concurrent image reads. Failed reads are removed from the cache so retry can attempt a fresh read.

Each image reports one of four load states: `idle`, `loading`, `loaded`, or `error`. The progress navigator uses these states to mark loaded progress items.

`imagePreloadAmount`

In continuous vertical, continuous horizontal, and webtoon modes, a page image is loaded when `abs(page.index - cursorIndex) <= imagePreloadAmount`. The default value is 5. The settings control allows 0-10, step 1.

In single-page and double-page modes, visible pages are always loaded.

On image load failure, the reader renders an alert with a retry button.

## Settings Inventory

| Setting | Values or range | Default | Default UI | Runtime effect |
| --- | --- | --- | --- | --- |
| Theme | Shared reader theme preference | Shared preference default | Yes | Applies reader theme CSS variables used by comic viewport and chrome |
| `readingMode` | `default`, `singlePage`, `doublePage`, `continuousVertical`, `continuousHorizontal`, `webtoon` | `default` | Yes | Controls layout and navigation step |
| `pageGapPx` | 0-80 in UI | `5` | Yes | Controls CSS gap between rendered page cells |
| `direction` | `ltr`, `rtl` | `ltr` | Yes | Swaps next/previous side behavior and double-page ordering |
| `tapZones` | `default`, `edge`, `kindle`, `lShape`, `rightAndLeft`, `disabled` | `default` | Yes | Controls tap navigation/toggle regions |
| `scaleType` | `fitWidth`, `fitHeight`, `fitScreen`, `originalSize` | `originalSize` | Yes | Controls image sizing styles |
| `overlayMode` | `auto`, `pinned` | `auto` | Component exists, not default order | Controls whether overlay can be toggled or is always shown |
| `showPageNumber` | boolean | `true` | Component exists, not default order | Stored only; no current comic runtime use found |
| `staticNavigation` | boolean | `false` | Component exists, not default order | Stored only; no current comic runtime use found |
| `progressBarType` | `hidden`, `standard` | `standard` | Yes | Shows or hides progress navigator |
| `progressBarSizePx` | number | `4` | Key exists, not registered in default plugin | Stored only; current rail area is fixed |
| `progressBarPosition` | `auto`, `bottom`, `left`, `right` | `auto` | Yes | Controls progress navigator placement |
| `stretchSmallPages` | boolean | `false` | Yes, conditional | Can upscale naturally small images when scale allows |
| `widthLimitEnabled` | boolean | `false` | Yes, conditional | Enables width limiting for `fitWidth`/`fitScreen` |
| `widthLimitPercent` | 10-100 in UI | `50` | Yes, conditional | Sets content width when width limit applies |
| `scrollAmountPercent` | 10-100, step 5 in UI | `95` | Yes | Stored only; no current comic runtime use found |
| `autoScrollEnabled` | boolean | `false` | Component exists, not default order | Stored/toggled by Space; no current scrolling loop found |
| `autoScrollSpeedSeconds` | 1-20, step 1 in UI | `5` | Component exists, not default order | Stored only; no current scrolling loop found |
| `autoScrollSmooth` | boolean | `true` | Component exists, not default order | Stored only; no current scrolling loop found |
| `readingModePreview` | boolean | `true` | Yes | Stored only; no current comic runtime use found |
| `tapZonePreview` | boolean | `false` | Yes | Draws tap-zone visualization overlay |
| `imagePreloadAmount` | 0-10, step 1 in UI | `5` | Yes | Controls continuous-mode image preload window |
| `comicChapterBoundaries` | boolean | `true` | Component exists, not default order | Keeps navigation and progress scoped to TOC/chapter segments when available |

## Implementation Notes for React Native Alignment

- Keep page indices global and zero-based internally, but display page numbers as one-based.
- Treat `default` reading mode as `singlePage` for behavior.
- Preserve `rtl` as navigation-side inversion, not as a reversal of the underlying page array.
- Match double-page stepping by 2 and spread composition by direction.
- Make progress per chapter when chapter boundaries are active; otherwise use the full page list.
- In continuous modes, update the active page from the viewport center, not only from explicit navigation commands.
- If a setting is implemented in React Native even though it is stored-only here, consider documenting it as an intentional extension so behavior differences are visible.
