/**
 * Default patterns to exclude from sandbox archives
 * These are common directories that are large and can be regenerated
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  // Package manager directories
  "node_modules",
  ".pnpm-store",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".env",

  // Version control
  ".git",
  ".svn",
  ".hg",

  // Build outputs
  "dist",
  "build",
  ".next",
  ".nuxt",
  "target",
  "out",

  // IDE/Editor
  ".idea",
  ".vscode",
  "*.swp",
  "*.swo",

  // OS files
  ".DS_Store",
  "Thumbs.db",

  // Logs
  "*.log",
  "npm-debug.log*",
  "yarn-error.log*",

  // Cache
  ".cache",
  ".parcel-cache",
  ".turbo",
];
