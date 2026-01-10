import type { DevConfig } from "./dev";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: devConfig } = require("./dev");
const config: DevConfig = devConfig;

export default config;

export type { DevConfig } from "./dev";
export type { SharedConfig } from "./shared";
export { getCorsOrigins } from "./shared";
