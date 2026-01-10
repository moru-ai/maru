import { prisma } from "@repo/db";

export interface UserSettings {
  id: string;
  userId: string;
  autoPullRequest: boolean;
  memoriesEnabled: boolean;
  selectedModels: string[];
  rules?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getUserSettings(
  userId: string
): Promise<UserSettings | null> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  return settings;
}

export async function createUserSettings(
  userId: string,
  settings: {
    autoPullRequest: boolean;
    memoriesEnabled?: boolean;
    selectedModels?: string[];
    rules?: string;
  }
): Promise<UserSettings> {
  const result = await prisma.userSettings.create({
    data: {
      userId,
      autoPullRequest: settings.autoPullRequest,
      memoriesEnabled: settings.memoriesEnabled ?? true,
      selectedModels: settings.selectedModels ?? [],
      rules: settings.rules,
    },
  });

  return result;
}

export async function updateUserSettings(
  userId: string,
  settings: {
    autoPullRequest?: boolean;
    memoriesEnabled?: boolean;
    selectedModels?: string[];
    rules?: string;
  }
): Promise<UserSettings> {
  try {
    const updateData: {
      autoPullRequest?: boolean;
      memoriesEnabled?: boolean;
      selectedModels?: string[];
      rules?: string;
    } = {};

    if (settings.autoPullRequest !== undefined)
      updateData.autoPullRequest = settings.autoPullRequest;
    if (settings.memoriesEnabled !== undefined)
      updateData.memoriesEnabled = settings.memoriesEnabled;
    if (settings.selectedModels !== undefined)
      updateData.selectedModels = settings.selectedModels;
    if (settings.rules !== undefined)
      updateData.rules = settings.rules;

    // Build create data object with only non-default values
    const createData: {
      userId: string;
      autoPullRequest?: boolean;
      memoriesEnabled?: boolean;
      selectedModels?: string[];
      rules?: string;
    } = {
      userId,
    };

    if (
      settings.autoPullRequest !== undefined &&
      settings.autoPullRequest !== false
    )
      createData.autoPullRequest = settings.autoPullRequest;
    if (
      settings.memoriesEnabled !== undefined &&
      settings.memoriesEnabled !== true
    )
      createData.memoriesEnabled = settings.memoriesEnabled;
    if (
      settings.selectedModels !== undefined &&
      settings.selectedModels.length > 0
    )
      createData.selectedModels = settings.selectedModels;
    if (settings.rules !== undefined)
      createData.rules = settings.rules;

    const result = await prisma.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: createData,
    });

    return result;
  } catch (error) {
    console.error("Error in updateUserSettings:", error);
    throw error;
  }
}

export async function getOrCreateUserSettings(
  userId: string
): Promise<UserSettings> {
  let settings = await getUserSettings(userId);

  if (!settings) {
    settings = await createUserSettings(userId, {
      autoPullRequest: false,
      memoriesEnabled: true,
      selectedModels: [],
    });
  }

  return settings;
}
