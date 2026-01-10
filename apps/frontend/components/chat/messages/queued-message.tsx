import { ListEnd, X } from "lucide-react";
import { Button } from "../../ui/button";
import { useParams } from "next/navigation";
import { useQueuedAction } from "@/hooks/chat/use-queued-action";
import { useTaskSocketContext } from "@/contexts/task-socket-context";
import { useQueryClient } from "@tanstack/react-query";

export function QueuedAction() {
  const { taskId } = useParams<{ taskId: string }>();

  const queryClient = useQueryClient();
  const { clearQueuedAction } = useTaskSocketContext();
  const { data: queuedAction } = useQueuedAction(taskId);

  if (!queuedAction) return null;

  return (
    <div className="bg-card border-border animate-in fade-in absolute -top-12 left-0 flex w-full items-center justify-between gap-2 rounded-lg border py-1.5 pl-3 pr-1.5 text-sm duration-150">
      <div className="flex items-center gap-1.5 overflow-hidden">
        <ListEnd className="size-4" />
        <span className="select-none whitespace-nowrap">Queued Message</span>
        <span className="text-muted-foreground truncate">
          {queuedAction.message}
        </span>
      </div>
      <Button
        variant="ghost"
        size="iconXs"
        className="text-muted-foreground hover:text-foreground hover:bg-sidebar-border p-0"
        onClick={() => {
          queryClient.setQueryData(["queued-action", taskId], null);
          clearQueuedAction();
        }}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
