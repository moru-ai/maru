"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useApiKeys,
  useSaveApiKey,
  useClearApiKey,
  useApiKeyValidation,
  useSaveApiKeyValidation,
} from "@/hooks/api-keys/use-api-keys";
import { useValidateApiKeys } from "@/hooks/api-keys/use-api-key-validation";
import {
  Loader2,
  Trash,
  CheckCircle2,
  X,
  Settings,
  Eye,
  EyeOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDebounceCallbackWithCancel } from "@/lib/debounce";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiKeyProvider,
  getProviderDefaultModel,
  getModelProvider,
} from "@repo/types";
import { useModal } from "@/components/layout/modal-context";
import { getModelSelectorCookie } from "@/lib/actions/model-selector-cookie";
import { useSetSelectedModel } from "@/hooks/chat/use-selected-model";
import { getValidationResult } from "@/lib/types/validation";

export function ModelSettings() {
  const { data: apiKeys, isLoading: isLoadingApiKeys } = useApiKeys();
  const { data: validationState } = useApiKeyValidation();
  const saveApiKeyMutation = useSaveApiKey();
  const clearApiKeyMutation = useClearApiKey();
  const validateApiKeysMutation = useValidateApiKeys();
  const saveValidationMutation = useSaveApiKeyValidation();
  const queryClient = useQueryClient();
  const { openProviderConfig } = useModal();
  const setSelectedModelMutation = useSetSelectedModel();

  const [anthropicInput, setAnthropicInput] = useState(
    apiKeys?.anthropic ?? ""
  );
  const [savingAnthropic, setSavingAnthropic] = useState(false);

  const [apiKeyVisibility, setApiKeyVisibility] = useState<
    Record<ApiKeyProvider, boolean>
  >({
    anthropic: false,
  } as Record<ApiKeyProvider, boolean>);

  const handleToggleShowApiKey = (provider: ApiKeyProvider) => {
    setApiKeyVisibility((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  const renderValidationIcon = (provider: string) => {
    const result = validationState?.[provider as keyof typeof validationState];
    if (!result || !apiKeys?.[provider as keyof typeof apiKeys]) return null;

    if (result.isValid) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCircle2 className="size-3.5 text-green-400" />
          </TooltipTrigger>
          <TooltipContent>Valid API key</TooltipContent>
        </Tooltip>
      );
    } else {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <X className="text-destructive size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{result.error || "Invalid API key"}</TooltipContent>
        </Tooltip>
      );
    }
  };

  useEffect(() => {
    setAnthropicInput(apiKeys?.anthropic ?? "");
  }, [apiKeys]);

  const saveApiKey = async (provider: ApiKeyProvider, key: string) => {
    // Only save if key is different from current saved value
    const currentKey = provider === "anthropic" ? apiKeys?.anthropic : undefined;
    if (key === currentKey) {
      if (provider === "anthropic") setSavingAnthropic(false);
      return;
    }

    // Detect if this will be a 0→1 API key transition
    const currentKeyCount = Object.values(apiKeys || {}).filter((k) =>
      k?.trim()
    ).length;
    const hadKeyBefore = !!apiKeys?.[provider]?.trim();
    const isFirstApiKey = currentKeyCount === 0 && key.trim() && !hadKeyBefore;

    try {
      await saveApiKeyMutation.mutateAsync({ provider, key });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });

      // Validate the key after saving if it's not empty
      const trimmedKey = key.trim();
      if (trimmedKey) {
        try {
          // Wait a bit for the API key to be saved before validating
          await new Promise((resolve) => setTimeout(resolve, 100));

          const results = await validateApiKeysMutation.mutateAsync(provider);

          // Save validation results for each provider that was validated
          const savePromises = Object.entries(results)
            .filter(([key]) => key !== "individualVerification")
            .map(async ([validationProvider, result]) => {
              try {
                await saveValidationMutation.mutateAsync({
                  provider: validationProvider as ApiKeyProvider,
                  validation: result,
                });
              } catch (saveError) {
                console.error(
                  `Failed to save validation for ${validationProvider}:`,
                  saveError
                );
              }
            });

          await Promise.all(savePromises);

          // Show toast notification for individual validation
          if (results.individualVerification) {
            const validationResult = getValidationResult(results, provider);
            if (validationResult?.isValid) {
              toast.success(
                `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key validated successfully!`
              );

              // Auto-select first model if this was the user's first API key
              if (isFirstApiKey) {
                try {
                  const firstModel = getProviderDefaultModel(provider);
                  await setSelectedModelMutation.mutateAsync(firstModel);
                } catch (error) {
                  console.error("Failed to auto-select model:", error);
                }
              }
            } else {
              toast.error(
                `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key validation failed: ${validationResult?.error || "Unknown error"}`
              );
            }
          }

          // Invalidate validation query to refresh the UI
          queryClient.invalidateQueries({ queryKey: ["api-key-validation"] });
        } catch (validationError) {
          console.error("Validation failed:", validationError);
          // Don't throw here - we still want to save the API key even if validation fails
        }
      } else {
        // Clear validation result if key is empty
        await saveValidationMutation.mutateAsync({
          provider,
          validation: null,
        });
        queryClient.invalidateQueries({ queryKey: ["api-key-validation"] });
      }
    } catch (_error) {
      const providerName = provider === "anthropic" ? "Anthropic" : "Unknown";
      toast.error(`Failed to save ${providerName} API key`);
    } finally {
      if (provider === "anthropic") setSavingAnthropic(false);
    }
  };

  const {
    debouncedCallback: debouncedSaveAnthropic,
    cancel: cancelAnthropicSave,
  } = useDebounceCallbackWithCancel(
    (key: string) => saveApiKey("anthropic", key),
    200
  );

  const handleAnthropicChange = (value: string) => {
    setAnthropicInput(value);
    setSavingAnthropic(true);
    debouncedSaveAnthropic(value);
  };

  const handleClearApiKey = async (provider: ApiKeyProvider) => {
    try {
      // Check if currently selected model belongs to this provider and clear it if so
      try {
        const currentModel = await getModelSelectorCookie();
        if (currentModel && getModelProvider(currentModel) === provider) {
          await setSelectedModelMutation.mutateAsync(null);
        }
      } catch (error) {
        console.error("Failed to check/clear model selector cookie:", error);
      }

      await clearApiKeyMutation.mutateAsync(provider);
      if (provider === "anthropic") {
        setAnthropicInput("");
        cancelAnthropicSave();
        setSavingAnthropic(false);
      }

      // Clear validation result for this provider
      await saveValidationMutation.mutateAsync({
        provider,
        validation: null,
      });

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["api-key-validation"] });
    } catch (_error) {
      const providerName = provider === "anthropic" ? "Anthropic" : "Unknown";
      toast.error(`Failed to clear ${providerName} API key`);
    }
  };

  if (isLoadingApiKeys) {
    return (
      <div className="text-muted-foreground flex items-center gap-1">
        Loading... <Loader2 className="size-3.5 animate-spin" />
      </div>
    );
  }

  const providers = [
    {
      key: "anthropic",
      name: "Anthropic",
      input: anthropicInput,
      saving: savingAnthropic,
      handleChange: handleAnthropicChange,
    },
  ];

  return (
    <div className="flex w-full flex-col gap-6">
      {providers.map((provider) => {
        const hasValidKey =
          apiKeys?.[provider.key as keyof typeof apiKeys] &&
          (apiKeys[provider.key as keyof typeof apiKeys] as string)?.length > 0;

        return (
          <div key={provider.key} className="flex w-full flex-col gap-2">
            <Label
              htmlFor={`${provider.key}-key`}
              className="flex h-5 items-center gap-2 font-normal"
            >
              {provider.name} API Key
              {provider.saving && (
                <Loader2 className="text-muted-foreground size-3 animate-spin" />
              )}
              {renderValidationIcon(provider.key)}
            </Label>
            <div className="flex gap-2">
              <Input
                id={`${provider.key}-key`}
                type={
                  apiKeyVisibility[provider.key as ApiKeyProvider]
                    ? "text"
                    : "password"
                }
                autoComplete="off"
                placeholder={`sk-${provider.key === "openai" ? "" : provider.key === "anthropic" ? "ant-" : "or-"}placeholder...`}
                value={provider.input}
                onChange={(e) => provider.handleChange(e.target.value)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    className="text-muted-foreground hover:text-foreground"
                    size="icon"
                    onClick={() =>
                      handleToggleShowApiKey(provider.key as ApiKeyProvider)
                    }
                    disabled={!provider.input.trim().length}
                  >
                    {apiKeyVisibility[provider.key as ApiKeyProvider] ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {apiKeyVisibility[provider.key as ApiKeyProvider]
                    ? "Hide API Key"
                    : "Show API Key"}
                </TooltipContent>
              </Tooltip>
              {hasValidKey && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      className="text-muted-foreground hover:text-foreground"
                      size="icon"
                      onClick={() =>
                        openProviderConfig(provider.key as ApiKeyProvider)
                      }
                    >
                      <Settings className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Configure {provider.name} Models
                  </TooltipContent>
                </Tooltip>
              )}
              {hasValidKey && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      className="text-muted-foreground hover:text-foreground"
                      size="icon"
                      onClick={() =>
                        handleClearApiKey(provider.key as ApiKeyProvider)
                      }
                    >
                      <Trash className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Clear API Key</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}

      <div className="text-muted-foreground flex w-full flex-col gap-1 border-t pt-4 text-xs">
        <span>Maru is BYOK; you must provide an API key to use models.</span>
        <span>
          Keys are stored securely in cookies, never stored permanently on our
          servers.
        </span>
        <span>
          Ensure that your keys have high enough rate limits for the agent!
        </span>
      </div>
    </div>
  );
}
