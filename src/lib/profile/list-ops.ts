import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { sanitizeSoulId } from "./xproof";

export const MAX_OPS = 20;
export const PROXY_DAILY = 50;
export const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
export const REVOKE_MS = 30 * 60 * 1000;

function clip(raw: unknown, n: number) {
  return String(raw ?? "").trim().slice(0, n);
}

function asIso(v: string | Date | null | undefined) {
  if (!v) return null;
  return typeof v === "string" ? v : v.toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function jstDayStartIso() {
  const now = Date.now();
  const jst = new Date(now + 9 * 60 * 60 * 1000);
  const startUtc =
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) -
    9 * 60 * 60 * 1000;
  return new Date(startUtc).toISOString();
}

type Sql = {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function audit(
  sql: Sql,
  row: { ownerId: string; actorId: string; action: string; songId?: string },
) {
  await sql`
    insert into fuwari_list_audit (id, owner_id, actor_id, action, song_id, created_at)
    values (
      ${newId("a")}, ${row.ownerId}, ${row.actorId}, ${row.action},
      ${row.songId ?? ""}, now()
    )
  `;
}

async function expirePending(sql: Sql, ownerId?: string) {
  const cutoff = new Date(Date.now() - INVITE_MS).toISOString();
  if (ownerId) {
    await sql`
      delete from fuwari_list_ops
      where owner_id = ${ownerId}
        and status = 'pending'
        and invited_at < ${cutoff}
    `;
    return;
  }
  await sql`
    delete from fuwari_list_ops
    where status = 'pending' and invited_at < ${cutoff}
  `;
}

type ProfileLite = {
  user_id: string;
  soul_id: string;
  display_name: string;
  is_public: boolean;
  xproof_linked: boolean;
};

async function profileByUser(sql: Sql, userId: string) {
  const rows = await sql<ProfileLite>`
    select user_id, soul_id, display_name, is_public, xproof_linked
    from fuwari_profiles where user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

async function profileBySoul(sql: Sql, soulId: string) {
  const id = sanitizeSoulId(soulId);
  if (!id) return null;
  const rows = await sql<ProfileLite>`
    select user_id, soul_id, display_name, is_public, xproof_linked
    from fuwari_profiles where soul_id = ${id} limit 1
  `;
  return rows[0] ?? null;
}

function canReceiveOps(p: ProfileLite | null) {
  return Boolean(p && p.xproof_linked && p.soul_id && p.is_public);
}

function listGone(p: ProfileLite | null) {
  return !p || !p.xproof_linked || !p.soul_id;
}

export type OperatingList = {
  ownerId: string;
  soulId: string;
  displayName: string;
  isPublic: boolean;
  addable: boolean;
};

export type OpSeat = {
  opId: string;
  soulId: string;
  displayName: string;
  status: "pending" | "active";
  invitedAt: string | null;
  acceptedAt: string | null;
};

export type IncomingInvite = {
  ownerId: string;
  soulId: string;
  displayName: string;
  invitedAt: string | null;
};

export type MarkInfo = {
  songId: string;
  source: "self" | "proxy";
  canRevoke: boolean;
};

export const listMyListOps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSqlClient();
    await expirePending(sql);
    const seats = await sql<{
      op_id: string;
      status: string;
      invited_at: string | Date | null;
      accepted_at: string | Date | null;
      soul_id: string;
      display_name: string;
    }>`
      select o.op_id, o.status, o.invited_at, o.accepted_at,
             coalesce(p.soul_id, '') as soul_id,
             coalesce(p.display_name, '') as display_name
      from fuwari_list_ops o
      left join fuwari_profiles p on p.user_id = o.op_id
      where o.owner_id = ${context.userId}
      order by o.status asc, o.invited_at desc
    `;
    const incoming = await sql<{
      owner_id: string;
      invited_at: string | Date | null;
      soul_id: string;
      display_name: string;
    }>`
      select o.owner_id, o.invited_at,
             coalesce(p.soul_id, '') as soul_id,
             coalesce(p.display_name, '') as display_name
      from fuwari_list_ops o
      left join fuwari_profiles p on p.user_id = o.owner_id
      where o.op_id = ${context.userId} and o.status = 'pending'
        and o.invited_at >= ${new Date(Date.now() - INVITE_MS).toISOString()}
      order by o.invited_at desc
    `;
    const operating = await sql<{
      owner_id: string;
      soul_id: string;
      display_name: string;
      is_public: boolean;
      xproof_linked: boolean;
    }>`
      select o.owner_id,
             coalesce(p.soul_id, '') as soul_id,
             coalesce(p.display_name, '') as display_name,
             coalesce(p.is_public, false) as is_public,
             coalesce(p.xproof_linked, false) as xproof_linked
      from fuwari_list_ops o
      left join fuwari_profiles p on p.user_id = o.owner_id
      where o.op_id = ${context.userId} and o.status = 'active'
      order by p.display_name asc
    `;
    const since = jstDayStartIso();
    const used = await sql<{ n: number }>`
      select count(*)::int as n from fuwari_list_audit
      where actor_id = ${context.userId}
        and action = 'proxy_add'
        and created_at >= ${since}
    `;
    return {
      seats: seats.map((r) => ({
        opId: r.op_id,
        soulId: r.soul_id,
        displayName: r.display_name || r.soul_id || "運営",
        status: (r.status === "active" ? "active" : "pending") as "pending" | "active",
        invitedAt: asIso(r.invited_at),
        acceptedAt: asIso(r.accepted_at),
      })) satisfies OpSeat[],
      incoming: incoming.map((r) => ({
        ownerId: r.owner_id,
        soulId: r.soul_id,
        displayName: r.display_name || r.soul_id || "リスト",
        invitedAt: asIso(r.invited_at),
      })) satisfies IncomingInvite[],
      operating: operating.map((r) => ({
        ownerId: r.owner_id,
        soulId: r.soul_id,
        displayName: r.display_name || r.soul_id || "リスト",
        isPublic: Boolean(r.is_public),
        addable: Boolean(r.xproof_linked && r.soul_id),
      })) satisfies OperatingList[],
      todayProxyCount: Number(used[0]?.n) || 0,
      maxOps: MAX_OPS,
      proxyDaily: PROXY_DAILY,
    };
  });

export const lookupSoulForInvite = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((soulId: unknown) => sanitizeSoulId(String(soulId ?? "")))
  .handler(async ({ context, data: soulId }) => {
    if (!soulId) throw new Error("魂のIDを入れてください");
    const sql = await getSqlClient();
    const me = await profileByUser(sql, context.userId);
    if (!me?.soul_id) throw new Error("先に XProof で魂のIDを連携してください");
    if (me.soul_id === soulId) throw new Error("自分は招待できません");
    const p = await profileBySoul(sql, soulId);
    if (!canReceiveOps(p) || !p) {
      throw new Error("公開された魂のIDだけ招待できます");
    }
    return {
      userId: p.user_id,
      soulId: p.soul_id,
      displayName: p.display_name || p.soul_id,
    };
  });

export const inviteOperator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((soulId: unknown) => sanitizeSoulId(String(soulId ?? "")))
  .handler(async ({ context, data: soulId }) => {
    if (!soulId) throw new Error("魂のIDを入れてください");
    const sql = await getSqlClient();
    await expirePending(sql, context.userId);
    const me = await profileByUser(sql, context.userId);
    if (!me?.soul_id) throw new Error("先に XProof で魂のIDを連携してください");
    if (me.soul_id === soulId) throw new Error("自分は招待できません");
    const p = await profileBySoul(sql, soulId);
    if (!canReceiveOps(p) || !p) {
      throw new Error("公開された魂のIDだけ招待できます");
    }
    const existing = await sql<{ status: string }>`
      select status from fuwari_list_ops
      where owner_id = ${context.userId} and op_id = ${p.user_id} limit 1
    `;
    if (existing[0]?.status === "active") throw new Error("すでに運営です");
    if (existing[0]?.status === "pending") throw new Error("すでに招待中です");
    const n = await sql<{ n: number }>`
      select count(*)::int as n from fuwari_list_ops where owner_id = ${context.userId}
    `;
    if ((Number(n[0]?.n) || 0) >= MAX_OPS) {
      throw new Error(`運営は招待中を含めて ${MAX_OPS} 人までです`);
    }
    await sql`
      insert into fuwari_list_ops (owner_id, op_id, status, invited_at)
      values (${context.userId}, ${p.user_id}, 'pending', now())
    `;
    await audit(sql, {
      ownerId: context.userId,
      actorId: context.userId,
      action: "appoint",
    });
    return { ok: true as const };
  });

export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((opId: unknown) => clip(opId, 80))
  .handler(async ({ context, data: opId }) => {
    if (!opId) throw new Error("相手が指定されていません");
    const sql = await getSqlClient();
    await sql`
      delete from fuwari_list_ops
      where owner_id = ${context.userId} and op_id = ${opId} and status = 'pending'
    `;
    await audit(sql, {
      ownerId: context.userId,
      actorId: context.userId,
      action: "dismiss",
    });
    return { ok: true as const };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ownerId: unknown) => clip(ownerId, 80))
  .handler(async ({ context, data: ownerId }) => {
    if (!ownerId) throw new Error("リストが指定されていません");
    const sql = await getSqlClient();
    const cutoff = new Date(Date.now() - INVITE_MS).toISOString();
    const rows = await sql<{ owner_id: string }>`
      select owner_id from fuwari_list_ops
      where owner_id = ${ownerId} and op_id = ${context.userId}
        and status = 'pending' and invited_at >= ${cutoff}
      limit 1
    `;
    if (!rows[0]) throw new Error("招待が見つからないか、期限切れです");
    await sql`
      update fuwari_list_ops
      set status = 'active', accepted_at = now()
      where owner_id = ${ownerId} and op_id = ${context.userId}
    `;
    await audit(sql, {
      ownerId,
      actorId: context.userId,
      action: "accept",
    });
    return { ok: true as const };
  });

export const rejectInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ownerId: unknown) => clip(ownerId, 80))
  .handler(async ({ context, data: ownerId }) => {
    if (!ownerId) throw new Error("リストが指定されていません");
    const sql = await getSqlClient();
    await sql`
      delete from fuwari_list_ops
      where owner_id = ${ownerId} and op_id = ${context.userId} and status = 'pending'
    `;
    await audit(sql, {
      ownerId,
      actorId: context.userId,
      action: "reject",
    });
    return { ok: true as const };
  });

export const dismissOperator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((opId: unknown) => clip(opId, 80))
  .handler(async ({ context, data: opId }) => {
    if (!opId) throw new Error("相手が指定されていません");
    const sql = await getSqlClient();
    await sql`
      delete from fuwari_list_ops
      where owner_id = ${context.userId} and op_id = ${opId}
    `;
    await audit(sql, {
      ownerId: context.userId,
      actorId: context.userId,
      action: "dismiss",
    });
    return { ok: true as const };
  });

export const resignOperator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ownerId: unknown) => clip(ownerId, 80))
  .handler(async ({ context, data: ownerId }) => {
    if (!ownerId) throw new Error("リストが指定されていません");
    const sql = await getSqlClient();
    const rows = await sql<{ owner_id: string }>`
      select owner_id from fuwari_list_ops
      where owner_id = ${ownerId} and op_id = ${context.userId} and status = 'active'
      limit 1
    `;
    if (!rows[0]) throw new Error("このリストの運営ではありません");
    await sql`
      delete from fuwari_list_ops
      where owner_id = ${ownerId} and op_id = ${context.userId}
    `;
    await audit(sql, {
      ownerId,
      actorId: context.userId,
      action: "resign",
    });
    return { ok: true as const };
  });

async function assertActiveOp(sql: Sql, ownerId: string, opId: string) {
  const rows = await sql<{ owner_id: string }>`
    select owner_id from fuwari_list_ops
    where owner_id = ${ownerId} and op_id = ${opId} and status = 'active'
    limit 1
  `;
  if (!rows[0]) throw new Error("このリストの運営ではありません");
}

export const markSingableOn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { songId?: string; targetSoulId?: string };
    return {
      songId: clip(o.songId, 40),
      targetSoulId: sanitizeSoulId(String(o.targetSoulId ?? "")),
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.songId) throw new Error("曲が指定されていません");
    const sql = await getSqlClient();
    const found = await sql<{ id: string }>`
      select id from fuwari_songs where id = ${data.songId} limit 1
    `;
    if (!found[0]) throw new Error("曲が見つかりません");

    let targetSoulId = data.targetSoulId;
    if (targetSoulId) {
      const me = await profileByUser(sql, context.userId);
      if (me?.soul_id === targetSoulId) targetSoulId = "";
    }

    if (!targetSoulId) {
      const cur = await sql<{ source: string }>`
        select source from fuwari_singable
        where user_id = ${context.userId} and song_id = ${data.songId} limit 1
      `;
      if (cur[0]?.source === "proxy") {
        await sql`
          update fuwari_singable
          set source = 'self', added_by = ${context.userId}
          where user_id = ${context.userId} and song_id = ${data.songId}
        `;
        await audit(sql, {
          ownerId: context.userId,
          actorId: context.userId,
          action: "self_override",
          songId: data.songId,
        });
        return { ok: true as const, on: true as const, source: "self" as const };
      }
      if (cur[0]) return { ok: true as const, on: true as const, source: "self" as const };
      await sql`
        insert into fuwari_singable (user_id, song_id, created_at, source, added_by)
        values (${context.userId}, ${data.songId}, now(), 'self', ${context.userId})
        on conflict (user_id, song_id) do nothing
      `;
      await audit(sql, {
        ownerId: context.userId,
        actorId: context.userId,
        action: "self_add",
        songId: data.songId,
      });
      return { ok: true as const, on: true as const, source: "self" as const };
    }

    const owner = await profileBySoul(sql, targetSoulId);
    if (listGone(owner) || !owner) {
      throw new Error("このリストはもう追加できない。メニューから非表示にできます");
    }
    await assertActiveOp(sql, owner.user_id, context.userId);
    const cur = await sql<{ source: string }>`
      select source from fuwari_singable
      where user_id = ${owner.user_id} and song_id = ${data.songId} limit 1
    `;
    if (cur[0]?.source === "self") {
      throw new Error("本人がすでに登録しています");
    }
    if (cur[0]) return { ok: true as const, on: true as const, source: "proxy" as const };
    const since = jstDayStartIso();
    const used = await sql<{ n: number }>`
      select count(*)::int as n from fuwari_list_audit
      where actor_id = ${context.userId}
        and action = 'proxy_add'
        and created_at >= ${since}
    `;
    if ((Number(used[0]?.n) || 0) >= PROXY_DAILY) {
      throw new Error(`今日の代理登録は上限です（${PROXY_DAILY}/${PROXY_DAILY}）`);
    }
    const inserted = await sql<{ song_id: string }>`
      insert into fuwari_singable (user_id, song_id, created_at, source, added_by)
      values (${owner.user_id}, ${data.songId}, now(), 'proxy', ${context.userId})
      on conflict (user_id, song_id) do nothing
      returning song_id
    `;
    if (!inserted[0]) {
      return { ok: true as const, on: true as const, source: "proxy" as const };
    }
    await audit(sql, {
      ownerId: owner.user_id,
      actorId: context.userId,
      action: "proxy_add",
      songId: data.songId,
    });
    return { ok: true as const, on: true as const, source: "proxy" as const };
  });

export const unmarkSingableOn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { songId?: string; targetSoulId?: string };
    return {
      songId: clip(o.songId, 40),
      targetSoulId: sanitizeSoulId(String(o.targetSoulId ?? "")),
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.songId) throw new Error("曲が指定されていません");
    const sql = await getSqlClient();

    let targetSoulId = data.targetSoulId;
    if (targetSoulId) {
      const me = await profileByUser(sql, context.userId);
      if (me?.soul_id === targetSoulId) targetSoulId = "";
    }

    if (!targetSoulId) {
      await sql`
        delete from fuwari_singable
        where user_id = ${context.userId} and song_id = ${data.songId}
      `;
      await audit(sql, {
        ownerId: context.userId,
        actorId: context.userId,
        action: "owner_remove",
        songId: data.songId,
      });
      return { ok: true as const, on: false as const };
    }

    const owner = await profileBySoul(sql, targetSoulId);
    if (!owner) throw new Error("リストが見つかりません");
    await assertActiveOp(sql, owner.user_id, context.userId);
    const rows = await sql<{
      source: string;
      added_by: string;
      created_at: string | Date | null;
    }>`
      select source, added_by, created_at from fuwari_singable
      where user_id = ${owner.user_id} and song_id = ${data.songId} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: true as const, on: false as const };
    if (row.source !== "proxy" || row.added_by !== context.userId) {
      throw new Error("自分が代理で入れた曲だけ、30分以内に取り消せます");
    }
    const at = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (!at || Date.now() - at > REVOKE_MS) {
      throw new Error("取り消し期限（30分）を過ぎています");
    }
    await sql`
      delete from fuwari_singable
      where user_id = ${owner.user_id} and song_id = ${data.songId}
        and added_by = ${context.userId} and source = 'proxy'
    `;
    await audit(sql, {
      ownerId: owner.user_id,
      actorId: context.userId,
      action: "revoke",
      songId: data.songId,
    });
    return { ok: true as const, on: false as const };
  });

