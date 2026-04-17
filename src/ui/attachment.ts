import type { Screenshot } from "@/shared/types";

/**
 * An attachment is meaningful only in the context of the VA bid it was
 * uploaded against. We only treat a shot as belonging to a *different*
 * booking when we can prove it: both sides have a non-null bid id and they
 * differ. Without that proof (either side null) we keep treating the shot
 * as attached — a successful upload should not silently flip back to
 * "No flight" just because the current bid id isn't surfaced.
 */
export function isAttachedToCurrentFlight(
  shot: Screenshot,
  currentBidId: string | null,
): boolean {
  const a = shot.attachment;
  if (a.status !== "attached") return false;
  if (
    currentBidId != null &&
    a.bidId != null &&
    a.bidId !== currentBidId
  ) {
    return false;
  }
  return true;
}
