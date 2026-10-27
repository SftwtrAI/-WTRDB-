export const WTROPS_BRAND = {
  name: "Wtrops.ai",
  company: "Wtrops.ai",
  website: "https://wtrops.ai",
  email: "nile@sftwtrs.ai",
  product: "Wtrops.ai",
} as const;

export const WTROPS_VERSION = {
  core: "1.0.0",
  api: "v1",
  build: process.env.BUILD_NUMBER || "dev",
} as const;

export const WTROPS_HEADERS = {
  author: "X-Author",
  version: "X-Api-Version",
  requestId: "X-Request-Id",
} as const;
