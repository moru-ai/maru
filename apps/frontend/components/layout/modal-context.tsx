"use client";

import React, { createContext, useContext, useState } from "react";
import { ApiKeyProvider } from "@repo/types";

type SettingsTab = "user" | "models";

interface ModalContextType {
  // Settings modal state
  isSettingsModalOpen: boolean;
  settingsModalTab: SettingsTab;
  providerConfigView: ApiKeyProvider | null;
  openSettingsModal: (tab?: SettingsTab) => void;
  closeSettingsModal: () => void;
  setSettingsModalTab: (tab: SettingsTab) => void;
  openProviderConfig: (provider: ApiKeyProvider) => void;
  closeProviderConfig: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

interface ModalProviderProps {
  children: React.ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsTab>("models");
  const [providerConfigView, setProviderConfigView] = useState<ApiKeyProvider | null>(null);

  const openSettingsModal = (tab: SettingsTab = "models") => {
    setSettingsModalTab(tab);
    setProviderConfigView(null);
    setIsSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
    setProviderConfigView(null);
  };

  const openProviderConfig = (provider: ApiKeyProvider) => {
    setProviderConfigView(provider);
    setSettingsModalTab("models");
  };

  const closeProviderConfig = () => {
    setProviderConfigView(null);
  };

  const value: ModalContextType = {
    isSettingsModalOpen,
    settingsModalTab,
    providerConfigView,
    openSettingsModal,
    closeSettingsModal,
    setSettingsModalTab,
    openProviderConfig,
    closeProviderConfig,
  };

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}