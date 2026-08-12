export {
  callRemoteProxy,
  remotePing,
  remoteLogRecent,
  remoteLogIps,
  remoteKvGet,
  remoteKvSet,
  remoteKvList,
  remoteSnapSave,
  remoteSnapList,
  remoteSnapGet,
  remoteSnapDelete,
} from "./core/client";
export type {
  ProxyResult,
  PingResult,
  AccessLogItem,
  AccessIpItem,
} from "./core/client";
