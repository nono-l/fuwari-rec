/** Connection + tenant. App-agnostic. */
export type RemoteStoreConfig = {
  /** Full URL to proxy.php */
  proxyUrl: string;
  /** Shared secret (X-Api-Key) */
  apiKey: string;
  /** Optional HTTP Basic user */
  basicUser: string;
  /** Optional HTTP Basic password */
  basicPass: string;
  /**
   * Tenant inside the app (user / machine).
   * Sent as `{appId}.{tenant}` so one MySQL can host many apps.
   */
  namespace: string;
  /** App id from apps/{id}.php — used as namespace prefix */
  appId: string;
  /** Optional link to server setup.php */
  setupUrl: string;
  enabled: boolean;
};

export type RemoteKvItem = {
  key: string;
  updated_at: string;
};

export type RemoteSnapshotMeta = {
  id: number;
  title: string;
  kind: string;
  updated_at: string;
  created_at: string;
};

export type RemoteSnapshot = RemoteSnapshotMeta & {
  payload: unknown;
};

export const DEFAULT_REMOTE_CONFIG: RemoteStoreConfig = {
  proxyUrl: "",
  apiKey: "",
  basicUser: "",
  basicPass: "",
  namespace: "default",
  appId: "app",
  setupUrl: "",
  enabled: false,
};

export function configStorageKey(appId: string): string {
  return `grokbuild.${appId}.remote-config.v1`;
}

/** Compose the on-wire namespace. Idempotent if already prefixed. */
export function composeNamespace(appId: string, tenant: string): string {
  const a = (appId || "app").trim() || "app";
  const t = (tenant || "default").trim() || "default";
  if (t === a || t.startsWith(`${a}.`)) return t;
  return `${a}.${t}`;
}
