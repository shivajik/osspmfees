import "server-only";
import { exportStoreState, importStoreState } from "@/lib/db/store";

const STATE_ID = "main";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function headers(key: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", key);
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