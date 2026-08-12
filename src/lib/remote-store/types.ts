export type {
  RemoteStoreConfig,
  RemoteKvItem,
  RemoteSnapshotMeta,
  RemoteSnapshot,
} from "./core/types";
export {
  DEFAULT_REMOTE_CONFIG,
  composeNamespace,
  configStorageKey,
} from "./core/types";
export { FUWARI_APP, type FuwariRemoteSettings } from "./app";

import { FUWARI_APP } from "./app";

/** @deprecated use FUWARI_APP.configStorageKey */
export const REMOTE_CONFIG_STORAGE_KEY = FUWARI_APP.configStorageKey;