export const whichSingableOn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { ids?: unknown; targetSoulId?: string };
    const arr = Array.isArray(o.ids) ? o.ids : Array.isArray(raw) ? raw : [];
    return {
      ids: arr
        .map((id) => String(id ?? "").trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 50),
      targetSoulId: sanitizeSoulId(String(o.targetSoulId ?? "")),
    };
  })
  .handler(async ({ context, data }): Promise<MarkInfo[]> => {
    if (!data.ids.length) return [];
    const sql = await getSqlClient();
    let ownerId = context.userId;
    let actorIsOp = false;
    let targetSoulId = data.targetSoulId;
    if (targetSoulId) {
      const me = await profileByUser(sql, context.userId);
      if (me?.soul_id === targetSoulId) targetSoulId = "";
    }
    if (targetSoulId) {
      const owner = await profileBySoul(sql, targetSoulId);
      if (!owner) return [];
      ownerId = owner.user_id;
      try {
        await assertActiveOp(sql, owner.user_id, context.userId);
        actorIsOp = true;
      } catch {
        return [];
      }
    }
    const params: unknown[] = [ownerId, ...data.ids];
    const placeholders = data.ids.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await sql.query<{
      song_id: string;
      source: string;
      added_by: string;
      created_at: string | Date | null;
    }>(
      `select song_id, source, added_by, created_at from fuwari_singable
       where user_id = $1 and song_id in (${placeholders})`,
      params,
    );
    const now = Date.now();
    return rows.map((r) => {
      const at = r.created_at ? new Date(r.created_at).getTime() : 0;
      const canRevoke =
        actorIsOp &&
        r.source === "proxy" &&
        r.added_by === context.userId &&
        at > 0 &&
        now - at <= REVOKE_MS;
      return {
        songId: r.song_id,
        source: r.source === "proxy" ? "proxy" : "self",
        canRevoke,
      };
    });
  });

