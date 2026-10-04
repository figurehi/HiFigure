import type { DiagramSkeletonCandidate } from "./types";

/** Return the newest generated Skeleton for one Layout reference. */
export function latestSkeletonForReference(
  candidates: DiagramSkeletonCandidate[],
  referenceId: string,
): DiagramSkeletonCandidate | null {
  return candidates.reduce<DiagramSkeletonCandidate | null>((latest, candidate) => {
    if (candidate.referenceId !== referenceId) return latest;
    if (!latest) return candidate;
    return candidate.createdAt.localeCompare(latest.createdAt) >= 0 ? candidate : latest;
  }, null);
}
