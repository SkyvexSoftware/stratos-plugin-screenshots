import { useEffect, useMemo, useState } from "react";
import { useTrackingSession } from "@skyvexsoftware/stratos-sdk";
import type { Screenshot } from "@/shared/types";

const LS_TOGGLE = "screenshots:onlyNewSinceFlightStart";
const LS_ARMED_AT = "screenshots:flightFilterArmedAt";

function readToggle(): boolean {
  try {
    const v = localStorage.getItem(LS_TOGGLE);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

function readArmedAt(): number | null {
  try {
    const v = localStorage.getItem(LS_ARMED_AT);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeArmedAt(value: number | null): void {
  try {
    if (value == null) localStorage.removeItem(LS_ARMED_AT);
    else localStorage.setItem(LS_ARMED_AT, String(value));
  } catch {
    // ignore
  }
}

export type FlightFilter = {
  /** User-facing toggle state. Persisted across reloads. */
  onlyNew: boolean;
  setOnlyNew: (value: boolean) => void;
  /** True while the flight manager reports an active tracking session. */
  isTracking: boolean;
  /** Server-truth flight start timestamp, or null when no flight is active. */
  flightStartedAt: number | null;
  /** Shots after applying the filter. */
  visible: Screenshot[];
  /** Count of shots hidden by the filter (only > 0 when the toggle is on and a cutoff exists). */
  hiddenCount: number;
};

export function useFlightFilter(shots: Screenshot[]): FlightFilter {
  const tracking = useTrackingSession();
  const [onlyNew, setOnlyNewState] = useState<boolean>(readToggle);
  const [armedAt, setArmedAt] = useState<number | null>(readArmedAt);

  // Arm the gate the moment the toggle is on with no prior arm time. This
  // covers first install, fresh pane opens, and the user toggling off → on.
  useEffect(() => {
    if (onlyNew && armedAt == null) {
      const now = Date.now();
      setArmedAt(now);
      writeArmedAt(now);
    }
  }, [onlyNew, armedAt]);

  const setOnlyNew = (value: boolean) => {
    setOnlyNewState(value);
    try {
      localStorage.setItem(LS_TOGGLE, String(value));
    } catch {
      // ignore — toggle still works for the session
    }
    if (value) {
      // Re-arm fresh so flipping on hides everything currently in the feed.
      const now = Date.now();
      setArmedAt(now);
      writeArmedAt(now);
    } else {
      // Drop the arm time; next "on" will re-arm to that future moment.
      setArmedAt(null);
      writeArmedAt(null);
    }
  };

  // Re-sync if another pane mutates the same keys.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_TOGGLE) setOnlyNewState(readToggle());
      if (e.key === LS_ARMED_AT) setArmedAt(readArmedAt());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const flightStartedAt = tracking.currentFlight?.startedAt ?? null;

  // Cutoff is the later of "armed at" and the active flight start so a
  // flight that begins after arming snaps the cutoff forward and re-hides
  // any captures taken between arming and the flight starting.
  const cutoff = onlyNew
    ? Math.max(armedAt ?? 0, flightStartedAt ?? 0) || null
    : null;

  const { visible, hiddenCount } = useMemo(() => {
    if (cutoff == null) return { visible: shots, hiddenCount: 0 };
    const v = shots.filter((s) => s.capturedAt >= cutoff);
    return { visible: v, hiddenCount: shots.length - v.length };
  }, [cutoff, shots]);

  return {
    onlyNew,
    setOnlyNew,
    isTracking: tracking.isTracking,
    flightStartedAt,
    visible,
    hiddenCount,
  };
}
