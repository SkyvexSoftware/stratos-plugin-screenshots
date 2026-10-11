import type {
  FlightManagerPayload,
  FlightStatus,
  PluginFlightAccessor,
  PluginLogger,
} from "@skyvexsoftware/stratos-sdk";
import type { FlightTelemetry } from "@/shared/types";

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

const ACTIVE_FLIGHT_STATUSES = new Set<FlightStatus>([
  "starting",
  "active",
  "paused",
  "completing",
]);

/**
 * Runs one `ctx.flight` read, logging and returning null on failure so a
 * missing reading degrades the tag instead of dropping the screenshot.
 */
async function read<T>(
  label: string,
  fn: () => Promise<T>,
  logger: PluginLogger,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error(
      "Telemetry",
      `${label} → throw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function activeFlight(state: FlightManagerPayload | null) {
  const f = state?.flight ?? null;
  return f && ACTIVE_FLIGHT_STATUSES.has(f.status) ? f : null;
}

/**
 * Returns the active flight's binding info, or null if there is no active
 * flight. Used by the attach flow to bind a screenshot both to the live
 * flight (for UI matching) and to the crew-system bid (for the upload).
 */
export async function getActiveFlightBinding(
  flight: PluginFlightAccessor,
  logger: PluginLogger,
): Promise<ActiveFlightBinding | null> {
  const f = activeFlight(await read("getState", () => flight.getState(), logger));
  if (!f) return null;
  const plan = f.flightPlan;
  // Only va-sourced flights have a bid_id we can upload against. Simbrief /
  // manual flights are valid flights but the crew system has no bid to bind
  // the media to, so attach has to be refused for them.
  const bidId =
    plan.source === "va" && plan.sourceId != null && plan.sourceId !== ""
      ? plan.sourceId
      : null;
  return { bidId };
}

export async function captureTelemetry(
  flight: PluginFlightAccessor,
  logger: PluginLogger,
): Promise<FlightTelemetry> {
  const [sim, phase, state] = await Promise.all([
    read("getSnapshot", () => flight.getSnapshot(), logger),
    read("getPhase", () => flight.getPhase(), logger),
    read("getState", () => flight.getState(), logger),
  ]);

  const data = sim?.data ?? null;
  const tracked = activeFlight(state);
  const plan = tracked?.flightPlan;
  const flightInfo = tracked && plan
    ? {
        callsign: plan.callsign ?? "",
        departureIcao: plan.departureIcao ?? "",
        arrivalIcao: plan.arrivalIcao ?? "",
        elapsedMs: tracked.elapsedMs ?? 0,
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
    flight: flightInfo,
  };
}
