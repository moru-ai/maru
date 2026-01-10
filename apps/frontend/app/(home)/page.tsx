import { HomePageContent } from "@/components/chat/home/home-content";
import { HomeLayoutWrapper } from "@/components/layout/home-layout";
import { getModelSelectorCookie } from "@/lib/actions/model-selector-cookie";
import { getApiKeys, getModels } from "@/lib/actions/api-keys";
import { getModelProvider, AvailableModels } from "@repo/types";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { getUser } from "@/lib/auth/get-user";

export default async function Home() {
  await getUser();
  const queryClient = new QueryClient();
  const savedModel = await getModelSelectorCookie();
  const apiKeys = await getApiKeys();

  const prefetchPromises = [
    queryClient
      .prefetchQuery({
        queryKey: ["models"],
        queryFn: getModels,
      })
      .catch(() => {
        // Could not prefetch models
      }),
    queryClient
      .prefetchQuery({
        queryKey: ["api-keys"],
        queryFn: getApiKeys,
      })
      .catch(() => {
        // Could not prefetch API keys
      }),
    queryClient
      .prefetchQuery({
        queryKey: ["selected-model"],
        queryFn: getModelSelectorCookie,
      })
      .catch(() => {
        // Could not prefetch selected model
      }),
  ];

  await Promise.allSettled(prefetchPromises);


  // Validate saved model against available API keys
  let initialSelectedModel = savedModel;
  if (savedModel) {
    try {
      // Check if the saved model is valid (exists in AvailableModels)
      const isValidModel = Object.values(AvailableModels).includes(savedModel);

      if (isValidModel) {
        // Check if the model's provider has a valid API key
        const provider = getModelProvider(savedModel);
        const hasValidKey =
          provider === "openai"
            ? !!apiKeys.openai && apiKeys.openai.length > 0
            : !!apiKeys.anthropic && apiKeys.anthropic.length > 0;

        if (!hasValidKey) {
          initialSelectedModel = null;
        }
      } else {
        initialSelectedModel = null;
      }
    } catch (_error) {
      initialSelectedModel = null;
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeLayoutWrapper>
        <HomePageContent initialSelectedModel={initialSelectedModel} />
      </HomeLayoutWrapper>
    </HydrationBoundary>
  );
}
