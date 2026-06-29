import * as fs from "fs";
import * as path from "path";
import type { PluginLogger } from "@skyvexsoftware/stratos-sdk";
import type { Screenshot } from "@/shared/types";

/**
 * The plugin talks to the bound VA's backend through the shell's shared VA
 * API client (`ctx.airline.createClient()`). That axios instance resolves the
 * airline base URL + the pilot's bearer per request and transparently
 * refreshes the access token on a 401 — so we no longer hand-roll `fetch`
 * with a captured `airline.token` (which went stale the moment the access
 * token rotated, with no way to recover). We hand it the leaf route only;
 * the client's baseURL is already the airline's API root.
 *
 * Uploads are multipart. The client defaults its `Content-Type` to
 * `application/json`, which would clobber axios's automatic multipart
 * boundary if we passed it a `FormData`, so we build the body ourselves with
 * an explicit boundary (the same approach the SDK's own deploy uploader uses)
 * and override `Content-Type` on the single request.
 */

/**
 * Minimal structural shape of the shell's VA API client (the axios instance
 * from `ctx.airline.createClient()`). Typed structurally so this module needs
 * no axios import. `post`/`delete` resolve on 2xx and reject on any other
 * status (axios default), carrying the server's status + parsed body on
 * `err.response`.
 */
export type VaClient = {
  post<T>(
    url: string,
    data: unknown,
    config?: VaRequestConfig,
  ): Promise<{ data: T }>;
  delete<T>(url: string, config?: VaRequestConfig): Promise<{ data: T }>;
};

type VaRequestConfig = {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  /** 0 disables redirect-following so a validation redirect-back can't read as success. */
  maxRedirects?: number;
};

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

/**
 * Hand-build a multipart/form-data body so we control the boundary and can set
 * `Content-Type` explicitly on the request — overriding the VA client's JSON
 * default. Mirrors the SDK's `bin/deploy.js` upload encoding.
 */
function buildMultipart(
  file: { buffer: Buffer; filename: string; contentType: string },
  fields: Record<string, string>,
): { body: Buffer; contentType: string } {
  const boundary = `----StratosScreenshot${Date.now().toString(16)}${Math.random()
    .toString(16)
    .slice(2, 10)}`;
  // Filenames come off disk; strip CR/LF/quotes so they can't break the header.
  const safeName = file.filename.replace(/[\r\n"]/g, "_");
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n`,
    ),
  );
  parts.push(file.buffer);
  parts.push(Buffer.from("\r\n"));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Shape of an axios-style error we read status + body off of. */
type VaErrorLike = {
  response?: { status?: number; statusText?: string; data?: unknown };
  message?: string;
};

/** Pull a human-readable message out of a VA error body (Laravel-style or string). */
function describeBody(data: unknown): string {
  if (typeof data === "string") return data.trim().slice(0, 240);
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message.slice(0, 240);
    if (typeof o.error === "string" && o.error) return o.error.slice(0, 240);
    try {
      return JSON.stringify(o).slice(0, 240);
    } catch {
      // unserialisable body — fall through
    }
  }
  return "";
}

/**
 * Turn a thrown VA-client error into a single user-facing line. We surface the
 * server's actual status *and* its response detail (the 400's validation
 * message, etc.) instead of swallowing it, so the pilot can see *why* an
 * upload was rejected — a 400 with no explanation was the original bug.
 */
function describeVaError(err: unknown, action: string): string {
  const e = err as VaErrorLike;
  const res = e?.response;
  if (res && typeof res.status === "number") {
    if (res.status === 401 || res.status === 419) {
      return "VA session expired — please sign in again";
    }
    const detail = describeBody(res.data);
    return `VA rejected ${action} (${res.status})${detail ? `: ${detail}` : ""}`;
  }
  // No response object → network failure or a blocked redirect. Either way it
  // is never a success, so we surface it as a hard failure.
  const reason = typeof e?.message === "string" ? e.message : String(err);
  return `Couldn't reach the VA to ${action} the screenshot${reason ? ` (${reason})` : ""}`;
}

/**
 * Uploads the screenshot file to the VA's POST /screenshot/upload endpoint
 * through the shared VA client.
 *
 * The server issues a UUID for the row and returns it as `photo_id` in the
 * response. We store that UUID against the screenshot so a later delete can
 * address the same row.
 */
export async function uploadScreenshot(
  shot: Screenshot,
  bidId: string,
  va: VaClient,
  logger: PluginLogger,
): Promise<{ serverId: string; photoId: string | null }> {
  if (!fs.existsSync(shot.path)) {
    throw new Error(`file missing on disk: ${shot.path}`);
  }

  const buffer = await fs.promises.readFile(shot.path);
  const fields: Record<string, string> = { bid_id: bidId };
  // Server validates `flight_data` as a string and json_decodes it. Sending
  // the captured telemetry lets the VA store rich context alongside the file.
  if (shot.telemetry) {
    fields.flight_data = JSON.stringify(shot.telemetry);
  }
  const { body, contentType } = buildMultipart(
    { buffer, filename: shot.filename, contentType: mimeFor(shot.filename) },
    fields,
  );

  let data: { photo_id?: unknown };
  try {
    const res = await va.post<{ photo_id?: unknown }>(
      "/screenshot/upload",
      body,
      {
        headers: {
          // Override the client's default JSON content-type with our multipart
          // boundary, and force a JSON error contract: a failed Laravel
          // validate() answers a 302 redirect-back unless we ask for JSON,
          // which (followed) would land on a 200 HTML page and look like
          // success. JSON + no redirects keeps a rejection a clean 4xx.
          "Content-Type": contentType,
          Accept: "application/json",
        },
        maxRedirects: 0,
      },
    );
    data = res.data ?? {};
  } catch (err) {
    const message = describeVaError(err, "upload");
    logger.warn("Attach", `upload to /screenshot/upload failed: ${message}`);
    throw new Error(message);
  }

  // Read the photo UUID from the response. The contract says the server
  // returns { photo_id: <uuid> }; if the body is empty or shaped differently
  // we fall back to null and the row just becomes non-deletable from the
  // plugin (the user can still remove it locally).
  let photoId: string | null = null;
  if (typeof data?.photo_id === "string" && data.photo_id !== "") {
    photoId = data.photo_id;
  }

  return { serverId: `va_${bidId}_${Date.now()}`, photoId };
}

/**
 * Tells the VA to delete the row identified by `photoId` (the UUID returned
 * from upload). Throws on any non-2xx (axios default) so the caller can refuse
 * the local delete and let the user retry.
 */
export async function deleteUploadedScreenshot(
  photoId: string,
  va: VaClient,
  logger: PluginLogger,
): Promise<void> {
  try {
    await va.delete("/screenshot/delete", {
      headers: { Accept: "application/json" },
      params: { photo_id: photoId },
      maxRedirects: 0,
    });
  } catch (err) {
    const message = describeVaError(err, "delete");
    logger.warn("Attach", `VA delete failed for ${photoId}: ${message}`);
    throw new Error(message);
  }
}
