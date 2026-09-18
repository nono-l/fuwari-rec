import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { normalizeScenePersist, type ScenePersist } from "./scenes-persist";

const MAX_JSON = 500_000;

export const loadMyScenes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(`
      create table if not exists fuwari_scenes (
        user_id text primary key,
        payload_json text not null default '{}',
        updated_at timestamptz not null default now()
      )
    `);
    const rows = await sql.query<{ payload_json: string }>(
      "select payload_json from fuwari_scenes where user_id = $1 limit 1",
      [context.userId],
    );
    const raw = rows[0]?.payload_json;
    if (!raw) return null;
    try {
      return normalizeScenePersist(JSON.parse(raw));
    } catch {
      return null;
    }
  });

export const saveMyScenes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: ScenePersist) => {
    const n = normalizeScenePersist(data);
    if (!n) throw new Error("シーンが空です");
    const json = JSON.stringify(n);
    if (json.length > MAX_JSON) throw new Error("シーンが大きすぎます");
    return n;
  })
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(`
      create table if not exists fuwari_scenes (
        user_id text primary key,
        payload_json text not null default '{}',
        updated_at timestamptz not null default now()
      )
    `);
    const json = JSON.stringify(data);
    await sql.query(
      `insert into fuwari_scenes (user_id, payload_json, updated_at)
       values ($1, $2, now())
       on conflict (user_id) do update set
         payload_json = excluded.payload_json,
         updated_at = now()`,
      [context.userId, json],
    );
    return { ok: true as const };
  });
