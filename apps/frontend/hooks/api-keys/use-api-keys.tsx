import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApiKeys,
  saveApiKey as saveApiKeyAction,
  clearApiKey as clearApiKeyAction,
  getApiKeyValidation,
  saveApiKeyValidation,
  clearApiKeyValidation,
} from "@/lib/actions/api-keys";
import type { ApiKeyProvider } from "@repo/types";

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: getApiKeys,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useSaveApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      provider,
      key,
    }: {
      provider: ApiKeyProvider;
      key: string;
    }) => saveApiKeyAction(provider, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export function useClearApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: ApiKeyProvider) => clearApiKeyAction(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["api-key-validation"] });
    },
  });
}

export function useApiKeyValidation() {
  return useQuery({
    queryKey: ["api-key-validation"],
    queryFn: getApiKeyValidation,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useSaveApiKeyValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      provider,
      validation,
    }: {
      provider: ApiKeyProvider;
      validation: any;
    }) => saveApiKeyValidation(provider, validation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-key-validation"] });
    },
  });
}
