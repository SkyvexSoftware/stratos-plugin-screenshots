import { FolderCog } from "lucide-react";
import {
  Button,
  useFlightPhase,
  useSimData,
  useTrackingSession,
} from "@skyvexsoftware/stratos-sdk";
import { fmtAlt, fmtCoordWide, fmtHeading, fmtPhase } from "../format";

type Props = {
  folderCount: number;
  unreachableCount: number;
  onConfigurePaths: () => void;
};

export function StatusStrip({
  folderCount,
  unreachableCount,
  onConfigurePaths,
}: Props) {
  const { data: sim } = useSimData({
    select: (s) => ({
      connected: s?.isConnected ?? false,
      lat: s?.data?.latitude ?? null,
      lon: s?.data?.longitude ?? null,
      alt: s?.data?.altitude ?? null,
      gs: s?.data?.groundSpeed ?? null,
      hdg: s?.data?.heading ?? null,
      vs: s?.data?.verticalSpeed ?? null,
      windDir: s?.data?.windDirection ?? null,
      windSpd: s?.data?.windSpeed ?? null,
      aircraftIcao: s?.data?.aircraftIcao ?? null,
    }),
  });
  const { data: phase } = useFlightPhase({ select: (s) => s?.currentPhase });
  const tracking = useTrackingSession();

  const connected = sim?.connected ?? false;
  const cf = tracking.currentFlight;
  const plan = cf?.flightPlan;
  const isTracking = tracking.isTracking;

  return (
    <header className="pb-4 mb-2 border-b border-border/60 flex flex-col gap-2.5">
      {/* Status / flight info / configure */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 text-[12px]">
          <span
            className={[
              "w-1.5 h-1.5 rounded-full shrink-0",
              connected
                ? "bg-accent-green shadow-[0_0_4px_rgba(77,255,166,0.6)]"
                : "bg-muted-foreground/40",
            ].join(" ")}
            aria-hidden
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {connected ? (isTracking ? "Tracking" : "Idle") : "Sim Offline"}
          </span>

          {isTracking && plan ? (
            <>
              <Sep />
              <span className="font-display font-semibold text-foreground">
                {plan.callsign}
              </span>
              <Sep />
              <span className="font-display text-foreground/90 truncate">
                {plan.departureIcao}
                <span className="text-muted-foreground/50 mx-1.5">→</span>
                {plan.arrivalIcao}
              </span>
              {sim?.aircraftIcao && (
                <>
                  <Sep />
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {sim.aircraftIcao}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <Sep />
              <span className="font-display text-muted-foreground/80">
                No active flight
              </span>
            </>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={onConfigurePaths}
          aria-label="Configure watched paths"
          className="shrink-0 gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] bg-transparent text-text-muted border border-border hover:text-foreground"
        >
          <FolderCog size={12} strokeWidth={2} />
          <span>Configure paths</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="font-semibold text-foreground">{folderCount}</span>
          {unreachableCount > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-destructive text-[9.5px]">
                {unreachableCount} offline
              </span>
            </>
          )}
        </Button>
      </div>

      {/* Stat row — wraps as one fluid row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-0.5">
        <Stat label="Phase" value={connected ? fmtPhase(phase) : "—"} />
        <Stat label="Altitude" value={fmtAlt(sim?.alt ?? null)} />
        <Stat
          label="Ground Spd"
          value={sim?.gs == null ? "—" : `${Math.round(sim.gs)} kt`}
        />
        <Stat label="Heading" value={fmtHeading(sim?.hdg ?? null)} />
        <Stat label="Vertical Spd" value={fmtVS(sim?.vs ?? null)} />
        {isTracking ? (
          <Stat
            label={cf?.timeCaptureMode === "air" ? "Air Time" : "Block Time"}
            value={fmtDuration(tracking.elapsedTime)}
            tone="accent"
          />
        ) : (
          <Stat
            label="Wind"
            value={fmtWind(sim?.windDir ?? null, sim?.windSpd ?? null)}
          />
        )}
        <Stat
          label="Position"
          value={
            sim?.lat == null || sim?.lon == null
              ? "—"
              : `${fmtCoordWide(sim.lat)} · ${fmtCoordWide(sim.lon)}`
          }
        />
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60 shrink-0">
        {label}
      </span>
      <span
        className={[
          "font-mono text-[12px] font-medium scr-tnum",
          tone === "accent" ? "text-accent" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="text-muted-foreground/30 font-mono shrink-0">·</span>;
}

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function fmtVS(fpm: number | null): string {
  if (fpm == null) return "—";
  const v = Math.round(fpm);
  return v >= 0 ? `+${v} fpm` : `${v} fpm`;
}

function fmtWind(dir: number | null, spd: number | null): string {
  if (dir == null || spd == null) return "—";
  const d = Math.round(((dir % 360) + 360) % 360)
    .toString()
    .padStart(3, "0");
  return `${d}°/${Math.round(spd)} kt`;
}
