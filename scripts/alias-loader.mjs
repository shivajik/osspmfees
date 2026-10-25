// Resolves the "@/..." path alias (tsconfig "paths") for `node --test`.
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(root, specifier.slice(2));
    const file = [".ts", ".tsx", "/index.ts"].map((ext) => base + ext).find(existsSync);
    if (file) return next(pathToFileURL(file).href, context);
  }
  // Extensionless relative TS imports, as written for the bundler.
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.endsWith(".ts")) {
    const base = new URL(specifier, context.parentURL);
    if (existsSync(base.pathname.slice(1) + ".ts") || existsSync(base.pathname + ".ts")) return next(base.href + ".ts", context);
  }
  return next(specifier, context);
}
