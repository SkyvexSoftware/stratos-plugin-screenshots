import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { isAttachedToCurrentFlight } from "../attachment";
import {
  fmtAltCompact,
  fmtCoordPrecise,
  fmtElapsed,
  fmtHeading,
  fmtPhase,
  fmtRelativeShort,
  fmtSpeedCompact,
} from "../format";
import type { Screenshot } from "@/shared/types";

function buildTooltip(shot: Screenshot): string {
  const t = shot.telemetry;
  const lines: string[] = [shot.filename];
  if (t) {
    const lat = fmtCoordPrecise(t.latitude ?? null);
    const lon = fmtCoordPrecise(t.longitude ?? null);
    lines.push(`${lat} / ${lon}`);
  }
  return lines.join("\n");
}

type Props = {
  shot: Screenshot;
  currentBidId: string | null;
  onMutate: () => void | Promise<void>;
  onOpen: () => void;
};

export function ScreenshotCard({
  shot,
  currentBidId,
  onMutate,
  onOpen,
}: Props) {
  const fire = (p: Promise<unknown>) => {
    p.catch((err) => console.error("[screenshots] action failed:", err)).finally(
      () => void onMutate(),
    );
  };
  const { telemetry: t, attachment } = shot;
  const [imgError, setImgError] = useState(false);

  const isAttached = isAttachedToCurrentFlight(shot, currentBidId);
  const isError = attachment.status === "error";

  // Card border picks up the attachment state — replaces the colored rim
  // that used to live on the thumbnail itself, now that the thumb is
  // full-bleed against the card edges.
  const cardBorder = isAttached
    ? "border-accent/40"
    : isError
      ? "border-destructive"
      : "border-border";

  const tooltip = buildTooltip(shot);

  return (
    <article
      className={`bg-card border ${cardBorder} rounded-md overflow-hidden animate-scr-slide-in flex flex-col`}
      title={tooltip}
    >
      <Thumb
        shot={shot}
        imgError={imgError}
        setImgError={setImgError}
        isAttached={isAttached}
        isError={isError}
        onOpen={onOpen}
      />

      <div className="flex flex-col gap-2 p-3">
        {/* Primary line — flight info, or quiet placeholder while tagging.
            When there's no active flight, we show nothing here: the absence
            communicates itself, and removing the placeholder dramatically
            cuts the visual noise across the grid. */}
        {t === null ? (
          <div className="font-mono text-[9.5px] text-muted-foreground/50 tracking-[0.14em] uppercase animate-pulse">
            // tagging…
          </div>
        ) : t.flight ? (
          <div className="font-mono text-[10px] text-foreground tracking-tight overflow-hidden whitespace-nowrap text-ellipsis">
            <span className="font-semibold">{t.flight.callsign}</span>
            <span className="text-muted-foreground/40 mx-1.5">·</span>
            {t.flight.departureIcao}
            <span className="text-muted-foreground/60 mx-1">→</span>
            {t.flight.arrivalIcao}
            <span className="text-muted-foreground/40 mx-1.5">·</span>
            <span className="text-muted-foreground">{fmtElapsed(t.flight.elapsedMs)}</span>
          </div>
        ) : null}

        {/* Secondary line — relative time only. Filename + coords moved to
            the card-level tooltip. */}
        <div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.16em] uppercase">
          {fmtRelativeShort(shot.capturedAt)}
        </div>

        <div className="flex items-stretch gap-1.5 pt-0.5">
          <AttachButton
            shot={shot}
            currentBidId={currentBidId}
            onMutate={onMutate}
          />
          <IconBtn
            label="Open file location"
            onClick={() => fire(api.revealScreenshot(shot.id))}
          >
            <FolderIcon />
          </IconBtn>
          <IconBtn
            label="Remove from list"
            danger
            onClick={() => {
              if (confirm("Remove this screenshot from the list?")) {
                fire(api.deleteScreenshot(shot.id));
              }
            }}
          >
            <RemoveIcon />
          </IconBtn>
        </div>

        {isError && (
          <div
            className="font-mono text-[9.5px] text-destructive tracking-wide uppercase overflow-hidden text-ellipsis whitespace-nowrap"
            title={attachment.error}
          >
            err · {attachment.error}
          </div>
        )}
      </div>
    </article>
  );
}


