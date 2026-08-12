import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { RemoteStoreConfig } from "./core/types";
import { DEFAULT_REMOTE_CONFIG } from "./core/types";
import { FUWARI_APP } from "./app";

export type ConnectorSecretRow = {
  proxy_url: string;
  api_key: string;
  basic_user: string;
  basic_pass: string;
  namespace: string;
  setup_url: string;
  enabled: boolean;
};

function rowToConfig(row: ConnectorSecretRow | null, appId: string): RemoteStoreConfig {
  if (!row) return { ...DEFAULT_REMOTE_CONFIG, appId };
  return {
    proxyUrl: row.proxy_url,
    apiKey: row.api_key,
    basicUser: row.basic_user,
    basicPass: row.basic_pass,
    namespace: row.namespace || "default",
    appId,
    setupUrl: row.setup_url,
    enabled: Boolean(row.enabled),
  };
}

/** Load connector secrets from Neon / PGLite. Scoped to the signed-in user. */
export const loadConnectorSecrets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((appId: string) => String(appId || FUWARI_APP.id).slice(0, 64))
  .handler(async ({ context, data: appId }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<ConnectorSecretRow>`
      select proxy_url, api_key, basic_user, basic_pass, namespace, setup_url, enabled
      from grokbuild_external_connector
      where user_id = ${context.userId} and app_id = ${appId}
      limit 1
    `;
    return rowToConfig(rows[0] ?? null, appId);
  });

export const saveConnectorSecrets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: RemoteStoreConfig) => ({
    appId: String(input.appId || FUWARI_APP.id).slice(0, 64),
    proxyUrl: String(input.proxyUrl ?? "").trim().slice(0, 500),
    apiKey: String(input.apiKey ?? "").slice(0, 256),
    basicUser: String(input.basicUser ?? "").trim().slice(0, 128),
    basicPass: String(input.basicPass ?? "").slice(0, 256),
    namespace: (String(input.namespace ?? "default").trim() || "default").slice(0, 64),
    setupUrl: String(input.setupUrl ?? "").trim().slice(0, 500),
    enabled: Boolean(input.enabled),
  }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into grokbuild_external_connector
        (user_id, app_id, proxy_url, api_key, basic_user, basic_pass, namespace, setup_url, enabled, updated_at)
      values
        (${context.userId}, ${data.appId}, ${data.proxyUrl}, ${data.apiKey},
         ${data.basicUser}, ${data.basicPass}, ${data.namespace}, ${data.setupUrl},
         ${data.enabled}, now())
      on conflict (user_id, app_id) do update set
        proxy_url = excluded.proxy_url,
        api_key = excluded.api_key,
        basic_user = excluded.basic_user,
        basic_pass = excluded.basic_pass,
        namespace = excluded.namespace,
        setup_url = excluded.setup_url,
        enabled = excluded.enabled,
        updated_at = now()
    `;
    return { ok: true as const };
  });
