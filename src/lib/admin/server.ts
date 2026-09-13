import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { sanitizeSoulId } from "@/lib/profile/xproof";

export const DEFAULT_ADMIN_EMAIL = "touko5536@gmail.com";
export const DEFAULT_ADMIN_USER_IDS = [
  "dIb2xDgKlwdhphLFMK1VEL9WGFDnlb7f",
] as const;

function builtinIdEmail(userId: string) {
  return `id:${userId}`;
}

function isBuiltinUserId(userId: string) {
  return (DEFAULT_ADMIN_USER_IDS as readonly string[]).includes(userId);
}

export function isDefaultAdminEmail(email: string) {
  return normEmail(email) === DEFAULT_ADMIN_EMAIL;
}

export function isBuiltinAdmin(userId: string, email = "") {
  if (userId && isBuiltinUserId(userId)) return true;
  if (email && isDefaultAdminEmail(email)) return true;
  if (email.startsWith("id:") && isBuiltinUserId(email.slice(3))) return true;
  return false;
}

function normEmail(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function clip(raw: unknown, n: number) {
  return String(raw ?? "").trim().slice(0, n);
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

async function emailForUser(sql: Sql, userId: string) {
  const rows = await sql<{ email: string }>`
    select email from "user" where id = ${userId} limit 1
  `;
  return normEmail(rows[0]?.email);
}

async function userByEmail(sql: Sql, email: string) {
  const id = normEmail(email);
  if (!id) return null;
  const rows = await sql<{ id: string; email: string; name: string }>`
    select id, email, name from "user" where lower(email) = ${id} limit 1
  `;
  return rows[0] ?? null;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const sql = await getSqlClient();
  const email = await emailForUser(sql, userId);

  if (isBuiltinUserId(userId)) {
    const existing = await sql<{ email: string }>`
      select email from fuwari_admins
      where user_id = ${userId} or email = ${builtinIdEmail(userId)}
      limit 1
    `;
    if (!existing[0]) {
      await sql`
        insert into fuwari_admins (email, user_id, granted_by)
        values (${builtinIdEmail(userId)}, ${userId}, 'builtin')
        on conflict (email) do update set
          user_id = excluded.user_id
      `;
    }
    return true;
  }
  if (isDefaultAdminEmail(email)) {
    await sql`
      insert into fuwari_admins (email, user_id, granted_by)
      values (${DEFAULT_ADMIN_EMAIL}, ${userId}, 'builtin')
      on conflict (email) do update set
        user_id = excluded.user_id
    `;
    return true;
  }
  if (email) {
    const byEmail = await sql<{ email: string }>`
      select email from fuwari_admins where email = ${email} limit 1
    `;
    if (byEmail[0]) {
      await sql`
        update fuwari_admins set user_id = ${userId}
        where email = ${email} and (user_id = '' or user_id is null)
      `;
      return true;
    }
  }
  const byId = await sql<{ email: string }>`
    select email from fuwari_admins where user_id = ${userId} limit 1
  `;
  return Boolean(byId[0]);
}

async function assertAdmin(userId: string) {
  if (!(await isAdminUser(userId))) {
    throw new Error("管理者だけが使えます");
  }
}

export type AdminRow = {
  email: string;
  userId: string;
  displayName: string;
  soulId: string;
  builtin: boolean;
  createdAt: string | null;
};

export const getMyAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const admin = await isAdminUser(context.userId);
    return { admin };
  });

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const sql = await getSqlClient();
    const rows = await sql<{
      email: string;
      user_id: string;
      granted_by: string;
      created_at: string | Date | null;
      name: string | null;
      soul_id: string | null;
      display_name: string | null;
    }>`
      select a.email, a.user_id, a.granted_by, a.created_at,
             u.name, p.soul_id, p.display_name
      from fuwari_admins a
      left join "user" u on u.id = a.user_id
      left join fuwari_profiles p on p.user_id = a.user_id
      order by a.created_at asc
    `;
    const mapped: AdminRow[] = rows.map((r) => ({
      email: r.email,
      userId: r.user_id || "",
      displayName: (r.display_name || r.name || "").trim(),
      soulId: r.soul_id || "",
      builtin: isBuiltinAdmin(r.user_id || "", r.email),
      createdAt:
        typeof r.created_at === "string"
          ? r.created_at
          : r.created_at
            ? r.created_at.toISOString()
            : null,
    }));
    if (!mapped.some((r) => isDefaultAdminEmail(r.email))) {
      const u = await userByEmail(sql, DEFAULT_ADMIN_EMAIL);
      mapped.unshift({
        email: DEFAULT_ADMIN_EMAIL,
        userId: u?.id ?? "",
        displayName: u?.name ?? "",
        soulId: "",
        builtin: true,
        createdAt: null,
      });
    }
    for (const id of DEFAULT_ADMIN_USER_IDS) {
      if (mapped.some((r) => r.userId === id || r.email === builtinIdEmail(id))) continue;
      const u = await sql<{ name: string }>`
        select name from "user" where id = ${id} limit 1
      `;
      const p = await sql<{ soul_id: string; display_name: string }>`
        select soul_id, display_name from fuwari_profiles where user_id = ${id} limit 1
      `;
      mapped.push({
        email: builtinIdEmail(id),
        userId: id,
        displayName: (p[0]?.display_name || u[0]?.name || "").trim(),
        soulId: p[0]?.soul_id || "",
        builtin: true,
        createdAt: null,
      });
    }
    return {
      admins: mapped,
      defaultEmail: DEFAULT_ADMIN_EMAIL,
      defaultUserIds: [...DEFAULT_ADMIN_USER_IDS],
    };
  });

