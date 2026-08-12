import { guessSetupUrl } from "./core/config";
import { FUWARI_APP } from "./app";
import type { RemoteStoreConfig } from "./core/types";
import { DEFAULT_REMOTE_CONFIG } from "./core/types";
import { loadConnectorSecrets, saveConnectorSecrets } from "./secrets";

/** Empty in-memory default. Secrets live in Neon, never in source or localStorage. */
export function emptyRemoteConfig(): RemoteStoreConfig {
  return { ...DEFAULT_REMOTE_CONFIG, appId: FUWARI_APP.id };
}

export async function loadRemoteConfig(): Promise<RemoteStoreConfig> {
  return loadConnectorSecrets({ data: FUWARI_APP.id });
}

export async function saveRemoteConfig(config: RemoteStoreConfig): Promise<void> {
  await saveConnectorSecrets({ data: { ...config, appId: FUWARI_APP.id } });
}

export { guessSetupUrl };
export type { RemoteStoreConfig };
