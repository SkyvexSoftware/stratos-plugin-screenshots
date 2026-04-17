import { FlightPhase } from "@skyvexsoftware/stratos-sdk";

const ZERO_PAD = (n: number) => String(n).padStart(2, "0");

export const fmtPhase = (phase: FlightPhase | null | undefined): string => {
  const p = (phase ?? FlightPhase.UNKNOWN).toString();
  // Replace snake_case with spaces; uppercase. e.g. take_off → TAKE OFF
  return p.replace(/_/g, " ").toUpperCase();
};

export const fmtCoordWide = (
  value: number | null,
  digits = 2,
): string => {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "" : "-";
  return `${sign}${Math.abs(value).toFixed(digits)}°`;
};

export const fmtCoordPrecise = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(4)}°`;
};

export const fmtAlt = (ft: number | null): string => {
  if (ft == null) return "—";
  if (ft >= 18000) return `FL${Math.round(ft / 100).toString().padStart(3, "0")}`;
  return `${Math.round(ft).toLocaleString("en-US")} FT`;
};

export const fmtAltCompact = (ft: number | null): string => {
  if (ft == null) return "—";
  if (ft >= 18000) return `FL${Math.round(ft / 100).toString().padStart(3, "0")}`;
  return `${Math.round(ft).toLocaleString("en-US")}FT`;
};

export const fmtSpeed = (kt: number | null): string =>
  kt == null ? "—" : `${Math.round(kt)} KT`;

export const fmtSpeedCompact = (kt: number | null): string =>
  kt == null ? "—" : `${Math.round(kt)}KT`;

export const fmtHeading = (deg: number | null): string => {
  if (deg == null) return "—";
  const norm = ((deg % 360) + 360) % 360;
  return `${Math.round(norm).toString().padStart(3, "0")}°`;
};

export const fmtElapsed = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `T+${ZERO_PAD(h)}:${ZERO_PAD(m)}:${ZERO_PAD(s)}`;
};

export const fmtRelativeShort = (ts: number): string => {
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}S`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}M`;
  const hr = Math.floor(min / 60);
  const remM = min - hr * 60;
  if (hr < 24) return remM > 0 && hr < 4 ? `${hr}H ${remM}M` : `${hr}H AGO`;
  return `${Math.floor(hr / 24)}D AGO`;
};

export const fmtSync = (ts: number | null): string => {
  if (ts == null) return "AWAITING";
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `SYNC ${sec}S AGO`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `SYNC ${min}M AGO`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `SYNC ${hr}H AGO`;
  return `SYNC ${Math.floor(hr / 24)}D AGO`;
};

export const fmtUnreachable = (ts: number | null): string => {
  if (ts == null) return "UNREACHABLE";
  const delta = Math.max(0, Date.now() - ts);
  const min = Math.max(1, Math.floor(delta / 60000));
  return `UNREACHABLE · ${min}M`;
};

const PATH_SEP_RE = /[\\/]/;

export const splitPath = (
  full: string,
): { head: string; tail: string } => {
  if (!full) return { head: "", tail: "" };
  const lastSepIdx = Math.max(
    full.lastIndexOf("/"),
    full.lastIndexOf("\\"),
  );
  if (lastSepIdx <= 0 || lastSepIdx === full.length - 1) {
    return { head: full, tail: "" };
  }
  const sep = full[lastSepIdx];
  return {
    head: full.slice(0, lastSepIdx),
    tail: `${sep}${full.slice(lastSepIdx + 1)}`,
  };
};

export { PATH_SEP_RE };
