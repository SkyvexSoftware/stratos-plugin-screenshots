import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  buttonVariants,
} from "@skyvexsoftware/stratos-sdk";
import type { Screenshot } from "@/shared/types";

type Props = {
  shot: Screenshot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ConfirmRemoveDialog({
  shot,
  open,
  onOpenChange,
  onConfirm,
}: Props) {
  // Mirrors the DELETE route: an uploaded shot is removed from the VA too.
  const uploaded =
    shot.attachment.status === "attached" && Boolean(shot.attachment.photoId);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove screenshot?</AlertDialogTitle>
          <AlertDialogDescription>
            {uploaded
              ? "This also deletes it from the airline's flight record. The file stays on your disk."
              : "It comes off this list. The file stays on your disk."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={onConfirm}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
