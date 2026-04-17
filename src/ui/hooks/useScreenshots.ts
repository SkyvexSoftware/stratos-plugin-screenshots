import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Screenshot, WatchedFolder } from "@/shared/types";

// Plugin sockets aren't implemented in the shell yet, so we poll for
// background-driven changes (folder additions detected on disk, new
// captures from the watcher). Mutations also call refresh() directly so
// the UI updates immediately without waiting for the next tick.
const FOLDER_POLL_MS = 10_000;
const SHOTS_POLL_MS = 2_500;

function usePolledList<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  empty: T,
): { data: T; refresh: () => Promise<void> } {
  const [data, setData] = useState<T>(empty);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetcher();
      if (!cancelledRef.current) setData(next);
    } catch {
      // swallow; next tick will retry
    }
  }, [fetcher]);

  useEffect(() => {
    cancelledRef.current = false;
    void refresh();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, intervalMs]);

  return { data, refresh };
}

export function useFolders() {
  return usePolledList<WatchedFolder[]>(
    api.listFolders,
    FOLDER_POLL_MS,
    [],
  );
}

export function useScreenshots() {
  return usePolledList<Screenshot[]>(
    api.listScreenshots,
    SHOTS_POLL_MS,
    [],
  );
}
