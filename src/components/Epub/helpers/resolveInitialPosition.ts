import { Locator } from "@readium/shared";

import type { SerializedLocator } from "@/helpers/serializePositions";

function deserializePositions(positions: SerializedLocator[]): Locator[] {
  return positions
    .map((position) => Locator.deserialize(position))
    .filter((position): position is Locator => position !== undefined);
}

function closestPosition(
  positions: Locator[],
  progression: number | undefined,
): Locator | undefined {
  if (progression === undefined) return positions[0];

  return positions.reduce<Locator | undefined>((closest, position) => {
    if (!closest) return position;
    const positionProgression = position.locations.progression ?? 0;
    const closestProgression = closest.locations.progression ?? 0;
    return Math.abs(positionProgression - progression) <
      Math.abs(closestProgression - progression)
      ? position
      : closest;
  }, undefined);
}

/**
 * Validates persisted reading progress against the current publication.
 * Readium's EPUB frame pool requires an exact absolute position, while
 * external locators (search, sync, or an older publication) may only contain
 * an href and progression or may reference a position that no longer exists.
 */
export function resolveInitialPosition(
  stored: unknown,
  serializedPositions: SerializedLocator[],
): Locator | null {
  const positions = deserializePositions(serializedPositions);
  const storedRecord =
    stored !== null && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : null;
  const storedHref =
    typeof storedRecord?.href === "string" ? storedRecord.href.split("#")[0] : null;
  const fallbackType = positions.find((position) => position.href === storedHref)?.type;
  const locator = Locator.deserialize(
    storedRecord && fallbackType && typeof storedRecord.type !== "string"
      ? { ...storedRecord, type: fallbackType }
      : stored,
  );
  if (!locator) return null;

  if (positions.length === 0) {
    return locator.locations.position === undefined ? null : locator;
  }

  const exactPosition = positions.find(
    (position) =>
      position.href === locator.href &&
      position.locations.position === locator.locations.position,
  );
  if (exactPosition) return locator;

  const resourcePosition = closestPosition(
    positions.filter((position) => position.href === locator.href),
    locator.locations.progression,
  );
  if (!resourcePosition) return null;

  const storedJson = locator.serialize() as Record<string, unknown>;
  const resourceJson = resourcePosition.serialize() as Record<string, unknown>;
  const storedLocations = storedJson.locations as Record<string, unknown> | undefined;
  const resourceLocations = resourceJson.locations as Record<string, unknown> | undefined;

  return Locator.deserialize({
    ...resourceJson,
    ...storedJson,
    href: resourcePosition.href,
    locations: {
      ...resourceLocations,
      ...storedLocations,
      position: resourcePosition.locations.position,
    },
  }) ?? null;
}
