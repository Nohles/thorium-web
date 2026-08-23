import type {
  BasicTextSelection,
  ContextMenuEvent,
  FrameClickEvent,
} from "@readium/navigator-html-injectables";
import { Locator, LocatorText } from "@readium/shared";

export interface ReaderDecorationStyle {
  type?: string;
  tint?: string;
  layout?: string;
  width?: string;
}

export interface ReaderDecorationInput {
  id: string;
  /** Readium Locator instance or its serialized representation. */
  locator: unknown;
  style?: ReaderDecorationStyle;
  extras?: Record<string, unknown>;
  /** Pointer events that may activate this decoration. Defaults to both. */
  activation?: "tap" | "click" | "both";
  /**
   * Visible text the decoration covers. Used to resolve click activation when
   * the environment renders highlights with the CSS Highlight API.
   */
  text?: string;
}

export interface ReaderTextSelectedEvent {
  text: string;
  /** Readium locator enriched with the selected quote when one is available. */
  locator?: Locator;
  /** Host-document viewport coordinates. */
  rect: { x: number; y: number; width: number; height: number };
  /** Coordinates inside the Readium frame, retained for legacy integrations. */
  frameRect?: { x: number; y: number; width: number; height: number };
  /** URL of the frame the selection lives in. May be a blob: URL. */
  frameSrc: string;
  /**
   * Publication href of the resource the selection lives in, resolved from
   * the navigator's current position. Preferred over frameSrc for anchoring.
   */
  resourceHref?: string;
}

export interface ReaderContextMenuEvent {
  point: { x: number; y: number };
  selection?: ReaderTextSelectedEvent;
}

export interface ReaderDecorationActivatedEvent {
  id: string;
  locator?: Locator;
  extras?: Record<string, unknown>;
  point: { x: number; y: number };
  /** Device-pixel coordinates reported by the Readium frame. */
  framePoint?: { x: number; y: number };
  /** Host-document viewport rect of the activated decoration, when known. */
  rect?: { x: number; y: number; width: number; height: number };
  /** CSS-pixel rect inside the Readium frame, when known. */
  frameRect?: { top: number; left: number; width: number; height: number };
}

export interface ReaderInteractionProps {
  decorations?: readonly ReaderDecorationInput[];
  onTextSelected?: (event: ReaderTextSelectedEvent) => void;
  onContextMenu?: (event: ReaderContextMenuEvent) => void;
  onDecorationActivated?: (event: ReaderDecorationActivatedEvent) => void;
}

interface NavigatorFrameLike {
  source?: string;
  msg?: { send: (key: string, data: unknown, ack?: (ok: boolean) => void) => void };
}

/**
 * A frame that can receive decorations. `href` is the real publication href
 * of the resource shown by the frame when the navigator exposes it (pool
 * key); when unknown, all decorations are sent and text-quote anchoring
 * decides which ones apply.
 */
export interface DecorationFrameTarget {
  href: string | null;
  msg?: NavigatorFrameLike["msg"];
}

export const decorationFrameTargetsFromNavigator = (
  navigator: unknown,
): DecorationFrameTarget[] | null => {
  if (!navigator || typeof navigator !== "object") return null;
  const nav = navigator as {
    pool?: { pool?: Map<unknown, unknown> };
    framePool?: { pool?: Map<unknown, unknown> };
    _cframes?: unknown;
  };
  const pools = [nav.pool?.pool, nav.framePool?.pool];
  for (const pool of pools) {
    if (pool instanceof Map && pool.size > 0) {
      const targets: DecorationFrameTarget[] = [];
      for (const [href, frame] of pool.entries()) {
        const fm = frame as
          | { destroyed?: boolean; isDestroyed?: boolean; msg?: DecorationFrameTarget["msg"] }
          | undefined
          | null;
        if (!fm || fm.destroyed || fm.isDestroyed) continue;
        targets.push({
          href: typeof href === "string" ? href : null,
          msg: fm.msg,
        });
      }
      if (targets.length > 0) return targets;
    }
  }
  const cframes = Array.isArray(nav._cframes) ? nav._cframes : null;
  if (cframes && cframes.length > 0) {
    const targets: DecorationFrameTarget[] = [];
    for (const frame of cframes) {
      if (!frame) continue;
      const fm = frame as NavigatorFrameLike & { isDestroyed?: boolean };
      if (fm.isDestroyed || !fm.msg) continue;
      targets.push({ href: null, msg: fm.msg });
    }
    if (targets.length > 0) return targets;
  }
  return null;
};