export const appointAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { email?: string; soulId?: string; userId?: string };
    return {
      email: normEmail(o.email),
      soulId: sanitizeSoulId(String(o.soulId ?? "")),
      userId: clip(o.userId, 80),
    };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (!data.email && !data.soulId && !data.userId) {
      throw new Error("内部ID・魂のID・メールのいずれかを入れてください");
    }
    const sql = await getSqlClient();
    let email = data.email;
    let userId = "";

    const rawId = data.userId;
    if (rawId.includes("@")) {
      email = email || normEmail(rawId);
    } else if (rawId) {
      const u = await sql<{ id: string; email: string }>`
        select id, email from "user" where id = ${rawId} limit 1
      `;
      if (!u[0]) throw new Error("その内部IDは見つかりません");
      userId = u[0].id;
      email = email || normEmail(u[0].email);
    }

    if (data.soulId) {
      const p = await sql<{ user_id: string }>`
        select user_id from fuwari_profiles where soul_id = ${data.soulId} limit 1
      `;
      if (!p[0]) throw new Error("その魂のIDは見つかりません");
      userId = userId || p[0].user_id;
      email = email || (await emailForUser(sql, userId));
    }
    if (email) {
      const u = await userByEmail(sql, email);
      if (u) userId = userId || u.id;
    }
    if (!userId && !email) {
      throw new Error("相手が見つかりません");
    }
    if (!email) {
      email = `id:${userId}`;
    }
    if (isBuiltinAdmin(userId, email)) {
      throw new Error("最初から管理者です");
    }
    const exists = await sql<{ email: string }>`
      select email from fuwari_admins
      where (${userId} <> '' and user_id = ${userId})
         or email = ${email}
      limit 1
    `;
    if (exists[0]) throw new Error("すでに管理者です");
    const granter = await emailForUser(sql, context.userId);
    await sql`
      insert into fuwari_admins (email, user_id, granted_by)
      values (${email}, ${userId}, ${granter || context.userId})
    `;
    return { ok: true as const };
  });

export const removeAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((email: unknown) => clip(email, 120))
  .handler(async ({ context, data: email }) => {
    await assertAdmin(context.userId);
    if (!email) throw new Error("相手が指定されていません");
    const sql = await getSqlClient();
    const rows = await sql<{ email: string; user_id: string }>`
      select email, user_id from fuwari_admins
      where email = ${email} or lower(email) = ${normEmail(email)}
      limit 1
    `;
    const row = rows[0];
    if (isBuiltinAdmin(row?.user_id || "", row?.email || email)) {
      throw new Error("ビルトイン管理者は外せません");
    }
    if (row) {
      await sql`delete from fuwari_admins where email = ${row.email}`;
    }
    return { ok: true as const };
  });

export const adminDeleteSong = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clip(id, 40))
  .handler(async ({ context, data: id }) => {
    await assertAdmin(context.userId);
    if (!id) throw new Error("曲が指定されていません");
    const sql = await getSqlClient();
    await sql`delete from fuwari_singable where song_id = ${id}`;
    await sql`delete from fuwari_song_links where song_id = ${id}`;
    await sql`delete from fuwari_list_audit where song_id = ${id}`;
    await sql`delete from fuwari_songs where id = ${id}`;
    return { ok: true as const };
  });

export const adminSetProfilePublic = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { userId?: string; isPublic?: boolean };
    return {
      userId: clip(o.userId, 80),
      isPublic: Boolean(o.isPublic),
    };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (!data.userId) throw new Error("相手が指定されていません");
    const sql = await getSqlClient();
    await sql`
      update fuwari_profiles set is_public = ${data.isPublic}, updated_at = now()
      where user_id = ${data.userId}
    `;
    return { ok: true as const, isPublic: data.isPublic };
  });

export type AdminProfileRow = {
  userId: string;
  soulId: string;
  displayName: string;
  email: string;
  isPublic: boolean;
};

export const adminSearchProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((q: unknown) => clip(q, 80))
  .handler(async ({ context, data: q }) => {
    await assertAdmin(context.userId);
    const sql = await getSqlClient();
    const needle = q ? `%${q}%` : "";
    const rows = needle
      ? await sql<{
          user_id: string;
          soul_id: string;
          display_name: string;
          is_public: boolean;
          email: string | null;
        }>`
          select p.user_id, p.soul_id, p.display_name, p.is_public, u.email
          from fuwari_profiles p
          left join "user" u on u.id = p.user_id
          where p.soul_id ilike ${needle}
             or p.display_name ilike ${needle}
             or coalesce(u.email, '') ilike ${needle}
          order by p.updated_at desc
          limit 30
        `
      : await sql<{
          user_id: string;
          soul_id: string;
          display_name: string;
          is_public: boolean;
          email: string | null;
        }>`
          select p.user_id, p.soul_id, p.display_name, p.is_public, u.email
          from fuwari_profiles p
          left join "user" u on u.id = p.user_id
          order by p.updated_at desc
          limit 20
        `;
    return {
      profiles: rows.map((r) => ({
        userId: r.user_id,
        soulId: r.soul_id || "",
        displayName: r.display_name || r.soul_id || "",
        email: r.email || "",
        isPublic: Boolean(r.is_public),
      })) satisfies AdminProfileRow[],
    };
  });
