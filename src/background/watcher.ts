import * as fs from "fs";
import * as path from "path";
import type { PluginLogger } from "@skyvexsoftware/stratos-sdk";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp"]);
const STABILITY_MS = 600;

const isImage = (file: string) =>
  IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase());

export type FileEvent = {
  folderPath: string;
  filePath: string;
  filename: string;
  fileSizeBytes: number | null;
};

export type FileEventHandler = (event: FileEvent) => void;

type Entry = {
  watcher: fs.FSWatcher;
  baseline: Set<string>;
  pending: Map<string, NodeJS.Timeout>;
};

export class FolderWatchPool {
  private readonly entries = new Map<string, Entry>();
  private onAdd: FileEventHandler = () => {};

  constructor(private readonly logger: PluginLogger) {}

  setHandler(handler: FileEventHandler): void {
    this.onAdd = handler;
  }

  watch(folderPath: string): boolean {
    if (this.entries.has(folderPath)) return true;
    if (!fs.existsSync(folderPath)) {
      this.logger.warn("Watcher", `Path missing, skipping: ${folderPath}`);
      return false;
    }

    let baseline: Set<string>;
    try {
      baseline = new Set(
        fs
          .readdirSync(folderPath)
          .filter((f) => isImage(f))
          .map((f) => path.join(folderPath, f)),
      );
    } catch (err) {
      this.logger.error(
        "Watcher",
        `Failed to enumerate ${folderPath}: ${String(err)}`,
      );
      return false;
    }

    const pending = new Map<string, NodeJS.Timeout>();

    const watcher = fs.watch(folderPath, (eventType, filename) => {
      if (!filename) return;
      const filePath = path.join(folderPath, String(filename));
      if (!isImage(filePath)) return;
      // Defer until the file is stable (write completed).
      const existing = pending.get(filePath);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        pending.delete(filePath);
        let stat: fs.Stats | null = null;
        try {
          stat = fs.statSync(filePath);
        } catch {
          return; // gone
        }
        if (entry.baseline.has(filePath)) return;
        entry.baseline.add(filePath);
        this.onAdd({
          folderPath,
          filePath,
          filename: path.basename(filePath),
          fileSizeBytes: stat.size,
        });
      }, STABILITY_MS);
      pending.set(filePath, timer);
    });

    watcher.on("error", (error) => {
      this.logger.error("Watcher", `Error on ${folderPath}: ${String(error)}`);
    });

    const entry: Entry = { watcher, baseline, pending };
    this.entries.set(folderPath, entry);
    this.logger.info(
      "Watcher",
      `Watching ${folderPath} (baseline ${baseline.size} files)`,
    );
    return true;
  }

  unwatch(folderPath: string): void {
    const entry = this.entries.get(folderPath);
    if (!entry) return;
    entry.watcher.close();
    for (const t of entry.pending.values()) clearTimeout(t);
    this.entries.delete(folderPath);
    this.logger.info("Watcher", `Unwatched ${folderPath}`);
  }

  async closeAll(): Promise<void> {
    for (const folderPath of [...this.entries.keys()]) this.unwatch(folderPath);
  }

  countFiles(folderPath: string): number {
    try {
      return fs.readdirSync(folderPath).filter(isImage).length;
    } catch {
      return 0;
    }
  }
}
