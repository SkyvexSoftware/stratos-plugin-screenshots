import { useCallback, useEffect, useRef, useState } from "react";
import { usePluginContext } from "@skyvexsoftware/stratos-sdk";
import { api } from "../api";
import { SOCKET_CHANNELS } from "@/shared/protocol";
import type { Screenshot, WatchedFolder } from "@/shared/types";

// Initial state comes from an HTTP fetch; thereafter the background
// pushes updates over `ctx.ipc.send` whenever the watcher detects new
// captures or folder changes. Mutations still call refresh() directly
// for instant feedback without waiting for the next broadcast.
function useSocketBackedList<T>(
  fetcher: () => Promise<T>,
  channel: string,
  empty: T,
): { data: T; refresh: () => Promise<void> } {
  const [data, setData] = useState<T>(empty);
  const cancelledRef = useRef(false);
  const { socket } = usePluginContext();

  const refresh = useCallback(async () => {
    try {
      const next = await fetcher();
      if (!cancelledRef.current) setData(next);
    } catch {
      // swallow; later events or manual refresh will recover
    }
  }, [fetcher]);

  useEffect(() => {
    cancelledRef.current = false;
    void refresh();

    const handler = (payload: unknown) => {
      if (cancelledRef.current) return;
      if (Array.isArray(payload)) {
        setData(payload as T);
      } else {
        // Background sent something unexpected; fall back to refetch.
        void refresh();
      }
    };
    socket.on(channel, handler);

    return () => {
      cancelledRef.current = true;
      socket.off(channel, handler);
    };
  }, [refresh, socket, channel]);

  return { data, refresh };
}

export function useFolders() {
  return useSocketBackedList<WatchedFolder[]>(
    api.listFolders,
    SOCKET_CHANNELS.foldersUpdated,
    [],
  );
}

export function useScreenshots() {
  return useSocketBackedList<Screenshot[]>(
    api.listScreenshots,
    SOCKET_CHANNELS.screenshotsUpdated,
    [],
  );
}
