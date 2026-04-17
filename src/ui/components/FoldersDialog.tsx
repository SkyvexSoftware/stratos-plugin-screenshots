import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@skyvexsoftware/stratos-sdk";
import { WatchedFolders } from "./WatchedFolders";
import type { WatchedFolder } from "@/shared/types";

type Props = {
  folders: WatchedFolder[];
  open: boolean;
  onClose: () => void;
  onMutate: () => void | Promise<void>;
};

export function FoldersDialog({ folders, open, onClose, onMutate }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden border-border">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground font-normal">
            <span className="text-primary">//</span> Watched Paths
          </DialogTitle>
          <DialogDescription className="sr-only">
            Manage the folders Stratos watches for new screenshots.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          <WatchedFolders folders={folders} onMutate={onMutate} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
