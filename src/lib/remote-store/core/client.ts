import type {
  RemoteKvItem,
  RemoteSnapshot,
  RemoteSnapshotMeta,
  RemoteStoreConfig,
} from "./types";
import { composeNamespace } from "./types";

export type ProxyResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type ProxyEnvelope = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

export type PingResult = {
  ok: true;
  service?: string;
  version?: string;
  time?: string;
  client_ip?: string;
  week_hits_from_ip?: number;
  server?: string;
  app_id?: string;
};

export type AccessLogItem = {
  id: number;
  ip: string;
  action: string;
  ok: number;
  http_status: number;
  origin?: string | null;
  namespace?: string | null;
  note?: string | null;
  created_at: string;
};

export type AccessIpItem = {
  ip: string;
  hits: number;
  ok_hits: number;
  last_seen: string;
  first_seen: string;
};

function buildHeaders(config: RemoteStoreConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": config.apiKey.trim(),
  };
  const user = config.basicUser?.trim() ?? "";
  const pass = config.basicPass ?? "";
  if (user) {
    // btoa is fine for ASCII basic credentials
    headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  }
  return headers;
}

/**
 * Call user-hosted proxy.php over HTTPS.
 * Runs in the browser (CORS must allow this origin).
 */
export async function callRemoteProxy<T = ProxyEnvelope>(
  config: RemoteStoreConfig,
  body: Record<string, unknown>,
): Promise<ProxyResult<T>> {
  const url = config.proxyUrl.trim();
  if (!url) return { ok: false, error: "プロキシ URL が未設定です" };
  if (!config.apiKey.trim()) return { ok: false, error: "API キーが未設定です" };
  if (!config.namespace.trim()) return { ok: false, error: "名前空間が未設定です" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify({
        ...body,
        namespace:
          typeof body.namespace === "string"
            ? body.namespace
            : composeNamespace(config.appId, config.namespace),
      }),
    });

    let json: ProxyEnvelope | null = null;
    try {
      json = (await res.json()) as ProxyEnvelope;
    } catch {
      if (res.status === 401) {
        return {
          ok: false,
          error:
            "401 認証エラー（API キーまたは Basic 認証を確認してください）",
          status: 401,
        };
      }
      return {
        ok: false,
        error: `応答が JSON ではありません (HTTP ${res.status})`,
        status: res.status,
      };
    }

    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        error: (json.error as string) || `HTTP ${res.status}`,
        status: res.status,
      };
    }

    return { ok: true, data: json as T };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "ネットワークエラー（CORS や URL を確認してください）",
    };
  }
}

export async function remotePing(config: RemoteStoreConfig) {
  return callRemoteProxy<PingResult>(config, { action: "ping" });
}

export async function remoteLogRecent(config: RemoteStoreConfig, limit = 20) {
  return callRemoteProxy<{ ok: true; items: AccessLogItem[]; your_ip?: string }>(
    config,
    { action: "log.recent", limit },
  );
}

export async function remoteLogIps(config: RemoteStoreConfig) {
  return callRemoteProxy<{ ok: true; items: AccessIpItem[]; your_ip?: string }>(
    config,
    { action: "log.ips" },
  );
}

export async function remoteKvGet<T = unknown>(
  config: RemoteStoreConfig,
  key: string,
) {
  return callRemoteProxy<{
    ok: true;
    found: boolean;
    value: T | null;
    updated_at?: string;
    client_ip?: string;
  }>(config, { action: "kv.get", key });
}

export async function remoteKvSet(
  config: RemoteStoreConfig,
  key: string,
  value: unknown,
) {
  return callRemoteProxy(config, { action: "kv.set", key, value });
}

export async function remoteKvList(config: RemoteStoreConfig) {
  return callRemoteProxy<{ ok: true; items: RemoteKvItem[] }>(config, {
    action: "kv.list",
  });
}

export async function remoteSnapSave(
  config: RemoteStoreConfig,
  opts: {
    title: string;
    kind?: string;
    payload: unknown;
    id?: number;
  },
) {
  return callRemoteProxy<{ ok: true; id: number }>(config, {
    action: "snap.save",
    title: opts.title,
    kind: opts.kind ?? "project",
    payload: opts.payload,
    ...(opts.id ? { id: opts.id } : {}),
  });
}

export async function remoteSnapList(
  config: RemoteStoreConfig,
  kind?: string,
) {
  return callRemoteProxy<{ ok: true; items: RemoteSnapshotMeta[] }>(config, {
    action: "snap.list",
    ...(kind ? { kind } : {}),
  });
}

export async function remoteSnapGet(config: RemoteStoreConfig, id: number) {
  return callRemoteProxy<{
    ok: true;
    found: boolean;
    item?: RemoteSnapshot;
  }>(config, { action: "snap.get", id });
}

export async function remoteSnapDelete(config: RemoteStoreConfig, id: number) {
  return callRemoteProxy<{ ok: true; deleted: boolean }>(config, {
    action: "snap.delete",
    id,
  });
}
