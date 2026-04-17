import { useState } from "react";
import { api } from "../api";
import { fmtSync, fmtUnreachable, splitPath } from "../format";
import type { WatchedFolder } from "@/shared/types";

type Props = {
  folders: WatchedFolder[];
  onMutate: () => void | Promise<void>;
};

export function WatchedFolders({ folders, onMutate }: Props) {
  const [busy, setBusy] = useState(false);

  const onAdd = async () => {
    setBusy(true);
    try {
      await api.pickFolders();
    } catch (err) {
      console.error("[screenshots] pickFolders failed:", err);
      alert(`Pick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      void onMutate();
    }
  };

  const onRemove = async (path: string) => {
    try {
      await api.removeFolder(path);
    } catch (err) {
      console.error("[screenshots] removeFolder failed:", err);
    } finally {
      void onMutate();
    }
  };

  return (
    <section className="pb-3">
      {folders.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col">
          {folders.map((f) => (
            <FolderRow key={f.path} folder={f} onRemove={onRemove} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="block w-[calc(100%-1.75rem)] mx-3.5 mt-3 px-3 py-2.5 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground hover:bg-foreground/5 font-mono text-[10px] uppercase tracking-[0.16em] font-medium text-center transition-colors duration-75 disabled:opacity-40 disabled:cursor-progress"
      >
        <span className="mr-1.5">+</span>
        {busy ? "Selecting…" : "Add folder"}
      </button>
    </section>
  );
}

function Empty() {
  return (
    <div className="px-4 py-9 text-center font-mono">
      <div className="text-[10px] text-muted-foreground/70 tracking-[0.22em] uppercase mb-3 flex items-center gap-2.5 justify-center before:content-[''] before:w-6 before:h-px before:bg-current before:opacity-60 after:content-[''] after:w-6 after:h-px after:bg-current after:opacity-60">
        // awaiting signal
      </div>
      <div className="text-xs text-muted-foreground tracking-[0.14em] uppercase font-medium">
        No paths configured
      </div>
      <p className="mt-2.5 text-[10px] text-muted-foreground/70 leading-relaxed max-w-[28rem] mx-auto">
        Add a folder below. Stratos will watch it and auto-tag every capture
        with live telemetry from your active flight.
      </p>
    </div>
  );
}

function FolderRow({
  folder,
  onRemove,
}: {
  folder: WatchedFolder;
  onRemove: (path: string) => void;
}) {
  const { head, tail } = splitPath(folder.path);
  const isDown = folder.status === "unreachable";

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 border-t border-border font-mono text-[11px] text-muted-foreground hover:bg-foreground/5 transition-colors duration-75">
      <span
        className={[
          "w-1.5 h-1.5 rounded-full shrink-0",
          isDown
            ? "bg-destructive"
            : "bg-accent-green shadow-[0_0_4px_rgba(77,255,166,0.4)]",
        ].join(" ")}
      />
      <div
        className="flex-1 min-w-0 flex overflow-hidden whitespace-nowrap"
        title={folder.path}
      >
        <span className="shrink overflow-hidden text-ellipsis text-muted-foreground">
          {head}
        </span>
        <span className="shrink-0 text-foreground">{tail}</span>
      </div>
      <span
        className={[
          "shrink-0 hidden @[640px]/pane:inline text-[9.5px] tracking-[0.08em]",
          isDown ? "text-destructive" : "text-muted-foreground/50",
        ].join(" ")}
      >
        {isDown ? fmtUnreachable(folder.lastSyncAt) : fmtSync(folder.lastSyncAt)}
      </span>
      <div
        className={[
          "shrink-0 text-[10px] tracking-wide uppercase",
          isDown ? "text-destructive" : "text-muted-foreground",
        ].join(" ")}
      >
        {isDown ? (
          "Offline"
        ) : (
          <>
            <span className="text-foreground font-semibold">
              {folder.fileCount}
            </span>{" "}
            files
          </>
        )}
      </div>
      <button
        type="button"
        aria-label={`Unwatch ${folder.path}`}
        onClick={() => onRemove(folder.path)}
        className="shrink-0 px-1.5 py-0.5 text-base leading-none text-muted-foreground/40 hover:text-destructive transition-colors duration-75 cursor-pointer"
      >
        ×
      </button>
    </div>
  );
}
