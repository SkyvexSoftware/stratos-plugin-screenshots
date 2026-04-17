import { STRATOS_APP_BASE } from "@skyvexsoftware/stratos-sdk/helpers";
import type {
  FlightData,
  FlightPhaseSnapshot,
  PluginLogger,
  SimDataSnapshot,
} from "@skyvexsoftware/stratos-sdk";
import type { FlightTelemetry } from "@/shared/types";

/**
 * Shape returned by GET /api/flight-manager/state — wraps a single
 * `flight` field plus side state. Earlier code tried `isTracking` /
 * `currentFlight` / `elapsedTime` which are derived in the React hook,
 * not present on the REST response.
 */
type TrackingState = {
  flight: {
    flightPlan?: {
      callsign?: string;
      departureIcao?: string;
      arrivalIcao?: string;
      source?: "va" | "simbrief" | "manual";
      sourceId?: string;
    };
    status?: string;
    pausedAt?: number | null;
    elapsedMs?: number;
  } | null;
};

/** Bound info needed by the attach flow: the VA bid this flight is booked under. */
export type ActiveFlightBinding = {
  /**
   * Crew system bid ID. Sent as-is to the VA — different VAs key bids
   * differently (numeric or opaque string), and multipart wire-encodes every
   * field as a string anyway. Null when the flight isn't VA-sourced, in
   * which case the attach flow refuses to upload.
   */
  bidId: string | null;
};

const ACTIVE_FLIGHT_STATUSES = new Set([
  "starting",
  "active",
  "paused",
  "completing",
]);

// Stratos REST endpoints all wrap responses as { success, data, error? }.
type Envelope<T> = { success: boolean; data: T | null; error?: string };

async function getEnvelope<T>(
  path: string,
  logger: PluginLogger,
): Promise<T | null> {
  const url = `${STRATOS_APP_BASE}${path}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn("Telemetry", `${path} → status ${res.status}`);
      return null;
    }
    const body = (await res.json()) as Envelope<T>;
    if (!body?.success) {
      logger.warn(
        "Telemetry",
        `${path} → success=false, error=${body?.error ?? "none"}`,
      );
      return null;
    }
    return body.data ?? null;
  } catch (err) {
    logger.error(
      "Telemetry",
      `${path} → throw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Returns the active flight's binding info, or null if there is no active
 * flight. Used by the attach flow to bind a screenshot both to the live
 * flight (for UI matching) and to the crew-system bid (for the upload).
 */
export async function getActiveFlightBinding(
  logger: PluginLogger,
): Promise<ActiveFlightBinding | null> {
  const tracking = await getEnvelope<TrackingState>(
    "/api/flight-manager/state",
    logger,
  );
  const f = tracking?.flight;
  if (!f) return null;
  if (!ACTIVE_FLIGHT_STATUSES.has(f.status ?? "")) return null;
  const plan = f.flightPlan;
  // Only va-sourced flights have a bid_id we can upload against. Simbrief /
  // manual flights are valid flights but the crew system has no bid to bind
  // the media to, so attach has to be refused for them.
  const bidId =
    plan?.source === "va" && plan.sourceId != null && plan.sourceId !== ""
      ? plan.sourceId
      : null;
  return { bidId };
}

export async function captureTelemetry(
  logger: PluginLogger,
): Promise<FlightTelemetry> {
  const [sim, phase, tracking] = await Promise.all([
    getEnvelope<SimDataSnapshot>("/api/simulator/snapshot", logger),
    getEnvelope<FlightPhaseSnapshot>(
      "/api/simulator/flight-phase/snapshot",
      logger,
    ),
    getEnvelope<TrackingState>("/api/flight-manager/state", logger),
  ]);

  const data: FlightData | null = sim?.data ?? null;
  const trackedFlight = tracking?.flight ?? null;
  const isTracking = Boolean(
    trackedFlight && ACTIVE_FLIGHT_STATUSES.has(trackedFlight.status ?? ""),
  );
  const plan = trackedFlight?.flightPlan;
  const flight = isTracking && plan
    ? {
        callsign: plan.callsign ?? "",
        departureIcao: plan.departureIcao ?? "",
        arrivalIcao: plan.arrivalIcao ?? "",
        elapsedMs: trackedFlight?.elapsedMs ?? 0,
      }
    : null;

  return {
    capturedAt: Date.now(),
    hasSimConnection: Boolean(sim?.isConnected),
    phase: phase?.currentPhase ?? null,
    latitude: data?.latitude ?? null,
    longitude: data?.longitude ?? null,
    altitudeFt: data?.altitude ?? null,
    groundSpeedKt: data?.groundSpeed ?? null,
    headingDeg: data?.heading ?? null,
    aircraftIcao: data?.aircraftIcao ?? null,
    flight,
  };
}
