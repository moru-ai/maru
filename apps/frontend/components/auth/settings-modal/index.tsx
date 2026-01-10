"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useModal } from "@/components/layout/modal-context";
import { Box, CornerDownRight, ChevronLeft, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Fragment, useEffect } from "react";
import { UserSettings } from "./user-settings";
import { ModelSettings } from "./model-settings";
import { ProviderConfig } from "./provider-config";
import { API_KEY_PROVIDER_NAMES } from "@repo/types";

const tabs = [
  {
    title: "Models",
    sidebarLabel: "Models",
    icon: <Box className="size-4" />,
    value: "models",
  },
  {
    title: "Preferences",
    sidebarLabel: "Preferences",
    icon: <Settings2 className="size-4" />,
    value: "user",
  },
];

export function SettingsModal() {
  const {
    isSettingsModalOpen,
    settingsModalTab,
    providerConfigView,
    closeSettingsModal,
    setSettingsModalTab,
    openSettingsModal,
    closeProviderConfig,
  } = useModal();

  const activeTab = settingsModalTab;
  const currentTab = tabs.find((tab) => tab.value === activeTab);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openSettingsModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSettingsModal]);

  const renderTabContent = () => {
    if (providerConfigView) {
      return <ProviderConfig provider={providerConfigView} />;
    }

    switch (activeTab) {
      case "user":
        return <UserSettings />;
      case "models":
        return <ModelSettings />;
      default:
        return <ModelSettings />;
    }
  };

  const getModalTitle = () => {
    if (providerConfigView) {
      return (
        <div className="flex items-center gap-1 p-4 pb-0 font-medium">
          <Button
            variant="ghost"
            size="iconXs"
            onClick={() => closeProviderConfig()}
          >
            <ChevronLeft className="size-4" />
          </Button>
          {API_KEY_PROVIDER_NAMES[providerConfigView]} Configuration
        </div>
      );
    }
    return (
      <div className="p-4 pb-0 font-medium">
        {currentTab?.title || "Settings"}
      </div>
    );
  };

  return (
    <Dialog open={isSettingsModalOpen} onOpenChange={closeSettingsModal}>
      <DialogContent className="max-w-2xl! h-full max-h-[600px] overflow-hidden p-0">
        <div className="flex max-h-full overflow-hidden">
          {/* Left sidebar */}
          <div className="bg-card w-40 shrink-0 border-r px-2 py-4">
            <DialogTitle className="mb-4 px-2 text-base font-medium">
              Settings
            </DialogTitle>

            <div className="flex flex-col gap-1">
              {tabs.map((tab) => (
                <Fragment key={tab.value}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent px-2! w-full justify-start border border-transparent font-normal",
                      activeTab === tab.value &&
                        !providerConfigView &&
                        "bg-accent text-foreground border-sidebar-border"
                    )}
                    onClick={() => {
                      closeProviderConfig();
                      setSettingsModalTab(tab.value as "user" | "models");
                    }}
                  >
                    {tab.icon}
                    {tab.sidebarLabel}
                  </Button>
                  {providerConfigView && tab.value === "models" && (
                    <div className="flex w-full items-start gap-1 pl-2">
                      <CornerDownRight className="text-muted-foreground mt-1.5 size-4" />

                      <Button
                        variant="ghost"
                        className="hover:bg-sidebar-accent px-2! bg-accent text-foreground border-sidebar-border flex-1 justify-start overflow-hidden truncate border font-normal"
                        onClick={() => closeProviderConfig()}
                      >
                        <span className="truncate">
                          {API_KEY_PROVIDER_NAMES[providerConfigView]}
                        </span>
                      </Button>
                    </div>
                  )}
                </Fragment>
              ))}

              {/* Provider config sub-page navigation */}
            </div>
          </div>

          {/* Right content area */}
          <div className="flex grow flex-col gap-6">
            {getModalTitle()}

            <div className="flex w-full grow flex-col items-start gap-6 overflow-y-auto p-4 pt-0 text-sm">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
