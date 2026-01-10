import type { InitStatus } from "@repo/db";
import type { AgentMode } from "../tools/execution";

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
  COMPLETE_SHADOW_WIKI: "Completing Setup", // Kept for backward compatibility
  ACTIVE: "Active",
  // Moru sandbox mode steps
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
 * Get all step display names in execution order for a given mode
 */
export function getStepsForMode(mode: AgentMode): InitStatus[] {
  const steps: InitStatus[] = [];

  if (mode === "moru") {
    steps.push("CREATE_SANDBOX");
  } else if (mode === "remote") {
    steps.push("CREATE_VM", "WAIT_VM_READY", "VERIFY_VM_WORKSPACE");
  } else {
    steps.push("PREPARE_WORKSPACE");
  }

  return steps;
}
