"use server";

import { cookies } from "next/headers";
import {
  ApiKeyProvider,
  ApiKeys,
  ApiKeyValidation,
  getAvailableModels,
  getAllPossibleModels,
  getDefaultSelectedModels,
  ModelInfo,
  ModelInfos,
  ModelType,
} from "@repo/types";
import { ValidationResult } from "@/lib/types/validation";
import { auth } from "@/lib/auth/auth";
import { getUserSettings } from "@/lib/db-operations/user-settings";

export async function getApiKeys(): Promise<ApiKeys> {
  const cookieStore = await cookies();
  const openaiKey = cookieStore.get("openai-key")?.value;
  const anthropicKey = cookieStore.get("anthropic-key")?.value;
  const openrouterKey = cookieStore.get("openrouter-key")?.value;
  // const groqKey = cookieStore.get("groq-key")?.value;
  // const ollamaKey = cookieStore.get("ollama-key")?.value;

  return {
    openai: openaiKey || undefined,
    anthropic: anthropicKey || undefined,
    openrouter: openrouterKey || undefined,
    // groq: groqKey || undefined,
    // ollama: ollamaKey || undefined,
  };
}

export async function getModels(): Promise<ModelInfo[]> {
  const apiKeys = await getApiKeys();

  try {
    // Try to get user settings
    const authHeaders = await import("next/headers").then((m) => m.headers());
    const session = await auth.api.getSession({ headers: authHeaders });

    if (session?.user?.id) {
      const userSettings = await getUserSettings(session.user.id);
      const selectedModels =
        (userSettings?.selectedModels as ModelType[]) || [];

      // If user has selected models, use them; otherwise use defaults
      const models =
        selectedModels.length > 0
          ? await getAvailableModels(apiKeys, selectedModels)
          : await getAvailableModels(apiKeys); // Fallback to all available models

      return models.map((modelId) => ModelInfos[modelId]);
    }
  } catch (_error) {
    // Could not fetch user settings, fall back to all models
  }

  // Fallback if no user session or error occurred
  const availableModels = await getAvailableModels(apiKeys);
  return availableModels.map((modelId) => ModelInfos[modelId]);
}

export async function getAllPossibleModelsInfo(): Promise<ModelInfo[]> {
  const apiKeys = await getApiKeys();
  const allModels = await getAllPossibleModels(apiKeys);
  return allModels.map((modelId) => ModelInfos[modelId]);
}

export async function getModelDefaults(): Promise<{
  defaultModels: ModelType[];
}> {
  const apiKeys = await getApiKeys();
  return {
    defaultModels: await getDefaultSelectedModels(apiKeys),
  };
}

export async function saveApiKey(provider: ApiKeyProvider, key: string | null) {
  const cookieStore = await cookies();
  const cookieName = `${provider}-key`;

  if (key) {
    const isProduction = process.env.VERCEL_ENV === "production";

    cookieStore.set(cookieName, key, {
      httpOnly: true,
      secure: isProduction,
      // Use "none" for production to allow cross-domain cookies, "lax" for development
      sameSite: isProduction ? "none" : "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      // Allow cookies to be sent to all subdomains
      domain: isProduction ? ".moru.io" : undefined,
    });
  } else {
    cookieStore.delete(cookieName);
  }

  return { success: true };
}

export async function clearApiKey(provider: ApiKeyProvider) {
  return saveApiKey(provider, null);
}

export async function getApiKeyValidation(): Promise<ApiKeyValidation> {
  const cookieStore = await cookies();

  const openaiValidation = cookieStore.get("openai-validation")?.value;
  const anthropicValidation = cookieStore.get("anthropic-validation")?.value;
  const openrouterValidation = cookieStore.get("openrouter-validation")?.value;
  // const groqValidation = cookieStore.get("groq-validation")?.value;
  // const ollamaValidation = cookieStore.get("ollama-validation")?.value;

  return {
    openai: openaiValidation ? JSON.parse(openaiValidation) : undefined,
    anthropic: anthropicValidation
      ? JSON.parse(anthropicValidation)
      : undefined,
    openrouter: openrouterValidation
      ? JSON.parse(openrouterValidation)
      : undefined,
    // groq: groqValidation ? JSON.parse(groqValidation) : undefined,
    // ollama: ollamaValidation ? JSON.parse(ollamaValidation) : undefined,
  };
}

export async function saveApiKeyValidation(
  provider: ApiKeyProvider,
  validation: ValidationResult | null
) {
  const cookieStore = await cookies();
  const cookieName = `${provider}-validation`;

  if (validation) {
    const isProduction = process.env.VERCEL_ENV === "production";

    // Add timestamp
    const validationWithTimestamp = {
      ...validation,
      validatedAt: Date.now(),
    };

    cookieStore.set(cookieName, JSON.stringify(validationWithTimestamp), {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
      domain: isProduction ? ".moru.io" : undefined,
    });
  } else {
    cookieStore.delete(cookieName);
  }

  return { success: true };
}

export async function clearApiKeyValidation(provider: ApiKeyProvider) {
  return saveApiKeyValidation(provider, null);
}
