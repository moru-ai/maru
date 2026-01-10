import type { InitStatus } from "@repo/db";

/**
 * Human-readable display names for initialization steps
 */
export const STEP_DISPLAY_NAMES: Record<InitStatus, string> = {
  INACTIVE: "Inactive",
  PREPARE_WORKSPACE: "Preparing Workspace",
  CREATE_VM: "Creating VM",
  WAIT_VM_READY: "Starting VM",
  VERIFY_VM_WORKSPACE: "Verifying Workspace",
  START_BACKGROUND_SERVICES: "Starting Background Services",
  INSTALL_DEPENDENCIES: "Installing Dependencies",
  COMPLETE_SHADOW_WIKI: "Completing Setup",
  ACTIVE: "Active",
  CREATE_SANDBOX: "Creating Sandbox",
  CLONE_REPOSITORY: "Cloning Repository",
  SETUP_GIT: "Setting Up Git",
};

/**
 * Get the display name for a step
 */
export function getStepDisplayName(step: InitStatus): string {
  return STEP_DISPLAY_NAMES[step] ?? step;
}

/**
 * Default initialization steps for moru mode
 */
export const MORU_INIT_STEPS: InitStatus[] = ["CREATE_SANDBOX"];
