import "server-only";
import { exportStoreState, importStoreState } from "@/lib/db/store";
import { isProd } from "@/lib/env";

const STATE_ID = "main";

function isJwt(value: string): boolean {
  return value.split(".").length === 3;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (isProd) {
      throw new Error(
        "Persistence is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables on your hosting provider (e.g. Vercel → Project → Settings → Environment Variables), then redeploy. Without them, writes cannot persist across serverless invocations.",
      );
    }
    return null;
  }

  if (isJwt(key)) {
    const payload = decodeJwtPayload(key);
    if (payload?.role !== "service_role") {
      throw new Error(
        "Persistence is configured with the wrong Supabase key. Set SUPABASE_SERVICE_ROLE_KEY to the service_role secret key from Supabase Project Settings → API, then redeploy.",
      );
    }
  }

  return { url: url.replace(/\/$/, ""), key };
}

function headers(key: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", key);
  if (isJwt(key)) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  headers.set("Content-Type", "application/json");
  return headers;
}

export async function loadStore(): Promise<void> {
  const cfg = config();
  if (!cfg) return;

  const response = await fetch(
    `${cfg.url}/rest/v1/ledgerly_app_state?id=eq.${STATE_ID}&select=state`,
    { headers: headers(cfg.key), cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Unable to load application data (${response.status})`);

  const rows = (await response.json()) as Array<{ state?: unknown }>;
  if (rows[0]?.state) {
    importStoreState(rows[0].state);
    return;
  }

  await saveStore();
}

export async function saveStore(): Promise<void> {
  const cfg = config();
  if (!cfg) return;

  const response = await fetch(`${cfg.url}/rest/v1/ledgerly_app_state`, {
    method: "POST",
    headers: headers(cfg.key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ id: STATE_ID, state: exportStoreState() }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Unable to save application data (${response.status}): ${detail}`);
  }
}