import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@skyvexsoftware/stratos-sdk";

/**
 * SDK tooltip around a single control. The shell's TooltipProvider opens it
 * with no delay, unlike a native `title`. A disabled <button> fires no pointer
 * events, so blocked controls use `aria-disabled` to keep their hint.
 */
export function Hint({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent collisionPadding={8} className="max-w-72">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
