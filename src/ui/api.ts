import { STRATOS_APP_BASE } from "@skyvexsoftware/stratos-sdk/helpers";
import { ROUTES } from "@/shared/protocol";
import type { Screenshot, WatchedFolder } from "@/shared/types";

const url = (route: string) => `${STRATOS_APP_BASE}${route}`;

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/**
 * Parse an attach response, throwing on failure so the caller isn't handed a
 * silent non-2xx. The background answers a rejected attach with either
 * `{ error, message }` (the 4xx gate cases: no flight / no bid / wrong flight)
 * or the errored Screenshot record with a 502 (a VA upload rejection). Either
 * way we surface the most specific message we can find rather than treating
 * the body as a successful Screenshot.
 */
async function attachResultOrThrow(res: Response): Promise<Screenshot> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const fromBody =
      body && typeof body === "object"
        ? ((body as Record<string, unknown>).message ??
          (body as Record<string, unknown>).error ??
          ((body as Record<string, unknown>).attachment as
            | Record<string, unknown>
            | undefined)?.error)
        : null;
    throw new Error(
      typeof fromBody === "string" && fromBody
        ? fromBody
        : `${res.status} ${res.statusText}`,
    );
  }
  return body as Screenshot;
}

export const api = {
  listFolders: () =>
    fetch(url(ROUTES.folders)).then(jsonOrThrow<WatchedFolder[]>),

  pickFolders: () =>
    fetch(url(ROUTES.folderPick), { method: "POST" }).then(
      jsonOrThrow<{ cancelled: boolean; folders: WatchedFolder[] }>,
    ),

  removeFolder: (path: string) =>
    fetch(url(ROUTES.folderRemove(path)), { method: "DELETE" }).then(
      jsonOrThrow<WatchedFolder[]>,
    ),

  listScreenshots: () =>
    fetch(url(ROUTES.screenshots)).then(jsonOrThrow<Screenshot[]>),

  attachScreenshot: (id: string) =>
    fetch(url(ROUTES.screenshotAttach(id)), { method: "POST" }).then(
      attachResultOrThrow,
    ),

  deleteScreenshot: (id: string) =>
    fetch(url(ROUTES.screenshotDelete(id)), { method: "DELETE" }).then(
      jsonOrThrow<{ ok: true }>,
    ),

  revealScreenshot: (id: string) =>
    fetch(url(ROUTES.screenshotReveal(id)), { method: "POST" }),

  fileUrl: (id: string) => url(ROUTES.file(id)),
};