const DECORATION_GROUP = "reader-decorations";

const frameElements = (container?: HTMLElement | null): HTMLIFrameElement[] => {
  const root: ParentNode = container ?? document;
  return Array.from(root.querySelectorAll("iframe.readium-navigator-iframe"));
};

const frameWindowFor = (
  container: HTMLElement | null | undefined,
  frameSrc: string,
  navigatorFrames?: readonly unknown[],
): Window | null => {
  for (const frame of frameElements(container)) {
    if (frame.src === frameSrc) return frame.contentWindow;
    try {
      if (frame.contentWindow?.location.href === frameSrc) return frame.contentWindow;
    } catch {
      // cross-origin frame, skip
    }
  }
  const liveFrames = (navigatorFrames ?? []).filter(isInteractionFrame);
  const exactFrame = liveFrames.find((frame) => frame.source === frameSrc);
  if (exactFrame) return exactFrame.window;
  if (liveFrames.length === 1) return liveFrames[0].window;
  return null;
};

interface InteractionFrame {
  source?: string;
  window: Window;
  isDestroyed?: boolean;
}

const isInteractionFrame = (value: unknown): value is InteractionFrame => {
  if (!value || typeof value !== "object") return false;
  const frame = value as { window?: unknown; isDestroyed?: boolean };
  return frame.window instanceof Window && !frame.isDestroyed;
};

