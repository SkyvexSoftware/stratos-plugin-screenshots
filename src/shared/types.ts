import type { FlightPhase } from "@skyvexsoftware/stratos-sdk";

export type FolderStatus = "watching" | "unreachable";

export type WatchedFolder = {
  path: string;
  addedAt: number;
  status: FolderStatus;
  fileCount: number;
  lastSyncAt: number | null;
};

export type FlightTelemetry = {
  capturedAt: number;
  hasSimConnection: boolean;
  phase: FlightPhase | null;
  latitude: number | null;
  longitude: number | null;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  headingDeg: number | null;
  aircraftIcao: string | null;
  flight: {
    callsign: string;
    departureIcao: string;
    arrivalIcao: string;
    elapsedMs: number;
  } | null;
};

export type AttachmentState =
  | { status: "pending" }
  | { status: "attaching" }
  | {
      status: "attached";
      serverId: string;
      attachedAt: number;
      /**
       * VA bid_id this upload was made against — the airline's identifier
       * for the booking the screenshot belongs to. We compare against this
       * (not Stratos's flight ID) because the upload is a transaction with
       * the VA; Stratos doesn't see this image. Null only for legacy
       * records written before this binding existed. */
      bidId: string | null;
      /**
       * VA-side row identifier returned by the upload endpoint, used to
       * address this row when the user later deletes it. Null when the VA
       * didn't return one (or the record predates this field). */
      photoId: string | null;
    }
  | { status: "error"; error: string; failedAt: number };

export type Screenshot = {
  id: string;
  path: string;
  filename: string;
  watchedFolder: string;
  capturedAt: number;
  fileSizeBytes: number | null;
  /** Null until the renderer tags it from live hook data. */
  telemetry: FlightTelemetry | null;
  /**
   * VA bid_id captured at file-detect time, alongside telemetry. The attach
   * flow uploads against *this* value rather than re-querying the active
   * flight at attach time, so a delayed/queued attach can't bind a shot to a
   * different flight than the one it was taken in. Null when no VA flight
   * was active at capture. Undefined on legacy records written before this
   * binding existed — those fall back to the live binding at attach time.
   */
  capturedBidId?: string | null;
  attachment: AttachmentState;
};
