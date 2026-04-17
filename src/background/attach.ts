import * as fs from "fs";
import * as path from "path";
import type {
  PluginAirline,
  PluginAirlineAccessor,
  PluginLogger,
} from "@skyvexsoftware/stratos-sdk";
import type { Screenshot } from "@/shared/types";

/**
 * The plugin talks directly to the bound VA's backend. The `airline`
 * accessor on the plugin context gives us both the base URL and the
 * pilot's VA bearer in a single fetch, so we don't need a shell-side
 * proxy and can't accidentally use the wrong (Stratos vs VA) bearer.
 */

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
};

function mimeFor(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "image/jpeg";
}

async function requireAirline(
  accessor: PluginAirlineAccessor,
): Promise<PluginAirline & { token: string }> {
  const airline = await accessor.getCurrent();
  if (!airline) {
    throw new Error("no airline bound — pilot is not signed in to a VA");
  }
  if (!airline.token) {
    throw new Error("VA session expired — please sign in again");
  }
  return airline as PluginAirline & { token: string };
}

/**
 * Uploads the screenshot file to the VA's
 * POST api/stratos/screenshot/upload endpoint.
 *
 * The server issues a UUID for the row and returns it as `photo_id` in
 * the response. We store that UUID against the screenshot so a later
 * delete can address the same row.
 */
export async function uploadScreenshot(
  shot: Screenshot,
  bidId: string,
  airlineAccessor: PluginAirlineAccessor,
  logger: PluginLogger,
): Promise<{ serverId: string; photoId: string | null }> {
  if (!fs.existsSync(shot.path)) {
    throw new Error(`file missing on disk: ${shot.path}`);
  }

  const airline = await requireAirline(airlineAccessor);
  // `airline.baseUrl` is the airline's Stratos endpoint root (e.g.,
  // `https://crew.example.com/api/stratos`) — already includes the API
  // prefix. Append only the leaf route, not `/api/stratos/...`.
  const url = `${airline.baseUrl}/screenshot/upload`;

  const buffer = await fs.promises.readFile(shot.path);
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeFor(shot.filename) });

  const form = new FormData();
  form.append("file", blob, shot.filename);
  form.append("bid_id", bidId);
  // Server validates `flight_data` as a string and json_decodes it. Sending
  // the captured telemetry lets the VA store rich context alongside the file.
  if (shot.telemetry) {
    form.append("flight_data", JSON.stringify(shot.telemetry));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${airline.token}` },
      body: form,
    });
  } catch (err) {
    logger.error(
      "Attach",
      `network error posting to ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new Error("network error reaching VA");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      detail = text.slice(0, 240);
    } catch {
      // ignore — fall through with status only
    }
    logger.warn(
      "Attach",
      `upload failed: ${res.status} ${res.statusText} ${detail}`,
    );
    throw new Error(`VA rejected upload (${res.status})`);
  }

  // Try to read the photo UUID from the response. The contract says the
  // server returns { photo_id: <uuid> }; if the body is empty or shaped
  // differently we fall back to null and the row just becomes non-deletable
  // from the plugin (the user can still remove it locally).
  let photoId: string | null = null;
  try {
    const body = (await res.clone().json()) as { photo_id?: unknown };
    if (typeof body?.photo_id === "string" && body.photo_id !== "") {
      photoId = body.photo_id;
    }
  } catch {
    // non-JSON body — leave photoId null
  }

  return { serverId: `va_${bidId}_${Date.now()}`, photoId };
}

/**
 * Tells the VA to delete the row identified by `photoId` (the UUID returned
 * from upload). Throws on any non-2xx so the caller can refuse the local
 * delete and let the user retry.
 */
export async function deleteUploadedScreenshot(
  photoId: string,
  airlineAccessor: PluginAirlineAccessor,
  logger: PluginLogger,
): Promise<void> {
  const airline = await requireAirline(airlineAccessor);
  const url = `${airline.baseUrl}/screenshot/delete?photo_id=${encodeURIComponent(photoId)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${airline.token}` },
    });
  } catch (err) {
    logger.error(
      "Attach",
      `network error deleting ${photoId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new Error("network error reaching VA");
  }

  if (!res.ok) {
    logger.warn(
      "Attach",
      `VA delete failed for ${photoId}: ${res.status} ${res.statusText}`,
    );
    throw new Error(`VA rejected delete (${res.status})`);
  }
}
