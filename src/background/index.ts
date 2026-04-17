import { createPlugin } from "@skyvexsoftware/stratos-sdk/helpers";
import { API_PREFIX } from "@/shared/protocol";
import { Store } from "./store";
import { FolderWatchPool } from "./watcher";
import { createRouter } from "./routes";

export default createPlugin({
  async onStart(ctx) {
    ctx.logger.info("Boot", "Screenshots plugin starting");

    const store = new Store(ctx.config);
    const pool = new FolderWatchPool(ctx.logger);
    const router = createRouter(ctx, store, pool);
    ctx.server.registerRouter(API_PREFIX, router);

    const folders = await store.listFolders();
    for (const folder of folders) {
      const ok = pool.watch(folder.path);
      await store.setFolderState(folder.path, {
        status: ok ? "watching" : "unreachable",
        fileCount: ok ? pool.countFiles(folder.path) : folder.fileCount,
      });
    }

    ctx.logger.info(
      "Boot",
      `Watching ${folders.length} folder(s); routes mounted at ${API_PREFIX}`,
    );

    (ctx as unknown as { __screenshotsPool?: FolderWatchPool }).__screenshotsPool = pool;
  },

  async onStop(ctx) {
    const pool = (ctx as unknown as { __screenshotsPool?: FolderWatchPool })
      .__screenshotsPool;
    if (pool) await pool.closeAll();
    ctx.logger.info("Boot", "Screenshots plugin stopped");
  },
});
