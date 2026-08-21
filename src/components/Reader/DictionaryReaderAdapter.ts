import { Locator, LocatorText } from "@readium/shared";
import type {
  BasicTextSelection,
  FrameClickEvent,
} from "@readium/navigator-html-injectables";

export const DICTIONARY_DECORATION_GROUP = "reader-dictionary";

export type ReaderTextSelection = {
  selectedText: string;
  locator: Locator;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    targetFrameSrc: string;
  };
};

export type ReaderDecoration = {
  id: string;
  locator: Locator;
  style: {
    type?: string;
    tint?: string;
    layout?: string;
    width?: string;
  };
  extras?: Record<string, unknown>;
};

export type ReaderDecorationActivation = {
  id: string;
  locator: Locator;
  point: { x: number; y: number };
  rect: { top: number; left: number; width: number; height: number };
};

export type DictionaryReaderCallbacks = {
  decorations?: readonly ReaderDecoration[];
  onTextSelected?: (selection: ReaderTextSelection) => void;
  onDecorationActivated?: (activation: ReaderDecorationActivation) => void;
};

type DictionaryFrame = {
  source?: string;
  window: Window;
  msg?: {
    send: (key: string, data: unknown) => void;
  };
};

function isDictionaryFrame(value: unknown): value is DictionaryFrame {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { window?: unknown; msg?: unknown };
  return Boolean(candidate.window && candidate.msg);
}

function comparableHref(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    return decodeURIComponent(url.pathname.replace(/\/$/u, ""));
  } catch {
    return decodeURIComponent(value.split("#", 1)[0].replace(/\/$/u, ""));
  }
}

function isOpaqueFrameHref(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "blob:" || url.protocol === "about:";
  } catch {
    return false;
  }
}

function frameMatchesHref(frame: DictionaryFrame, href: string) {
  // Readium serves local publication frames from blob URLs. Those URLs identify
  // the frame instance, not the publication resource represented by a Locator.
  if (isOpaqueFrameHref(frame.source)) return true;
  const frameHref = comparableHref(frame.source);
  const decorationHref = comparableHref(href);
  if (!frameHref || !decorationHref) return true;
  return (
    frameHref === decorationHref ||
    frameHref.endsWith(`/${decorationHref.replace(/^\//u, "")}`) ||
    decorationHref.endsWith(`/${frameHref.replace(/^\//u, "")}`)
  );
}

function serializedLocator(locator: Locator) {
  return typeof locator.serialize === "function" ? locator.serialize() : locator;
}

export function applyDictionaryDecorations(
  frames: readonly unknown[] | undefined,
  decorations: readonly ReaderDecoration[],
) {
  const availableFrames = (frames ?? []).filter(isDictionaryFrame);
  if (availableFrames.length === 0) return;

  for (const frame of availableFrames) {
    const matchingDecorations = decorations.filter((decoration) =>
      frameMatchesHref(frame, decoration.locator.href),
    );
    const decorationsForFrame = matchingDecorations.length > 0
      ? matchingDecorations
      : availableFrames.length === 1
        ? decorations
        : [];
    frame.msg?.send("decorate", {
      group: DICTIONARY_DECORATION_GROUP,
      action: "clear",
    });
    for (const decoration of decorationsForFrame) {
      frame.msg?.send("decorate", {
        group: DICTIONARY_DECORATION_GROUP,
        action: "add",
        decoration: {
          ...decoration,
          locator: serializedLocator(decoration.locator),
        },
      });
    }
  }
}

export function selectionFromReadium(
  selection: BasicTextSelection,
  currentLocator: Locator | undefined,
): ReaderTextSelection | null {
  const selectedText = selection.text.trim();
  const sourceLocator =
    (selection as BasicTextSelection & { locator?: Locator }).locator ??
    currentLocator;
  if (!selectedText || !sourceLocator) return null;

  const locator = new Locator({
    href: sourceLocator.href,
    type: sourceLocator.type,
    title: sourceLocator.title,
    locations: sourceLocator.locations,
    text: new LocatorText({
      before: sourceLocator.text?.before,
      after: sourceLocator.text?.after,
      highlight: selectedText,
    }),
  });
  return {
    selectedText,
    locator,
    rect: {
      x: selection.x,
      y: selection.y,
      width: selection.width,
      height: selection.height,
      targetFrameSrc: selection.targetFrameSrc,
    },
  };
}

function pointInRect(
  point: { x: number; y: number },
  rect: DOMRect,
) {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function textQuoteRange(document: Document, locator: Locator) {
  const highlight = locator.text?.highlight;
  if (!highlight) return null;
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];
  let fullText = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue) {
      nodes.push(node as Text);
      fullText += node.nodeValue;
    }
  }

  let start = fullText.indexOf(highlight);
  while (start >= 0) {
    const before = locator.text?.before;
    const after = locator.text?.after;
    const hasBefore = !before || fullText.slice(Math.max(0, start - before.length), start).endsWith(before);
    const end = start + highlight.length;
    const hasAfter = !after || fullText.slice(end, end + after.length).startsWith(after);
    if (hasBefore && hasAfter) break;
    start = fullText.indexOf(highlight, start + 1);
  }
  if (start < 0) return null;
  const matchEnd = start + highlight.length;

  let offset = 0;
  let startNode: Text | undefined;
  let endNode: Text | undefined;
  let startOffset = 0;
  let endOffset = 0;
  for (const textNode of nodes) {
    const length = textNode.nodeValue?.length ?? 0;
    if (!startNode && start >= offset && start <= offset + length) {
      startNode = textNode;
      startOffset = start - offset;
    }
    if (matchEnd >= offset && matchEnd <= offset + length) {
      endNode = textNode;
      endOffset = matchEnd - offset;
      break;
    }
    offset += length;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function activateDictionaryDecoration(
  event: FrameClickEvent,
  frames: readonly unknown[] | undefined,
  decorations: readonly ReaderDecoration[],
): ReaderDecorationActivation | null {
  if (decorations.length === 0) return null;
  const clickPoint = { x: event.x, y: event.y };
  const candidateFrames = (frames ?? []).filter(isDictionaryFrame);
  for (const frame of candidateFrames) {
    if (event.targetFrameSrc && !frameMatchesHref(frame, event.targetFrameSrc)) continue;
    const ratio = frame.window.devicePixelRatio || 1;
    const cssPoint = { x: clickPoint.x / ratio, y: clickPoint.y / ratio };
    for (const decoration of decorations) {
      if (!frameMatchesHref(frame, decoration.locator.href)) continue;
      const range = textQuoteRange(frame.window.document, decoration.locator);
      if (!range) continue;
      const rect = [...range.getClientRects()].find((item) => pointInRect(cssPoint, item));
      if (!rect) continue;
      return {
        id: decoration.id,
        locator: decoration.locator,
        point: clickPoint,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      };
    }
  }
  return null;
}