function Thumb({
  shot,
  imgError,
  setImgError,
  isAttached,
  onOpen,
}: {
  shot: Screenshot;
  imgError: boolean;
  setImgError: (v: boolean) => void;
  isAttached: boolean;
  isError: boolean;
  onOpen: () => void;
}) {
  const { telemetry: t } = shot;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${shot.filename}`}
      className="group relative block w-full aspect-video bg-muted/50 overflow-hidden cursor-zoom-in p-0 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      {imgError ? (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] tracking-[0.18em] uppercase text-muted-foreground/60">
          // file unavailable
        </div>
      ) : (
        <img
          src={api.fileUrl(shot.id)}
          alt={shot.filename}
          onError={() => setImgError(true)}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none transition-transform duration-150 group-hover:scale-[1.02]"
        />
      )}
      {/* Telemetry overlay — hover-reveal only, so the thumbnail itself is
          the resting visual rather than a label-soup band. The bar is
          always dark, so colors are pinned to white shades rather than
          theme tokens — otherwise light mode renders dark text on a dark
          bar and the labels disappear. */}
      <div
        className={[
          "absolute left-0 right-0 bottom-0 px-2 py-1 flex gap-1.5",
          "bg-black/75 backdrop-blur-sm",
          "font-mono text-[9px] text-white tracking-tight whitespace-nowrap overflow-hidden scr-tnum",
          "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0",
          "transition-[opacity,transform] duration-150 ease-out",
        ].join(" ")}
      >
        <span className="text-white/70">{fmtPhase(t?.phase ?? null)}</span>
        <span className="text-white/40">·</span>
        <span>{fmtAltCompact(t?.altitudeFt ?? null)}</span>
        <span className="text-white/40">·</span>
        <span>{fmtSpeedCompact(t?.groundSpeedKt ?? null)}</span>
        <span className="text-white/40">·</span>
        <span>{fmtHeading(t?.headingDeg ?? null)}</span>
      </div>
    </button>
  );
}

function AttachButton({
  shot,
  currentBidId,
  onMutate,
}: {
  shot: Screenshot;
  currentBidId: string | null;
  onMutate: () => void | Promise<void>;
}) {
  const { attachment } = shot;
  const [pressed, setPressed] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  const baseCls =
    "flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded font-mono text-[10px] uppercase tracking-[0.18em] font-semibold transition-all duration-75 scr-tnum";

  const isAttachedHere = isAttachedToCurrentFlight(shot, currentBidId);

  // Attached state intentionally has no border or fill — once a screenshot
  // is attached, it should fade into the background of the grid so the eye
  // is drawn only to cards that still need action.
  if (isAttachedHere) {
    return (
      <span
        aria-label="Attached"
        className="flex-1 inline-flex items-center justify-center px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 select-none"
      >
        ✓ Attached
      </span>
    );
  }

  if (attachment.status === "attaching") {
    return (
      <button
        type="button"
        disabled
        className={`${baseCls} bg-transparent text-primary border border-primary/40 cursor-progress`}
      >
        Transmitting…
      </button>
    );
  }

  const onClick = () => {
    setPressed(true);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressed(false), 60);
    api
      .attachScreenshot(shot.id)
      .catch((err) => console.error("[screenshots] attach failed:", err))
      .finally(() => void onMutate());
  };

  // Wrong-flight gate: this shot was pinned to a specific VA bid at capture
  // time, and the active flight no longer matches (or there is no active
  // flight). Refusing this attach is the fix for back-to-back-flight
  // mis-attribution — the server would otherwise create a PirepMedia row
  // against whichever flight is current, even though the photo was taken
  // during the previous one.
  const capturedBidId = shot.capturedBidId ?? null;
  const wrongFlight =
    capturedBidId != null && capturedBidId !== currentBidId;
  if (wrongFlight) {
    return (
      <button
        type="button"
        disabled
        title="This screenshot was captured during a different flight"
        className={`${baseCls} bg-transparent text-muted-foreground/50 border border-border/60 cursor-not-allowed`}
      >
        Wrong flight
      </button>
    );
  }

  // The No-flight gate only applies to shots that haven't been uploaded yet.
  // A successfully attached shot stays attached even if the current bid id
  // isn't surfaced (handled above by isAttachedHere).
  const noFlight = currentBidId == null;
  if (noFlight) {
    return (
      <button
        type="button"
        disabled
        title="Start a flight to attach screenshots"
        className={`${baseCls} bg-transparent text-muted-foreground/50 border border-border/60 cursor-not-allowed`}
      >
        No flight
      </button>
    );
  }

  if (attachment.status === "error") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={attachment.error}
        className={`${baseCls} bg-transparent text-destructive border border-destructive hover:bg-destructive/10 ${
          pressed ? "brightness-150" : ""
        }`}
      >
        Retry <span className="font-bold">↻</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseCls} bg-transparent text-primary border border-primary/70 hover:bg-primary hover:text-primary-foreground hover:border-primary ${
        pressed ? "brightness-150" : ""
      }`}
    >
      Attach <span className="font-bold">▸</span>
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        "shrink-0 inline-flex items-center justify-center rounded border border-border text-muted-foreground transition-colors duration-75",
        // Fixed width; self-stretch lets the parent (items-stretch) match
        // the height to the Attach button's actual rendered height.
        "w-10 self-stretch",
        danger
          ? "hover:text-destructive hover:border-destructive hover:bg-destructive/10"
          : "hover:text-foreground hover:border-muted-foreground hover:bg-foreground/5",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const RemoveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path
      d="M3 3l8 8M11 3l-8 8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="square"
    />
  </svg>
);
const FolderIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path
      d="M1.5 4h4l1 1.5h6v6.5h-11V4z"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);
