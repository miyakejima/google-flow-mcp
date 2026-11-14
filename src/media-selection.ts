import type { MediaAssetIdentity } from "./types.js";

export interface MediaSnapshot {
  index: number;
  keys: string[];
  ready: boolean;
  sourceUrl?: string;
}

// Derive the stable "asb:<token>" key from any flow.google.com/asb/ URL key, so identities
// recorded before token keys existed (or with a different rendition suffix) still match.
const ASB_URL_KEY = /^url(?:-stable)?:https:\/\/flow\.google\.com\/asb\/([^=?#]+)/;

export function expandMediaKeys(keys: Iterable<string>): Set<string> {
  const expanded = new Set<string>();
  for (const key of keys) {
    expanded.add(key);
    const token = key.match(ASB_URL_KEY)?.[1];
    if (token) expanded.add(`asb:${token}`);
  }
  return expanded;
}

function overlaps(left: string[], right: ReadonlySet<string>): boolean {
  for (const key of expandMediaKeys(left)) if (right.has(key)) return true;
  return false;
}

export function flattenMediaKeys(snapshots: MediaSnapshot[]): string[] {
  return [...new Set(snapshots.flatMap((snapshot) => snapshot.keys))];
}

export function selectNewMedia(
  snapshots: MediaSnapshot[],
  baselineKeys: string[],
): MediaSnapshot[] {
  const baseline = expandMediaKeys(baselineKeys);
  // Flow inserts new outputs at the top of its (newest-first) gallery, while older tiles that
  // were virtualized or still loading when the baseline was taken surface further down. So an
  // unknown tile only counts as new if it precedes every tile known from the baseline.
  const known = snapshots.filter((snapshot) => overlaps(snapshot.keys, baseline)).map((snapshot) => snapshot.index);
  const firstKnown = known.length ? Math.min(...known) : Number.POSITIVE_INFINITY;
  return snapshots.filter((snapshot) =>
    snapshot.keys.length > 0 && !overlaps(snapshot.keys, baseline) && snapshot.index < firstKnown);
}

export function identitiesFor(snapshots: MediaSnapshot[]): MediaAssetIdentity[] {
  return snapshots.map((snapshot) => ({ keys: [...snapshot.keys] }));
}

export function resolveMediaIdentities(
  snapshots: MediaSnapshot[],
  identities: MediaAssetIdentity[],
): MediaSnapshot[] | null {
  const usedIndexes = new Set<number>();
  const resolved: MediaSnapshot[] = [];

  for (const identity of identities) {
    const keys = expandMediaKeys(identity.keys);
    const matches = snapshots.filter((snapshot) => !usedIndexes.has(snapshot.index) && overlaps(snapshot.keys, keys));
    if (matches.length !== 1) return null;
    const match = matches[0]!;
    usedIndexes.add(match.index);
    resolved.push(match);
  }

  return resolved;
}
