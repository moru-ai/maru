import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import {
  updateUserSettings,
  getOrCreateUserSettings,
} from "@/lib/db-operations/user-settings";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getOrCreateUserSettings(session.user.id);

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch user settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { autoPullRequest, memoriesEnabled, selectedModels, rules } = body;

    // Validate autoPullRequest if provided
    if (autoPullRequest !== undefined && typeof autoPullRequest !== "boolean") {
      return NextResponse.json(
        { error: "autoPullRequest must be a boolean" },
        { status: 400 }
      );
    }

    // Validate memoriesEnabled if provided
    if (memoriesEnabled !== undefined && typeof memoriesEnabled !== "boolean") {
      return NextResponse.json(
        { error: "memoriesEnabled must be a boolean" },
        { status: 400 }
      );
    }

    // Validate selectedModels if provided
    if (selectedModels !== undefined && !Array.isArray(selectedModels)) {
      return NextResponse.json(
        { error: "selectedModels must be an array" },
        { status: 400 }
      );
    }

    // Validate rules if provided
    if (rules !== undefined && rules !== null && typeof rules !== "string") {
      return NextResponse.json(
        { error: "rules must be a string or null" },
        { status: 400 }
      );
    }

    // Validate rules word count if provided
    if (rules && typeof rules === "string") {
      const wordCount = rules
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0).length;
      if (wordCount > 100) {
        return NextResponse.json(
          { error: "rules cannot exceed 100 words" },
          { status: 400 }
        );
      }
    }

    // Build update object with only provided fields
    const updateData: {
      autoPullRequest?: boolean;
      memoriesEnabled?: boolean;
      selectedModels?: string[];
      rules?: string;
    } = {};
    if (autoPullRequest !== undefined)
      updateData.autoPullRequest = autoPullRequest;
    if (memoriesEnabled !== undefined)
      updateData.memoriesEnabled = memoriesEnabled;
    if (selectedModels !== undefined) updateData.selectedModels = selectedModels;
    if (rules !== undefined) updateData.rules = rules || null;

    const settings = await updateUserSettings(session.user.id, updateData);

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Error updating user settings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update user settings",
      },
      { status: 500 }
    );
  }
}
