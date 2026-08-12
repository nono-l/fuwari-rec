import {
  DEFAULT_REMOTE_CONFIG,
  configStorageKey,
  type RemoteStoreConfig,
} from "./types";

export type ConfigStoreOptions = {
  appId: string;
  /** Override localStorage key. Default: xstore.{appId}.remote-config.v1 */
  storageKey?: string;
};

export function createConfigStore(opts: ConfigStoreOptions) {
  const appId = opts.appId || "app";
  const storageKey = opts.storageKey ?? configStorageKey(appId);

  const empty = (): RemoteStoreConfig => ({
    ...DEFAULT_REMOTE_CONFIG,
    appId,
  });

  function load(): RemoteStoreConfig {
    if (typeof window === "undefined") return empty();
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return empty();
      const parsed = JSON.parse(raw) as Partial<RemoteStoreConfig>;
      return {
        ...empty(),
        ...parsed,
        proxyUrl: String(parsed.proxyUrl ?? ""),
        apiKey: String(parsed.apiKey ?? ""),
        basicUser: String(parsed.basicUser ?? ""),
        basicPass: String(parsed.basicPass ?? ""),
        namespace: String(parsed.namespace ?? "default") || "default",
        appId: String(parsed.appId ?? appId) || appId,
        setupUrl: String(parsed.setupUrl ?? ""),
        enabled: Boolean(parsed.enabled),
      };
    } catch {
      return empty();
    }
  }

  function save(config: RemoteStoreConfig): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        proxyUrl: config.proxyUrl.trim(),
        apiKey: config.apiKey,
        basicUser: config.basicUser.trim(),
        basicPass: config.basicPass,
        namespace: config.namespace.trim() || "default",
        appId: (config.appId || appId).trim() || appId,
        setupUrl: config.setupUrl.trim(),
        enabled: config.enabled,
      }),
    );
  }

  return { appId, storageKey, load, save, empty };
}

/** Guess setup.php URL from proxy.php URL */
export function guessSetupUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl.trim());
    u.pathname = u.pathname.replace(/\/api\/proxy\.php$/i, "/setup.php");
    if (!/setup\.php$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/[^/]*$/, "/setup.php");
    }
    return u.toString();
  } catch {
    return "";
  }
}
