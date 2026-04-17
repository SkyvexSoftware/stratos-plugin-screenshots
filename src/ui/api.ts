import { STRATOS_APP_BASE } from "@skyvexsoftware/stratos-sdk/helpers";
import { ROUTES } from "@/shared/protocol";
import type { Screenshot, WatchedFolder } from "@/shared/types";

const url = (route: string) => `${STRATOS_APP_BASE}${route}`;

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
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
      (r) => r.json() as Promise<Screenshot>,
    ),

  deleteScreenshot: (id: string) =>
    fetch(url(ROUTES.screenshotDelete(id)), { method: "DELETE" }).then(
      jsonOrThrow<{ ok: true }>,
    ),

  revealScreenshot: (id: string) =>
    fetch(url(ROUTES.screenshotReveal(id)), { method: "POST" }),

  fileUrl: (id: string) => url(ROUTES.file(id)),
};
