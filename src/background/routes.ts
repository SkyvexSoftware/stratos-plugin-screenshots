import * as fs from "fs";
import * as path from "path";
import express, { Router, type Request, type Response } from "express";
import { dialog, shell, BrowserWindow } from "electron";
import type { PluginContext } from "@skyvexsoftware/stratos-sdk";
import type { Screenshot } from "@/shared/types";
import { SETTING_KEYS, SOCKET_CHANNELS } from "@/shared/protocol";
import { Store } from "./store";
import { FolderWatchPool, type FileEvent } from "./watcher";
import { captureTelemetry, getActiveFlightBinding } from "./telemetry";
import { uploadScreenshot, deleteUploadedScreenshot } from "./attach";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
};

function newId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createRouter(
  ctx: PluginContext,
  store: Store,
  pool: FolderWatchPool,
): Router {
  const router = Router();

  // Shared VA API client: resolves the airline base URL + bearer per request
  // and refreshes the access token on a 401. Created once — the shell says it
  // is safe to cache for the lifetime of the background module — so a token
  // rotation mid-session recovers automatically instead of failing every
  // upload the way the old captured-token fetch did.
  const va = ctx.airline.createClient();

  router.use(express.json({ limit: "256kb" }));
  router.use((_, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const broadcastFolders = async () => {
    const folders = await store.listFolders();
    ctx.ipc.send(SOCKET_CHANNELS.foldersUpdated, folders);
  };

  const broadcastScreenshots = async () => {
    const list = await store.listScreenshots();
    ctx.ipc.send(SOCKET_CHANNELS.screenshotsUpdated, list);
  };

  const onFileDetected = async (event: FileEvent) => {
    try {
      // 1) Persist bare record so the UI can pick it up immediately.
      const id = newId();
      const baseShot: Screenshot = {
        id,
        path: event.filePath,
        filename: event.filename,
        watchedFolder: event.folderPath,
        capturedAt: Date.now(),
        fileSizeBytes: event.fileSizeBytes,
        telemetry: null,
        attachment: { status: "pending" },
      };
      await store.upsertScreenshot(baseShot);
      await store.setFolderState(event.folderPath, {
        fileCount: pool.countFiles(event.folderPath),
        lastSyncAt: Date.now(),
      });
      await broadcastFolders();
      await broadcastScreenshots();

      // 2) Capture telemetry AND the active flight binding from local
      // Stratos REST endpoints, in parallel so they share a moment in time.
      // The bid is pinned onto the shot here so that a delayed attach (auto
      // or manual) uses the bid the screenshot was actually taken under,
      // never the bid that happens to be active at attach time. This is the
      // fix for the back-to-back-flights mis-attribution bug.
      const [telemetry, binding] = await Promise.all([
        captureTelemetry(ctx.flight, ctx.logger),
        getActiveFlightBinding(ctx.flight, ctx.logger),
      ]);
      const tagged = await store.upsertScreenshot({
        ...baseShot,
        telemetry,
        capturedBidId: binding?.bidId ?? null,
      });
      await broadcastScreenshots();

      // 3) If autoAttach is on, fire attach immediately. Lets the user walk
      // away from the pane and still get screenshots delivered to the VA.
      const autoAttach = await ctx.config.get<boolean>(
        SETTING_KEYS.autoAttach,
        false,
      );
      const fresh = tagged.find((s) => s.id === id);
      if (autoAttach && fresh && fresh.attachment.status === "pending") {
        ctx.logger.info("AutoAttach", `Auto-attaching ${id}`);
        void runAttach(id);
      }
    } catch (err) {
      ctx.logger.error("Capture", `Failed to register ${event.filePath}: ${String(err)}`);
    }
  };

  pool.setHandler(onFileDetected);

  // ---------- folders ----------

  router.get("/folders", async (_req, res) => {
    res.json(await store.listFolders());
  });

  router.post("/folders/pick", async (_req, res) => {
    ctx.logger.info("Pick", "POST /folders/pick received");
    const parent =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ??
      undefined;
    ctx.logger.info(
      "Pick",
      `parent window: ${parent ? "yes" : "none"}; opening dialog…`,
    );

    let result;
    try {
      result = parent
        ? await dialog.showOpenDialog(parent, {
            title: "Watch folder for screenshots",
            properties: ["openDirectory", "multiSelections"],
          })
        : await dialog.showOpenDialog({
            title: "Watch folder for screenshots",
            properties: ["openDirectory", "multiSelections"],
          });
    } catch (err) {
      ctx.logger.error("Pick", `dialog.showOpenDialog threw: ${String(err)}`);
      res.status(500).json({ error: String(err) });
      return;
    }

    ctx.logger.info(
      "Pick",
      `dialog closed: cancelled=${result.canceled}, paths=${result.filePaths.length}`,
    );

    if (result.canceled || result.filePaths.length === 0) {
      res.json({ cancelled: true, folders: await store.listFolders() });
      return;
    }

    let folders = await store.listFolders();
    for (const folderPath of result.filePaths) {
      folders = await store.addFolder(folderPath);
      const ok = pool.watch(folderPath);
      await store.setFolderState(folderPath, {
        status: ok ? "watching" : "unreachable",
        fileCount: ok ? pool.countFiles(folderPath) : 0,
        lastSyncAt: ok ? Date.now() : null,
      });
    }
    folders = await store.listFolders();
    await broadcastFolders();
    res.json({ cancelled: false, folders });
  });

  router.delete("/folders", async (req: Request, res: Response) => {
    const folderPath = String(req.query.path ?? "");
    if (!folderPath) {
      res.status(400).json({ error: "missing path" });
      return;
    }
    pool.unwatch(folderPath);
    const folders = await store.removeFolder(folderPath);
    await broadcastFolders();
    res.json(folders);
  });

  // ---------- screenshots ----------

  router.get("/screenshots", async (_req, res) => {
    res.json(await store.listScreenshots());
  });

  // Run the attach flow: marks attaching → uploads to the VA through the
  // shared refresh-aware client → marks attached or error. Returns the final
  // Screenshot record, or one of these sentinels when attach can't even
  // start:
  //   NO_FLIGHT     — there is no active flight at all
  //   NO_BID        — there's a flight, but it isn't VA-sourced (no bid)
  //   WRONG_FLIGHT  — the shot is pinned to a different VA flight than the
  //                   one currently active. Refusing rather than silently
  //                   uploading against the new bid is the fix for the
  //                   back-to-back-flights mis-attribution bug.
  const NO_FLIGHT = Symbol("no-flight");
  const NO_BID = Symbol("no-bid");
  const WRONG_FLIGHT = Symbol("wrong-flight");
  type AttachResult =
    | Screenshot
    | null
    | typeof NO_FLIGHT
    | typeof NO_BID
    | typeof WRONG_FLIGHT;

  const runAttach = async (id: string): Promise<AttachResult> => {
    const shot = await store.getScreenshot(id);
    if (!shot) return null;

    const capturedBidId = shot.capturedBidId ?? null;
    const binding = await getActiveFlightBinding(ctx.flight, ctx.logger);

    // Pick the bid to upload against. When the shot was pinned at capture
    // (capturedBidId != null), we *only* upload if the active flight still
    // matches it. When there's no pin (legacy shot or captured outside any
    // VA flight), we fall back to the live binding so the user can still
    // attach to the current flight as a deliberate action.
    let targetBidId: string;
    if (capturedBidId != null) {
      if (!binding || binding.bidId !== capturedBidId) return WRONG_FLIGHT;
      targetBidId = capturedBidId;
    } else {
      if (!binding) return NO_FLIGHT;
      if (binding.bidId == null) return NO_BID;
      targetBidId = binding.bidId;
    }

    await store.upsertScreenshot({
      ...shot,
      attachment: { status: "attaching" },
    });
    await broadcastScreenshots();

    try {
      const { serverId, photoId } = await uploadScreenshot(
        shot,
        targetBidId,
        va,
        ctx.logger,
      );
      const final = await store.upsertScreenshot({
        ...shot,
        attachment: {
          status: "attached",
          serverId,
          attachedAt: Date.now(),
          bidId: targetBidId,
          photoId,
        },
      });
      await broadcastScreenshots();
      // A success means the pipeline is healthy again — clear any "failed"
      // flag we may have raised on the sidebar from an earlier attempt.
      void ctx.plugin.clearIndicator().catch(() => {});
      return final.find((s) => s.id === id) ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errored = await store.upsertScreenshot({
        ...shot,
        attachment: {
          status: "error",
          error: message,
          failedAt: Date.now(),
        },
      });
      await broadcastScreenshots();
      // Surface the failure even when the pilot can't see the card — auto-attach
      // fires with the pane closed, and a manual attach may be scrolled out of
      // view. The toast is the immediate signal; the sidebar indicator persists
      // until they open the plugin. Both are fire-and-forget: a notification
      // failing must not mask the upload error itself.
      void ctx.notify
        .toast({
          type: "error",
          title: "Screenshot not attached",
          message,
        })
        .catch(() => {});
      void ctx.plugin
        .setIndicator({
          type: "warning",
          tooltip: "A screenshot failed to attach to your flight",
          dismissOnOpen: true,
        })
        .catch(() => {});
      return errored.find((s) => s.id === id) ?? null;
    }
  };

  router.post("/screenshots/:id/attach", async (req, res) => {
    const result = await runAttach(req.params.id);
    if (result === null) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (result === NO_FLIGHT) {
      res.status(409).json({
        error: "no-active-flight",
        message: "Start a flight before attaching screenshots.",
      });
      return;
    }
    if (result === NO_BID) {
      res.status(409).json({
        error: "no-va-bid",
        message:
          "This flight isn't booked through the VA, so screenshots can't be attached to a PIREP.",
      });
      return;
    }
    if (result === WRONG_FLIGHT) {
      res.status(409).json({
        error: "wrong-flight",
        message:
          "This screenshot was captured during a different flight and can't be attached to the current one.",
      });
      return;
    }
    res.status(result.attachment.status === "error" ? 502 : 200).json(result);
  });

  router.post("/screenshots/:id/reveal", async (req, res) => {
    const shot = await store.getScreenshot(req.params.id);
    if (!shot) {
      res.status(404).json({ error: "not found" });
      return;
    }
    shell.showItemInFolder(shot.path);
    res.json({ ok: true });
  });

  router.delete("/screenshots/:id", async (req, res) => {
    const shot = await store.getScreenshot(req.params.id);
    if (!shot) {
      res.status(404).json({ error: "not found" });
      return;
    }

    // If the shot was uploaded to the VA, remove it server-side first so the
    // two views stay in sync. We refuse the local delete on VA failure so the
    // user can retry rather than silently orphaning the row server-side.
    if (
      shot.attachment.status === "attached" &&
      shot.attachment.photoId
    ) {
      try {
        await deleteUploadedScreenshot(
          shot.attachment.photoId,
          va,
          ctx.logger,
        );
      } catch (err) {
        res.status(502).json({
          error: "va-delete-failed",
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }

    await store.deleteScreenshot(req.params.id);
    await broadcastScreenshots();
    res.json({ ok: true });
  });

  // ---------- file streaming ----------

  router.get("/file/:id", async (req, res) => {
    const shot = await store.getScreenshot(req.params.id);
    if (!shot) {
      res.status(404).end();
      return;
    }
    if (!fs.existsSync(shot.path)) {
      res.status(410).end();
      return;
    }
    const ext = path.extname(shot.path).toLowerCase();
    res.setHeader("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=300");
    fs.createReadStream(shot.path).pipe(res);
  });

  return router;
}
