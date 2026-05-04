import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@skyvexsoftware/stratos-sdk";
import { ChevronDown, ChevronUp, Folder, Trash2 } from "lucide-react";
import { api } from "../api";
import { isAttachedToCurrentFlight } from "../attachment";
import {
  fmtAlt,
  fmtCoordPrecise,
  fmtElapsed,
  fmtHeading,
  fmtPhase,
  fmtRelativeShort,
  fmtSpeed,
} from "../format";
import type { Screenshot } from "@/shared/types";

type Props = {
  shot: Screenshot | null;
  currentBidId: string | null;
  onClose: () => void;
  onMutate: () => void | Promise<void>;
};

export function LightboxDialog({
  shot,
  currentBidId,
  onClose,
  onMutate,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const open = shot !== null;

  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const fire = (p: Promise<unknown>, andClose = false) => {
    p.catch((err) =>
      console.error("[screenshots] lightbox action failed:", err),
    ).finally(() => {
      void onMutate();
      if (andClose) onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(1400px,96vw)]! w-[min(1400px,96vw)] gap-0! p-0! overflow-hidden border-border bg-black"
      >
        <DialogTitle className="sr-only">
          {shot?.filename ?? "Screenshot"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Full-size screenshot view with captured flight telemetry.
        </DialogDescription>

        {shot && (
          <div className="relative w-full h-[90vh] bg-black">
            {/* IMAGE — fills the entire dialog */}
            <div className="absolute inset-0 flex items-center justify-center">
              {imgError ? (
                <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/60">
                  // file unavailable
                </div>
              ) : (
                <img
                  key={shot.id}
                  src={api.fileUrl(shot.id)}
                  alt={shot.filename}
                  onError={() => setImgError(true)}
                  draggable={false}
                  className="max-w-full max-h-full object-contain select-none"
                />
              )}
            </div>

            {/* TOP CHROME — filename + status */}
            <TopChrome shot={shot} currentBidId={currentBidId} />

            {/* BOTTOM CHROME — telemetry strip + actions */}
            <BottomChrome
              shot={shot}
              currentBidId={currentBidId}
              detailsOpen={detailsOpen}
              onToggleDetails={() => setDetailsOpen((v) => !v)}
              onAttach={() => fire(api.attachScreenshot(shot.id))}
              onReveal={() => fire(api.revealScreenshot(shot.id))}
              onDelete={() => {
                if (confirm("Remove this screenshot from the list?")) {
                  fire(api.deleteScreenshot(shot.id), true);
                }
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TopChrome({
  shot,
  currentBidId,
}: {
  shot: Screenshot;
  currentBidId: string | null;
}) {
  const rawStatus = shot.attachment.status;
  // Demote a stale "attached" (different flight, or no flight) to "pending"
  // so the chip doesn't claim a binding that no longer exists.
  const status =
    rawStatus === "attached" &&
    !isAttachedToCurrentFlight(shot, currentBidId)
      ? "pending"
      : rawStatus;
  const tone =
    status === "attached"
      ? "text-accent-green"
      : status === "error"
        ? "text-destructive"
        : status === "attaching"
          ? "text-primary"
          : "text-white/45";

  return (
    // Reserve right-12 to clear the SDK's built-in close X (absolute right-4 top-4).
    <div className="absolute top-0 left-0 right-0 pl-5 pr-12 py-3 flex items-baseline gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
      <span
        className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.22em] pointer-events-auto ${tone}`}
      >
        {status}
      </span>
      <span className="text-white/20 shrink-0">·</span>
      <div
        className="font-display text-[13px] font-medium text-white truncate min-w-0 pointer-events-auto"
        title={shot.filename}
      >
        {shot.filename}
      </div>
      <div
        className="hidden @[720px]/lightbox:block font-mono text-[10px] text-white/35 truncate min-w-0 pointer-events-auto"
        title={shot.path}
      >
        {shot.path}
      </div>
    </div>
  );
}

function BottomChrome({
  shot,
  currentBidId,
  detailsOpen,
  onToggleDetails,
  onAttach,
  onReveal,
  onDelete,
}: {
  shot: Screenshot;
  currentBidId: string | null;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onAttach: () => void;
  onReveal: () => void;
  onDelete: () => void;
}) {
  const t = shot.telemetry;
  const status = shot.attachment.status;
  const isAttached = isAttachedToCurrentFlight(shot, currentBidId);
  const isAttaching = status === "attaching";
  const isError = status === "error";
  const noFlight = currentBidId == null;
  // Pinned to a different VA bid than the one currently active. Mirrors the
  // ScreenshotCard gate so the lightbox can't trigger a cross-flight rebind
  // either.
  const capturedBidId = shot.capturedBidId ?? null;
  const wrongFlight =
    capturedBidId != null && capturedBidId !== currentBidId;

  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col bg-gradient-to-t from-black/85 via-black/55 to-transparent">
      {/* Expanded details panel — only shown when toggled */}
      {detailsOpen && t && (
        <div className="px-5 pb-3 pt-6 grid grid-cols-2 @[720px]/lightbox:grid-cols-4 gap-x-6 gap-y-3 text-[11px] backdrop-blur-md">
          <DetailGroup title="Captured">
            <Detail
              label="At"
              value={new Date(shot.capturedAt).toLocaleString()}
            />
            <Detail label="Ago" value={fmtRelativeShort(shot.capturedAt)} />
            <Detail
              label="Sim"
              value={t.hasSimConnection ? "Connected" : "Offline"}
              tone={t.hasSimConnection ? "ok" : "warn"}
            />
          </DetailGroup>
          <DetailGroup title="Position">
            <Detail label="Phase" value={fmtPhase(t.phase)} />
            <Detail label="Lat" value={fmtCoordPrecise(t.latitude)} />
            <Detail label="Lon" value={fmtCoordPrecise(t.longitude)} />
          </DetailGroup>
          <DetailGroup title="Flight">
            {t.flight ? (
              <>
                <Detail label="Callsign" value={t.flight.callsign} />
                <Detail
                  label="Route"
                  value={`${t.flight.departureIcao} → ${t.flight.arrivalIcao}`}
                />
                <Detail
                  label="Elapsed"
                  value={fmtElapsed(t.flight.elapsedMs)}
                />
              </>
            ) : (
              <span className="font-mono text-[10px] text-white/40 uppercase tracking-[0.14em]">
                no active flight
              </span>
            )}
          </DetailGroup>
          <DetailGroup title="Aircraft">
            <Detail label="Type" value={t.aircraftIcao ?? "—"} />
          </DetailGroup>
        </div>
      )}

      {/* Always-visible bottom strip — quick telemetry + actions */}
      <div className="px-5 py-3 flex items-center gap-3 backdrop-blur-md">
        {/* Quick telemetry summary */}
        <div className="flex-1 min-w-0 flex items-center gap-2 font-mono text-[11px] text-white/80 overflow-hidden">
          {t === null ? (
            <span className="text-white/50 tracking-[0.18em] uppercase animate-pulse">
              tagging…
            </span>
          ) : (
            <>
              <Pill label={fmtPhase(t.phase)} />
              <Pill label={fmtAlt(t.altitudeFt)} />
              <Pill label={fmtSpeed(t.groundSpeedKt)} />
              <Pill label={fmtHeading(t.headingDeg)} />
              {t.flight && (
                <Pill
                  label={`${t.flight.callsign} · ${t.flight.departureIcao}→${t.flight.arrivalIcao}`}
                  accent
                />
              )}
            </>
          )}
        </div>

        {/* Details toggle */}
        <ChromeBtn onClick={onToggleDetails} label="Toggle details">
          {detailsOpen ? (
            <ChevronDown size={12} strokeWidth={2} />
          ) : (
            <ChevronUp size={12} strokeWidth={2} />
          )}
          <span>Details</span>
        </ChromeBtn>

        {/* Primary action */}
        {isAttached ? (
          <span className="shrink-0 inline-flex items-center h-8 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-green/90">
            ✓ Attached
          </span>
        ) : wrongFlight ? (
          <ChromeBtn
            onClick={() => {}}
            disabled
            label="This screenshot was captured during a different flight"
          >
            <span>Wrong flight</span>
          </ChromeBtn>
        ) : noFlight ? (
          <ChromeBtn
            onClick={() => {}}
            disabled
            label="Start a flight to attach screenshots"
          >
            <span>No flight</span>
          </ChromeBtn>
        ) : (
          <ChromeBtn
            onClick={onAttach}
            disabled={isAttaching}
            label={isAttaching ? "Transmitting" : isError ? "Retry" : "Attach"}
            tone="primary"
          >
            <span>
              {isAttaching ? "Transmitting…" : isError ? "Retry ↻" : "Attach ▸"}
            </span>
          </ChromeBtn>
        )}

        {/* Secondary icon actions */}
        <div className="shrink-0 flex items-center gap-1">
          <ChromeBtn onClick={onReveal} label="Reveal in finder" iconOnly>
            <Folder size={13} strokeWidth={1.75} />
          </ChromeBtn>
          <ChromeBtn onClick={onDelete} label="Delete" iconOnly danger>
            <Trash2 size={13} strokeWidth={1.75} />
          </ChromeBtn>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={[
        "shrink-0 inline-flex items-center h-7 px-2 rounded-md border whitespace-nowrap scr-tnum",
        accent
          ? "border-primary/40 bg-primary/15 text-white"
          : "border-white/10 bg-white/[0.04] text-white/85",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function ChromeBtn({
  children,
  onClick,
  label,
  disabled,
  iconOnly,
  danger,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  iconOnly?: boolean;
  danger?: boolean;
  tone?: "primary";
}) {
  // Single unified bottom-strip button: 32px tall, mono caps, consistent border.
  // `tone="primary"` paints it red for the main CTA; `iconOnly` makes it square.
  // `min-h-0 leading-none box-border` prevent flex's default `min-height: auto`
  // from inflating the button via taller content (e.g. unicode glyphs).
  const base =
    "inline-flex shrink-0 items-center justify-center h-8 min-h-0 box-border leading-none gap-1.5 rounded-md border font-mono text-[10px] uppercase tracking-[0.18em] transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const shape = iconOnly ? "w-8" : "px-3";
  const colors =
    tone === "primary"
      ? "bg-primary text-primary-foreground border-primary hover:brightness-110"
      : danger
        ? "border-white/10 text-white/60 hover:bg-white/5 hover:text-destructive hover:border-destructive/50"
        : "border-white/10 text-white/70 hover:bg-white/5 hover:text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[base, shape, colors].join(" ")}
    >
      {children}
    </button>
  );
}

function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <h3 className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/40">
        {title}
      </h3>
      <div className="flex flex-col gap-1 min-w-0">{children}</div>
    </div>
  );
}

function Detail({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const valColor =
    tone === "ok"
      ? "text-accent-green"
      : tone === "warn"
        ? "text-destructive"
        : "text-white";
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/50 shrink-0">
        {label}
      </span>
      <span
        className={`font-mono text-[11px] text-right truncate scr-tnum ${valColor}`}
      >
        {value}
      </span>
    </div>
  );
}
