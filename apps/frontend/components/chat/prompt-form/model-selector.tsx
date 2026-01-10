import { ModelType } from "@repo/types";
import { useState } from "react";
import { useModal } from "@/components/layout/modal-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Box } from "lucide-react";

export function ModelSelector({
  selectedModel: _selectedModel,
  handleSelectModel: _handleSelectModel,
}: {
  selectedModel: ModelType | null;
  handleSelectModel: (model: ModelType | null) => void;
}) {
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const { openSettingsModal } = useModal();

  return (
    <Popover open={isModelSelectorOpen} onOpenChange={setIsModelSelectorOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:bg-accent px-2 font-normal"
            >
              <span>Claude</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {!isModelSelectorOpen && (
          <TooltipContent side="top" align="start" shortcut="⌘.">
            Model Selector
          </TooltipContent>
        )}
      </Tooltip>
      <PopoverContent
        align="start"
        className="flex flex-col gap-0.5 overflow-hidden rounded-lg p-0"
      >
        <div className="flex flex-col gap-0.5 rounded-lg p-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="hover:bg-accent justify-start font-normal"
            disabled
          >
            <span>Claude</span>
          </Button>
        </div>
        <button
          className="hover:bg-sidebar-accent flex h-9 w-full cursor-pointer items-center gap-2 border-t px-3 text-sm transition-colors"
          onClick={() => {
            setIsModelSelectorOpen(false);
            openSettingsModal("models");
          }}
        >
          <Box className="size-4" />
          <span>Manage API Keys</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
