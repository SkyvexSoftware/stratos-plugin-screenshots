export const PLUGIN_ID = "screenshots";

export const API_PREFIX = `/api/${PLUGIN_ID}`;

export const SETTING_KEYS = {
  autoAttach: "autoAttach",
} as const;

export const ROUTES = {
  folders: `${API_PREFIX}/folders`,
  folderPick: `${API_PREFIX}/folders/pick`,
  folderRemove: (path: string) =>
    `${API_PREFIX}/folders?path=${encodeURIComponent(path)}`,
  screenshots: `${API_PREFIX}/screenshots`,
  screenshotAttach: (id: string) => `${API_PREFIX}/screenshots/${id}/attach`,
  screenshotDelete: (id: string) => `${API_PREFIX}/screenshots/${id}`,
  screenshotReveal: (id: string) =>
    `${API_PREFIX}/screenshots/${id}/reveal`,
  file: (id: string) => `${API_PREFIX}/file/${id}`,
} as const;

export const SOCKET_CHANNELS = {
  screenshotsUpdated: `plugin:${PLUGIN_ID}:screenshots:updated`,
  foldersUpdated: `plugin:${PLUGIN_ID}:folders:updated`,
} as const;
