import { getModelProvider } from "../llm/models";
import type { ApiKeys } from "../api-keys";
import type { ModelType } from "../llm/models";

export function cleanTitle(title: string): string {
  return title
    .trim()
    .replace(/^[`"']|[`"']$/g, "") // Remove leading/trailing quotes or backticks
    .replace(/[`"']/g, ""); // Remove any remaining quotes or backticks within the string
}

export interface TitleGenerationConfig {
  taskId: string;
  userPrompt: string;
  apiKeys: ApiKeys;
  fallbackModel?: string;
}

export function getTitleGenerationModel(config: TitleGenerationConfig): {
  provider: "openai" | "anthropic" | "openrouter" /* | "ollama" */;
  modelChoice: string;
} | null {
  const { apiKeys, fallbackModel } = config;

  // Check if any API key is available
  if (
    !apiKeys.openai &&
    !apiKeys.anthropic &&
    !apiKeys.openrouter
    // && !apiKeys.ollama
  ) {
    return null;
  }

  let modelChoice: string;
  let provider: "openai" | "anthropic" | "openrouter" | "ollama";

  if (fallbackModel) {
    // Use the fallback model directly
    provider = getModelProvider(fallbackModel as ModelType);
    modelChoice = fallbackModel as ModelType;
  } else {
    // Default behavior: prefer OpenAI, then Anthropic, then OpenRouter
    if (apiKeys.openai) {
      provider = "openai";
      modelChoice = "gpt-4o" as ModelType;
    } else if (apiKeys.anthropic) {
      provider = "anthropic";
      modelChoice = "claude-3-5-sonnet-20241022" as ModelType;
    } else {
      provider = "openrouter";
      modelChoice = "x-ai/grok-3" as ModelType;
    }
  }

  // Ensure we have the API key for the chosen provider
  if (!apiKeys[provider]) {
    return null;
  }

  return { provider, modelChoice };
}

export function generateTitlePrompt(userPrompt: string): string {
  return `<instructions>
Generate a concise title (under 50 chars) for this user request. If it's a simple word or greeting, use it as-is. If it's a coding task request, summarize the main intent. Return ONLY the title text.
</instructions>

<user-request>
${userPrompt}
</user-request>`;
}
