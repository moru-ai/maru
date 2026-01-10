"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, X } from "lucide-react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { useAuthSession } from "../session-provider";
import { useModal } from "@/components/layout/modal-context";
import {
  useUserSettings,
  useUpdateUserSettings,
} from "@/hooks/use-user-settings";
import { useDebounceCallback } from "@/lib/debounce";

export function UserSettings() {
  const { session, isLoading: isLoadingSession } = useAuthSession();
  const { closeSettingsModal } = useModal();
  const { data: userSettings, isLoading: isLoadingSettings } =
    useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const [rulesValue, setRulesValue] = useState("");
  const [isRulesUpdating, setIsRulesUpdating] = useState(false);

  // Initialize from server state
  useEffect(() => {
    setRulesValue(userSettings?.rules || "");
  }, [userSettings?.rules]);

  // Debounced save to server
  const debouncedSave = useDebounceCallback((value: string) => {
    setIsRulesUpdating(true);
    updateUserSettings.mutate(
      { rules: value || null },
      {
        onSettled: () => {
          setIsRulesUpdating(false);
        },
      }
    );
  }, 1000);

  const handleSignOut = async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = "/auth";
          },
        },
      });
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleAutoPRToggle = (checked: boolean) => {
    updateUserSettings.mutate({ autoPullRequest: checked });
  };

  const handleMemoriesEnabledToggle = (checked: boolean) => {
    updateUserSettings.mutate({ memoriesEnabled: checked });
  };

  const handleRulesChange = (value: string) => {
    const words = value
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    if (words.length <= 100) {
      setRulesValue(value);
      debouncedSave(value);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {isLoadingSession ? (
        <div className="text-muted-foreground flex items-center gap-1">
          Loading user info... <Loader2 className="size-3.5 animate-spin" />
        </div>
      ) : !session?.user ? (
        <div className="text-destructive flex items-center gap-1.5">
          Failed to load user info <X className="size-3.5" />
        </div>
      ) : (
        <>
          <div className="flex flex-col items-start justify-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="rounded-full"
                  width={48}
                  height={48}
                />
              )}
              <div className="flex flex-col">
                <span className="font-medium">{session.user.name}</span>
                <span className="text-muted-foreground text-sm">
                  {session.user.email}
                </span>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => {
                handleSignOut();
                closeSettingsModal();
              }}
            >
              Sign Out
            </Button>
          </div>

          {/* User Settings Section */}
          <div className="flex w-full flex-col gap-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="auto-pr" className="flex flex-col gap-0">
                <div className="text-sm font-normal">
                  Auto-Create Pull Requests
                </div>
                <div className="text-muted-foreground text-xs">
                  Automatically draft pull requests when tasks complete
                </div>
              </label>
              <Checkbox
                id="auto-pr"
                checked={userSettings?.autoPullRequest ?? false}
                onCheckedChange={handleAutoPRToggle}
                disabled={isLoadingSettings}
              />
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="memories-enabled" className="flex flex-col gap-0">
                <div className="text-sm font-normal">Enable Memories</div>
                <div className="text-muted-foreground text-xs">
                  Allow the agent to manage long-term memories (by repository)
                </div>
              </label>
              <Checkbox
                id="memories-enabled"
                checked={userSettings?.memoriesEnabled ?? false}
                onCheckedChange={handleMemoriesEnabledToggle}
                disabled={isLoadingSettings}
              />
            </div>

            {/* Rules Section */}
            <div className="flex flex-col gap-2">
              <label htmlFor="rules" className="flex flex-col gap-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-normal">Rules</div>
                  {isRulesUpdating && (
                    <Loader2 className="text-muted-foreground size-3 animate-spin" />
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  Custom instructions for agent responses (
                  {
                    rulesValue
                      .trim()
                      .split(/\s+/)
                      .filter((word) => word.length > 0).length
                  }
                  /100 words)
                </div>
              </label>
              <Textarea
                id="rules"
                placeholder="Enter specific instructions for Shadow..."
                value={rulesValue}
                onChange={(e) => handleRulesChange(e.target.value)}
                disabled={isLoadingSettings}
                className="text-[13px]! min-h-[80px] resize-none"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