const toHostRect = (
  container: HTMLElement | null | undefined,
  frameSrc: string,
  rect: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null => {
  const frame = frameElements(container).find((candidate) => {
    try {
      return candidate.contentWindow?.location.href === frameSrc;
    } catch {
      return false;
    }
  });
  const offset = frame?.getBoundingClientRect();
  if (!offset) return null;
  return {
    x: rect.x + offset.left,
    y: rect.y + offset.top,
    width: rect.width,
    height: rect.height,
  };
};

export function textSelectionToEvent(
  container: HTMLElement | null | undefined,
  selection: BasicTextSelection,
  currentLocatorOrResourceHref?: Locator | string,
): ReaderTextSelectedEvent | null {
  const currentLocator = typeof currentLocatorOrResourceHref === "string"
    ? undefined
    : currentLocatorOrResourceHref;
  const resourceHref = typeof currentLocatorOrResourceHref === "string"
    ? currentLocatorOrResourceHref
    : currentLocator?.href;
  const frameRect = {
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  };
  const rect = toHostRect(container, selection.targetFrameSrc, frameRect) ?? frameRect;
  const sourceLocator =
    (selection as BasicTextSelection & { locator?: Locator }).locator ??
    currentLocator;
  const locator = sourceLocator
    ? new Locator({
        href: sourceLocator.href,
        type: sourceLocator.type,
        title: sourceLocator.title,
        locations: sourceLocator.locations,
        text: new LocatorText({
          before: sourceLocator.text?.before,
          after: sourceLocator.text?.after,
          highlight: selection.text.trim(),
        }),
      })
    : undefined;
  return {
    text: selection.text,
    locator,
    rect,
    frameRect,
    frameSrc: selection.targetFrameSrc,
    resourceHref: locator?.href ?? resourceHref,
  };
}

export function contextMenuToEvent(
  container: HTMLElement | null | undefined,
  event: ContextMenuEvent,
  currentLocatorOrResourceHref?: Locator | string,
): ReaderContextMenuEvent | null {
  const currentLocator = typeof currentLocatorOrResourceHref === "string"
    ? undefined
    : currentLocatorOrResourceHref;
  const resourceHref = typeof currentLocatorOrResourceHref === "string"
    ? currentLocatorOrResourceHref
    : currentLocator?.href;
  const frame = frameElements(container).find((candidate) => {
    try {
      return candidate.contentWindow?.location.href === event.targetFrameSrc;
    } catch {
      return false;
    }
  });
  const offset = frame?.getBoundingClientRect();
  if (!offset) return null;
  let selection: ReaderTextSelectedEvent | undefined;
  if (event.selectedText) {
    const locator = currentLocator
      ? new Locator({
          href: currentLocator.href,
          type: currentLocator.type,
          title: currentLocator.title,
          locations: currentLocator.locations,
          text: new LocatorText({
            before: currentLocator.text?.before,
            after: currentLocator.text?.after,
            highlight: event.selectedText.text.trim(),
          }),
        })
      : undefined;
    selection = {
      text: event.selectedText.text,
      locator,
      rect: {
        x: event.selectedText.x + offset.left,
        y: event.selectedText.y + offset.top,
        width: event.selectedText.width,
        height: event.selectedText.height,
      },
      frameRect: {
        x: event.selectedText.x,
        y: event.selectedText.y,
        width: event.selectedText.width,
        height: event.selectedText.height,
      },
      frameSrc: event.targetFrameSrc,
      resourceHref: locator?.href ?? resourceHref,
    };
  } else {
    const wnd = frame?.contentWindow;
    const word = wnd
      ? wordAtPoint(wnd, event.clientX, event.clientY)
      : null;
    if (word) {
      const locator = currentLocator
        ? new Locator({
            href: currentLocator.href,
            type: currentLocator.type,
            title: currentLocator.title,
            locations: currentLocator.locations,
            text: new LocatorText({
              before: currentLocator.text?.before,
              after: currentLocator.text?.after,
              highlight: word.text,
            }),
          })
        : undefined;
      selection = {
        text: word.text,
        locator,
        rect: {
          x: word.rect.x + offset.left,
          y: word.rect.y + offset.top,
          width: word.rect.width,
          height: word.rect.height,
        },
        frameRect: {
          x: word.rect.x,
          y: word.rect.y,
          width: word.rect.width,
          height: word.rect.height,
        },
        frameSrc: event.targetFrameSrc,
        resourceHref: locator?.href ?? resourceHref,
      };
    }
  }
  return {
    point: { x: event.clientX + offset.left, y: event.clientY + offset.top },
    selection,
  };
}

const isWordCharacter = (value: string | undefined) =>
  value ? /[\p{L}\p{N}\p{M}]/u.test(value) : false;

const wordAtPoint = (
  wnd: Window,
  x: number,
  y: number,
): { text: string; rect: DOMRect } | null => {
  const caret = caretRangeAt(wnd, x, y);
  if (!caret || !caret.startContainer || caret.startContainer.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const node = caret.startContainer as Text;
  const text = node.data ?? "";
  let start = Math.min(caret.startOffset, text.length);
  let end = start;
  while (start > 0 && isWordCharacter(text[start - 1])) start -= 1;
  while (end < text.length && isWordCharacter(text[end])) end += 1;
  if (start === end) return null;
  const range = wnd.document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return { text: text.slice(start, end), rect: range.getBoundingClientRect() };
};

const caretRangeAt = (wnd: Window, x: number, y: number): Range | null => {
  const doc = wnd.document;
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) {
      const range = doc.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }
  if (typeof doc.caretRangeFromPoint === "function") {
    return doc.caretRangeFromPoint(x, y);
  }
  return null;
};

const blockAncestor = (node: Node): Element | null => {
  let current: Node | null = node;
  while (current && current.nodeType === Node.TEXT_NODE) {
    current = current.parentNode;
  }
  let element = current as Element | null;
  while (element) {
    const display = element.ownerDocument.defaultView?.getComputedStyle(element).display;
    if (display && (display === "block" || display === "list-item" || display.includes("flex") || display.includes("grid"))) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
};

const caretOffsetInRange = (doc: Document, caret: Range, element: Element): number | null => {
  const leading = doc.createRange();
  leading.selectNodeContents(element);
  try {
    leading.setEnd(caret.startContainer, caret.startOffset);
  } catch {
    return null;
  }
  return leading.toString().length;
};

const decodeUrlValue = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizedHref = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0) return null;
  return decodeUrlValue(value)
    .split("#")[0]
    .split("?")[0]
    .replace(/^\.\//, "")
    .replace(/^\//, "");
};

const hrefsRelated = (a: unknown, b?: string | null): boolean => {
  if (!b) return false;
  const left = normalizedHref(a);
  const right = normalizedHref(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
};

/** Legacy mentions may carry session-scoped blob: URLs as their locator href. */
const isBlobHref = (locator: unknown): boolean => {
  const href = (locator as { href?: unknown } | null | undefined)?.href;
  return typeof href === "string" && href.startsWith("blob:");
};

/**
 * Whether a decoration belongs in the resource with the given publication
 * href. Decorations with unresolvable (blob) hrefs match every resource —
 * text-quote anchoring simply fails in documents that don't contain them.
 */
const decorationMatchesHref = (locator: unknown, resourceHref: string): boolean => {
  if (isBlobHref(locator)) return true;
  return hrefsRelated((locator as { href?: unknown } | null)?.href, resourceHref);
};

export function resolveDecorationActivation(
  event: FrameClickEvent,
  container: HTMLElement | null | undefined,
  decorations: readonly ReaderDecorationInput[],
  navigatorFrames?: readonly unknown[],
  trigger?: "tap" | "click",
): ReaderDecorationActivatedEvent | null {
  if (decorations.length === 0) return null;
  const wnd = frameWindowFor(container, event.targetFrameSrc, navigatorFrames);
  if (!wnd) return null;
  const dpr = wnd.devicePixelRatio || window.devicePixelRatio || 1;
  const frameX = event.x / dpr;
  const frameY = event.y / dpr;
  const clickPoint = { x: event.x, y: event.y };

  const doc = wnd.document;
  // Frame sources can be session-scoped blob: URLs that never match stored
  // locator hrefs, so candidate selection relies on the block-scoped quote
  // matching below rather than href filtering.
  const candidates = trigger
    ? decorations.filter((decoration) =>
        !decoration.activation ||
        decoration.activation === "both" ||
        decoration.activation === trigger,
      )
    : decorations;
  if (candidates.length === 0) return null;

  let caret: Range | null = caretRangeAt(wnd, frameX, frameY);
  if (!caret || !caret.startContainer) return null;

  const block = blockAncestor(caret.startContainer);
  if (!block) return null;
  const blockText = block.textContent ?? "";
  const caretOffset = caretOffsetInRange(doc, caret, block);
  if (caretOffset === null) return null;

  const toHostRect = frameToHostRect(container, wnd);
  const frameOffset = frameOffsetForWindow(container, wnd);
  const toActivation = (
    decoration: ReaderDecorationInput,
    point: HostRect,
    rect?: HostRect,
  ): ReaderDecorationActivatedEvent => ({
    id: decoration.id,
    locator: locatorFromUnknown(decoration.locator),
    extras: decoration.extras,
    point: { x: point.x, y: point.y },
    framePoint: clickPoint,
    rect,
    frameRect: rect
      ? {
          top: rect.y - (frameOffset?.top ?? 0),
          left: rect.x - (frameOffset?.left ?? 0),
          width: rect.width,
          height: rect.height,
        }
      : undefined,
  });

  let best: { decoration: ReaderDecorationInput; start: number; end: number; distance: number } | null = null;
  for (const decoration of candidates) {
    const quote =
      decoration.text ??
      ((decoration.locator as { text?: { highlight?: string } } | null)?.text?.highlight ?? "");
    const locatorText = (decoration.locator as {
      text?: { before?: string; after?: string };
    } | null)?.text;
    if (!quote) continue;
    let searchFrom = 0;
    while (true) {
      const start = blockText.indexOf(quote, searchFrom);
      if (start === -1) break;
      const end = start + quote.length;
      const hasBefore =
        !locatorText?.before ||
        blockText.slice(Math.max(0, start - locatorText.before.length), start).endsWith(locatorText.before);
      const hasAfter =
        !locatorText?.after ||
        blockText.slice(end, end + locatorText.after.length).startsWith(locatorText.after);
      if (!hasBefore || !hasAfter) {
        searchFrom = start + 1;
        continue;
      }
      const distance = caretOffset < start ? start - caretOffset : caretOffset > end ? caretOffset - end : 0;
      if (distance === 0) {
        const point = toHostRect(frameX, frameY);
        return toActivation(
          decoration,
          point,
          quoteHostRect(toHostRect, point, block, start, end, caret),
        );
      }
      if (!best || distance < best.distance) {
        best = { decoration, start, end, distance };
      }
      searchFrom = start + 1;
    }
  }

  const tolerance = Math.max(24, quoteTolerance(candidates));
  if (best && best.distance <= tolerance) {
    const point = toHostRect(frameX, frameY);
    return toActivation(
      best.decoration,
      point,
      quoteHostRect(toHostRect, point, block, best.start, best.end, caret),
    );
  }

  const clickedElement = doc.elementFromPoint(frameX, frameY);
  const highlighted = clickedElement?.closest("[data-highlight-id]");
  const highlightedId = highlighted?.getAttribute("data-highlight-id");
  const highlightedDecoration = candidates.find((decoration) => decoration.id === highlightedId);
  if (highlightedDecoration) {
    const point = toHostRect(frameX, frameY);
    return toActivation(
      highlightedDecoration,
      point,
      elementHostRect(toHostRect, point, clickedElement),
    );
  }
  return null;
};

type HostRect = { x: number; y: number; width: number; height: number };

/**
 * Maps frame-document coordinates to host-document viewport coordinates.
 * Frame click positions arrive scaled by the frame's device pixel ratio while
 * the host reports CSS pixels, so the frame's own bounding box is the source
 * of truth for both translation and scale.
 */
const frameToHostRect =
  (
    container: HTMLElement | null | undefined,
    wnd: Window,
  ): ((x: number, y: number) => HostRect) => {
    const offset = frameOffsetForWindow(container, wnd);
    return (x, y) => ({
      x: x + (offset?.left ?? 0),
      y: y + (offset?.top ?? 0),
      width: 0,
      height: 0,
    });
  };

const frameOffsetForWindow = (
  container: HTMLElement | null | undefined,
  wnd: Window,
): DOMRect | null => {
  try {
    const frame = Array.from(
      document.querySelectorAll<HTMLIFrameElement>("iframe.readium-navigator-iframe"),
    ).find((candidate) => candidate.contentWindow?.window === wnd);
    if (frame) return frame.getBoundingClientRect();
  } catch {
    // fall through to the reader container
  }
  return container?.getBoundingClientRect() ?? null;
};

const locatorFromUnknown = (value: unknown): Locator | undefined => {
  if (value instanceof Locator) return value;
  if (!value || typeof value !== "object") return undefined;
  return Locator.deserialize(value);
};

/**
 * Builds a host-coordinate rect for the matched quote inside `block`. The
 * block's text content maps linearly to its descendant text nodes, so the
 * quote's [start, end) offsets are walked to a DOM range spanning exactly the
 * highlighted passage. Falls back to the caret range, then the click point.
 */
const quoteHostRect = (
  toHostRect: (x: number, y: number) => HostRect,
  fallback: HostRect,
  block: Element,
  start: number,
  end: number,
  caretRange: Range,
): HostRect => {
  const doc = block.ownerDocument;
  if (!doc) return fallback;
  try {
    const range = doc.createRange();
    let offset = 0;
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const length = (node.textContent ?? "").length;
      if (
        offset + length >= start &&
        offset < end &&
        range.startContainer.nodeType !== Node.TEXT_NODE
      ) {
        range.setStart(node, Math.max(0, start - offset));
      }
      if (
        offset + length >= end &&
        range.endContainer.nodeType !== Node.TEXT_NODE
      ) {
        range.setEnd(node, end - offset);
      }
      offset += length;
      node = walker.nextNode();
    }
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 || rect.height > 0,
    );
    if (rects.length > 0) return unionHostRect(rects, toHostRect);
  } catch {
    // fall through
  }
  return rangeHostRect(toHostRect, fallback, caretRange);
};

const rangeHostRect = (
  toHostRect: (x: number, y: number) => HostRect,
  fallback: HostRect,
  range: Range,
): HostRect => {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  if (rects.length > 0) return unionHostRect(rects, toHostRect);
  try {
    const contents = range.startContainer.ownerDocument?.createRange();
    if (contents && range.startContainer) {
      contents.selectNodeContents(range.startContainer);
      const innerRects = Array.from(contents.getClientRects());
      if (innerRects.length > 0) return unionHostRect(innerRects, toHostRect);
    }
  } catch {
    // fall through
  }
  return fallback;
};

const elementHostRect = (
  toHostRect: (x: number, y: number) => HostRect,
  fallback: HostRect,
  element: Element | null,
): HostRect => {
  const rects = element ? Array.from(element.getClientRects()) : [];
  if (rects.length === 0) return fallback;
  return unionHostRect(rects, toHostRect);
};

const unionHostRect = (
  rects: DOMRect[],
  toHostRect: (x: number, y: number) => HostRect,
): HostRect => {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    const origin = toHostRect(rect.left, rect.top);
    left = Math.min(left, origin.x);
    top = Math.min(top, origin.y);
    right = Math.max(right, origin.x + rect.width);
    bottom = Math.max(bottom, origin.y + rect.height);
  }
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
};