export type AuditRow = {
  id: string;
  action: string;
  songId: string;
  songTitle: string;
  actorSoulId: string;
  actorName: string;
  createdAt: string | null;
};

export const listOwnerAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { q?: string; page?: number };
    return {
      q: clip(o.q, 80),
      page: Math.max(1, Math.floor(Number(o.page) || 1)),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSqlClient();
    const pageSize = 20;
    const offset = (data.page - 1) * pageSize;
    const needle = data.q ? `%${data.q}%` : "";
    const countRows = needle
      ? await sql<{ n: number }>`
          select count(*)::int as n
          from fuwari_list_audit a
          left join fuwari_songs s on s.id = a.song_id
          left join fuwari_profiles p on p.user_id = a.actor_id
          where a.owner_id = ${context.userId}
            and (
              a.action ilike ${needle} or a.song_id ilike ${needle}
              or coalesce(s.title, '') ilike ${needle}
              or coalesce(p.soul_id, '') ilike ${needle}
              or coalesce(p.display_name, '') ilike ${needle}
            )
        `
      : await sql<{ n: number }>`
          select count(*)::int as n from fuwari_list_audit
          where owner_id = ${context.userId}
        `;
    const rows = needle
      ? await sql<{
          id: string;
          action: string;
          song_id: string;
          title: string | null;
          soul_id: string | null;
          display_name: string | null;
          created_at: string | Date | null;
        }>`
          select a.id, a.action, a.song_id, s.title,
                 p.soul_id, p.display_name, a.created_at
          from fuwari_list_audit a
          left join fuwari_songs s on s.id = a.song_id
          left join fuwari_profiles p on p.user_id = a.actor_id
          where a.owner_id = ${context.userId}
            and (
              a.action ilike ${needle} or a.song_id ilike ${needle}
              or coalesce(s.title, '') ilike ${needle}
              or coalesce(p.soul_id, '') ilike ${needle}
              or coalesce(p.display_name, '') ilike ${needle}
            )
          order by a.created_at desc
          limit ${pageSize} offset ${offset}
        `
      : await sql<{
          id: string;
          action: string;
          song_id: string;
          title: string | null;
          soul_id: string | null;
          display_name: string | null;
          created_at: string | Date | null;
        }>`
          select a.id, a.action, a.song_id, s.title,
                 p.soul_id, p.display_name, a.created_at
          from fuwari_list_audit a
          left join fuwari_songs s on s.id = a.song_id
          left join fuwari_profiles p on p.user_id = a.actor_id
          where a.owner_id = ${context.userId}
          order by a.created_at desc
          limit ${pageSize} offset ${offset}
        `;
    return {
      total: Number(countRows[0]?.n) || 0,
      page: data.page,
      pageSize,
      rows: rows.map((r) => ({
        id: r.id,
        action: r.action,
        songId: r.song_id,
        songTitle: r.title || "",
        actorSoulId: r.soul_id || "",
        actorName: r.display_name || r.soul_id || "",
        createdAt: asIso(r.created_at),
      })) satisfies AuditRow[],
    };
  });
