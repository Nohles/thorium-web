import { Locator } from "@readium/shared";

import type {
  ReaderDecorationActivatedEvent,
  ReaderInteractionProps,
  ReaderTextSelectedEvent,
} from "./ReaderInteractions";

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

/**
 * @deprecated Pass the equivalent fields directly through ReaderInteractionProps.
 * This compatibility shape remains available while dictionary consumers migrate.
 */
export type DictionaryReaderCallbacks = {
  decorations?: readonly ReaderDecoration[];
  onTextSelected?: (selection: ReaderTextSelection) => void;
  onDecorationActivated?: (activation: ReaderDecorationActivation) => void;
};

const DICTIONARY_ID_PREFIX = "__dictionary__:";

const dictionaryDecorationId = (index: number, id: string) =>
  `${DICTIONARY_ID_PREFIX}${index}:${id}`;

const legacySelection = (
  event: ReaderTextSelectedEvent,
): ReaderTextSelection | null => {
  const selectedText = event.text.trim();
  if (!selectedText || !event.locator) return null;
  const frameRect = event.frameRect ?? event.rect;
  return {
    selectedText,
    locator: event.locator,
    rect: {
      ...frameRect,
      targetFrameSrc: event.frameSrc,
    },
  };
};

const legacyActivation = (
  event: ReaderDecorationActivatedEvent,
  decoration: ReaderDecoration,
): ReaderDecorationActivation => {
  const rect = event.frameRect ?? {
    top: event.rect?.y ?? event.point.y,
    left: event.rect?.x ?? event.point.x,
    width: event.rect?.width ?? 0,
    height: event.rect?.height ?? 0,
  };
  return {
    id: decoration.id,
    locator: decoration.locator,
    point: event.framePoint ?? event.point,
    rect,
  };
};

/**
 * Folds the legacy dictionary contract into the canonical reader interaction
 * pipeline. Generic callbacks keep priority, matching the previous two-path
 * behavior, while dictionary IDs are namespaced internally to avoid clashes.
 */
export const mergeReaderInteractions = (
  interactions: ReaderInteractionProps,
  dictionary?: DictionaryReaderCallbacks,
): ReaderInteractionProps => {
  if (!dictionary) return interactions;

  const dictionaryDecorations = (dictionary.decorations ?? []).map(
    (decoration, index) => ({
      id: dictionaryDecorationId(index, decoration.id),
      locator: decoration.locator,
      style: decoration.style,
      extras: decoration.extras,
      activation: "click" as const,
    }),
  );
  const decorationsByInternalId = new Map(
    dictionaryDecorations.map((decoration, index) => [
      decoration.id,
      dictionary.decorations?.[index],
    ]),
  );

  return {
    decorations:
      interactions.decorations === undefined && dictionary.decorations === undefined
        ? undefined
        : [...(interactions.decorations ?? []), ...dictionaryDecorations],
    onTextSelected:
      interactions.onTextSelected || dictionary.onTextSelected
        ? (event) => {
            interactions.onTextSelected?.(event);
            const selection = legacySelection(event);
            if (selection) dictionary.onTextSelected?.(selection);
          }
        : undefined,
    onContextMenu: interactions.onContextMenu,
    onDecorationActivated:
      interactions.onDecorationActivated || dictionary.onDecorationActivated
        ? (event) => {
            const dictionaryDecoration = decorationsByInternalId.get(event.id);
            if (dictionaryDecoration) {
              dictionary.onDecorationActivated?.(
                legacyActivation(event, dictionaryDecoration),
              );
              return;
            }
            interactions.onDecorationActivated?.(event);
          }
        : undefined,
  };
};