const quoteTolerance = (decorations: readonly ReaderDecorationInput[]): number => {
  const longest = decorations.reduce((max, decoration) => {
    const quote =
      decoration.text ??
      ((decoration.locator as { text?: { highlight?: string } } | null)?.text?.highlight ?? "");
    return Math.max(max, quote.length);
  }, 0);
  return Math.min(48, longest);
};

/**
 * Pushes decorations into every live frame and waits for the frame-side
 * Decorator module to acknowledge each request. Returns true only when every
 * request was acked — callers can retry otherwise, since early messages can
 * be lost while a frame's comms channel is still coming up.
 */
export function pushDecorationsToFrames(
  navigator: unknown,
  decorations: readonly ReaderDecorationInput[],
): Promise<boolean> {
  const targets = decorationFrameTargetsFromNavigator(navigator);
  if (!targets || targets.length === 0) return Promise.resolve(false);
  const payload = decorations.map((decoration) => {
    const resolvedLocator = locatorFromUnknown(decoration.locator);
    const serializedLocator = resolvedLocator?.serialize();
    const sourceLocator =
      typeof serializedLocator === "object" && serializedLocator !== null
        ? (serializedLocator as Record<string, unknown>)
        : typeof decoration.locator === "object" && decoration.locator !== null
          ? (decoration.locator as Record<string, unknown>)
          : {};
    return {
      group: DECORATION_GROUP,
      action: "add" as const,
      decoration: {
        id: decoration.id,
        // Locator.deserialize requires href and type; older mentions may be
        // missing type, so default it rather than dropping the decoration.
        locator: {
          ...sourceLocator,
          type: sourceLocator.type ?? "application/xhtml+xml",
        },
        extras: decoration.extras,
        style: {
          type: decoration.style?.type,
          tint: decoration.style?.tint ?? "rgba(44, 157, 124, 0.32)",
          layout: decoration.style?.layout ?? "boxes",
          width: decoration.style?.width ?? "wrap",
        },
      },
    };
  });

  type Acked = { ok: boolean };
  const acked: Acked[] = [];
  const track = (ack?: (ok: boolean) => void) => {
    const record: Acked = { ok: false };
    acked.push(record);
    return (ok: boolean) => {
      record.ok = ok;
      ack?.(ok);
    };
  };

  for (const target of targets) {
    if (!target.msg) continue;
    const matching =
      target.href === null
        ? payload
        : payload.filter((item) =>
            decorationMatchesHref(
              (item.decoration as { locator: unknown }).locator,
              target.href as string,
            ),
          );
    target.msg.send(
      "decorate",
      { group: DECORATION_GROUP, action: "clear", decoration: undefined },
      track(),
    );
    for (const item of matching) {
      target.msg.send("decorate", item, track());
    }
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (acked.length > 0 && acked.every((a) => a.ok)) {
        resolve(true);
      } else if (Date.now() - started > 2000) {
        resolve(false);
      } else {
        setTimeout(check, 120);
      }
    };
    check();
  });
}
