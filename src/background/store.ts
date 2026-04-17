import type { PluginConfigStore } from "@skyvexsoftware/stratos-sdk";
import type { Screenshot, WatchedFolder } from "@/shared/types";

const KEY_FOLDERS = "watchedFolders";
const KEY_SCREENSHOTS = "screenshots";
const SCREENSHOT_LIMIT = 500;

export class Store {
  constructor(private readonly config: PluginConfigStore) {}

  async listFolders(): Promise<WatchedFolder[]> {
    return (await this.config.get<WatchedFolder[]>(KEY_FOLDERS)) ?? [];
  }

  async addFolder(path: string): Promise<WatchedFolder[]> {
    const folders = await this.listFolders();
    if (folders.some((f) => f.path === path)) return folders;
    const next: WatchedFolder[] = [
      ...folders,
      {
        path,
        addedAt: Date.now(),
        status: "watching",
        fileCount: 0,
        lastSyncAt: null,
      },
    ];
    await this.config.set(KEY_FOLDERS, next);
    return next;
  }

  async removeFolder(path: string): Promise<WatchedFolder[]> {
    const folders = await this.listFolders();
    const next = folders.filter((f) => f.path !== path);
    await this.config.set(KEY_FOLDERS, next);
    return next;
  }

  async setFolderState(
    path: string,
    patch: Partial<Pick<WatchedFolder, "status" | "fileCount" | "lastSyncAt">>,
  ): Promise<WatchedFolder[]> {
    const folders = await this.listFolders();
    const next = folders.map((f) => (f.path === path ? { ...f, ...patch } : f));
    await this.config.set(KEY_FOLDERS, next);
    return next;
  }

  async listScreenshots(): Promise<Screenshot[]> {
    return (await this.config.get<Screenshot[]>(KEY_SCREENSHOTS)) ?? [];
  }

  async upsertScreenshot(shot: Screenshot): Promise<Screenshot[]> {
    const all = await this.listScreenshots();
    const idx = all.findIndex((s) => s.id === shot.id);
    let next: Screenshot[];
    if (idx >= 0) {
      next = [...all];
      next[idx] = shot;
    } else {
      next = [shot, ...all];
    }
    const trimmed = next.slice(0, SCREENSHOT_LIMIT);
    await this.config.set(KEY_SCREENSHOTS, trimmed);
    return trimmed;
  }

  async getScreenshot(id: string): Promise<Screenshot | undefined> {
    const all = await this.listScreenshots();
    return all.find((s) => s.id === id);
  }

  async deleteScreenshot(id: string): Promise<Screenshot[]> {
    const all = await this.listScreenshots();
    const next = all.filter((s) => s.id !== id);
    await this.config.set(KEY_SCREENSHOTS, next);
    return next;
  }
}
