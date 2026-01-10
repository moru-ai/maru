import { ModelType } from "@repo/types";
import { Button } from "@/components/ui/button";

export function ModelSelector({
  selectedModel: _selectedModel,
  handleSelectModel: _handleSelectModel,
}: {
  selectedModel: ModelType | null;
  handleSelectModel: (model: ModelType | null) => void;
}) {
  // Using Claude Agent SDK - just show "Claude" as the model
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground px-2 font-normal cursor-default"
      disabled
    >
      <span>Claude</span>
    </Button>
  );
}
