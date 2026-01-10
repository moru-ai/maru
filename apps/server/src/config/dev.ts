import dotenv from "dotenv";
import { z } from "zod";
import { sharedConfigSchema, createSharedConfig } from "./shared";

dotenv.config({ debug: false });

/**
 * Development environment configuration schema
 * Simplified to only support Moru sandbox execution
 */
const devConfigSchema = sharedConfigSchema.extend({
  // CORS origins for development
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

/**
 * Parse and validate development configuration
 */
const parsed = devConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid development environment variables:",
    parsed.error.format()
  );
  process.exit(1);
}

/**
 * Development configuration object
 * Combines shared config with development-specific settings
 */
const devConfig = {
  ...createSharedConfig(parsed.data),
};

export default devConfig;
export type DevConfig = typeof devConfig;
