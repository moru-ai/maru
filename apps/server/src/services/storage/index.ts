import config from "../../config";
import { GCSSandboxStorage } from "./gcs-storage";
import type { SandboxStorage } from "./sandbox-storage";

export type { SandboxStorage, SaveOptions, SaveResult, RestoreResult } from "./sandbox-storage";
export { GCSSandboxStorage } from "./gcs-storage";
export { DEFAULT_EXCLUDE_PATTERNS } from "./constants";

let instance: SandboxStorage | null = null;

/**
 * Create or get singleton SandboxStorage instance
 * Currently only supports GCS, but interface allows adding other providers later
 */
export function createSandboxStorage(): SandboxStorage {
  if (instance) return instance;

  if (!config.gcsBucketName) {
    throw new Error(
      "GCS_BUCKET_NAME is required for sandbox storage. " +
        "Set the environment variable to enable workspace persistence."
    );
  }

  instance = new GCSSandboxStorage({
    bucketName: config.gcsBucketName,
    keyFile: config.gcsKeyFile,
    credentialsBase64: config.gcsCredentialsBase64,
  });

  return instance;
}

/**
 * Check if sandbox storage is configured
 */
export function isSandboxStorageConfigured(): boolean {
  return !!config.gcsBucketName;
}
