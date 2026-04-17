import { useState } from "react";
import "./styles.css";
import { StatusStrip } from "./components/StatusStrip";
import { FoldersDialog } from "./components/FoldersDialog";
import { ScreenshotsFeed } from "./components/ScreenshotsFeed";
import { useFolders, useScreenshots } from "./hooks/useScreenshots";

export default function Plugin() {
  const { data: folders, refresh: refreshFolders } = useFolders();
  const { data: shots, refresh: refreshShots } = useScreenshots();
  const [foldersOpen, setFoldersOpen] = useState(false);

  const unreachableCount = folders.filter(
    (f) => f.status === "unreachable",
  ).length;

  return (
    <div className="@container/pane min-h-full bg-background text-foreground p-6 font-display scr-tnum">
      <div className="flex flex-col">
        <StatusStrip
          folderCount={folders.length}
          unreachableCount={unreachableCount}
          onConfigurePaths={() => setFoldersOpen(true)}
        />
        <ScreenshotsFeed
          shots={shots}
          folders={folders}
          onMutate={refreshShots}
        />
      </div>
      <FoldersDialog
        folders={folders}
        open={foldersOpen}
        onClose={() => setFoldersOpen(false)}
        onMutate={refreshFolders}
      />
    </div>
  );
}
