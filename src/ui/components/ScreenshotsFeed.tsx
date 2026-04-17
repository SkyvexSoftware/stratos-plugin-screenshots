import { useMemo, useState } from "react";
import { Switch, useTrackingSession } from "@skyvexsoftware/stratos-sdk";
import { ScreenshotCard } from "./ScreenshotCard";
import { LightboxDialog } from "./LightboxDialog";
import { useFlightFilter } from "../hooks/useFlightFilter";
import { isAttachedToCurrentFlight } from "../attachment";
import type { Screenshot, WatchedFolder } from "@/shared/types";

type Props = {
  shots: Screenshot[];
  folders: WatchedFolder[];
  onMutate: () => void | Promise<void>;
};

export function ScreenshotsFeed({ shots, folders, onMutate }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const filter = useFlightFilter(shots);
  const visibleShots = filter.visible;
  const tracking = useTrackingSession();
  // The attach flow binds against the VA's bid_id, so we compare on that
  // rather than Stratos's flight ID — Stratos doesn't see the upload.
  // Simbrief / manual flights have no bid, so currentBidId stays null and
  // attach is gated as "no flight" for new shots.
  const plan = tracking.currentFlight?.flightPlan;
  const currentBidId =
    plan?.source === "va" && plan.sourceId
      ? plan.sourceId
      : null;

  // Always read the latest version of the open shot from the polled list
  // so things like attachment status update live in the lightbox.
  const openShot = openId ? shots.find((s) => s.id === openId) ?? null : null;

  const counts = useMemo(() => {
    const attached = visibleShots.filter((s) =>
      isAttachedToCurrentFlight(s, currentBidId),
    ).length;
    const pending = visibleShots.length - attached;
    return { pending, attached };
  }, [visibleShots, currentBidId]);

  const gateActive = filter.onlyNew;

  return (
    <section>
      <div className="py-2 flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          Captured <span className="text-muted-foreground/30 mx-1.5">//</span>{" "}
          <span className="text-foreground font-semibold">{counts.pending}</span>{" "}
          <span className="text-muted-foreground/50">pend</span>{" "}
          <span className="text-muted-foreground/30 mx-1">/</span>{" "}
          <span className="text-foreground font-semibold">{counts.attached}</span>{" "}
          <span className="text-muted-foreground/50">attached</span>
          {gateActive && filter.hiddenCount > 0 && (
            <>
              <span className="text-muted-foreground/30 mx-1.5">//</span>
              <span className="text-foreground font-semibold">
                {filter.hiddenCount}
              </span>{" "}
              <span className="text-muted-foreground/50">hidden</span>
            </>
          )}
        </span>

        <label
          className="flex items-center gap-2 cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          title={
            filter.isTracking
              ? "Hiding captures from before this flight started"
              : "Hiding pre-existing captures. New ones (and any from a flight that starts) will appear here."
          }
        >
          <span>New only</span>
          <Switch
            checked={filter.onlyNew}
            onCheckedChange={filter.setOnlyNew}
          />
        </label>
      </div>

      {visibleShots.length === 0 ? (
        <FeedEmpty
          hasFolders={folders.length > 0}
          gated={gateActive && shots.length > 0}
          hiddenCount={filter.hiddenCount}
          onShowAll={() => filter.setOnlyNew(false)}
        />
      ) : (
        <div
          className={[
            "grid gap-4 py-4",
            // Auto-fill: as many ~280px-min columns as fit, even one
            // card stays bounded instead of stretching the thumbnail.
            "grid-cols-[repeat(auto-fill,minmax(280px,1fr))]",
            "scr-stagger",
          ].join(" ")}
        >
          {visibleShots.map((shot) => (
            <ScreenshotCard
              key={shot.id}
              shot={shot}
              currentBidId={currentBidId}
              onMutate={onMutate}
              onOpen={() => setOpenId(shot.id)}
            />
          ))}
        </div>
      )}

      <LightboxDialog
        shot={openShot}
        currentBidId={currentBidId}
        onClose={() => setOpenId(null)}
        onMutate={onMutate}
      />
    </section>
  );
}

function FeedEmpty({
  hasFolders,
  gated,
  hiddenCount,
  onShowAll,
}: {
  hasFolders: boolean;
  gated: boolean;
  hiddenCount: number;
  onShowAll: () => void;
}) {
  if (gated) {
    return (
      <div className="px-4 py-10 text-center font-mono">
        <div className="text-[10px] text-muted-foreground/60 tracking-[0.22em] uppercase mb-3 flex items-center gap-2.5 justify-center before:content-[''] before:w-6 before:h-px before:bg-current before:opacity-60 after:content-[''] after:w-6 after:h-px after:bg-current after:opacity-60">
          // feed armed
        </div>
        <div className="text-xs text-muted-foreground tracking-[0.14em] uppercase font-medium">
          Awaiting next capture
        </div>
        <p className="mt-2.5 text-[10px] text-muted-foreground/70 leading-relaxed max-w-[30rem] mx-auto">
          {hiddenCount} pre-existing capture{hiddenCount === 1 ? "" : "s"}{" "}
          hidden. Anything new — including everything captured once a flight
          begins — will appear here.
        </p>
        <button
          type="button"
          onClick={onShowAll}
          className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Show all captures
        </button>
      </div>
    );
  }

  const line = hasFolders ? "// no captures yet" : "// standby";
  const msg = hasFolders ? "Awaiting first frame" : "Nothing to display";
  const hint = hasFolders
    ? "Drop a screenshot into a watched folder or fire one off in the sim — the next file appears here, fully tagged."
    : "The feed populates once a watched path receives its first file.";

  return (
    <div className="px-4 py-10 text-center font-mono">
      <div className="text-[10px] text-muted-foreground/60 tracking-[0.22em] uppercase mb-3 flex items-center gap-2.5 justify-center before:content-[''] before:w-6 before:h-px before:bg-current before:opacity-60 after:content-[''] after:w-6 after:h-px after:bg-current after:opacity-60">
        {line}
      </div>
      <div className="text-xs text-muted-foreground tracking-[0.14em] uppercase font-medium">
        {msg}
      </div>
      <p className="mt-2.5 text-[10px] text-muted-foreground/70 leading-relaxed max-w-[30rem] mx-auto">
        {hint}
      </p>
    </div>
  );
}
