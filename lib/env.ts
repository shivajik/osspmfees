// Central env access. Fails soft in preview — real values required in production.
const fallbackSecret =
  "dev-only-secret-please-override-in-production-32chars-min-xxxxxxxxxxxxxxxx";

export const env = {
  JWT_SECRET: process.env.JWT_SECRET || fallbackSecret,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || fallbackSecret + "-refresh",
  DATABASE_URL: process.env.DATABASE_URL || "",
  NODE_ENV: process.env.NODE_ENV || "development",
  APP_URL: process.env.APP_URL || "http://localhost:3000",
} as const;

export const isProd = env.NODE_ENV === "production";
