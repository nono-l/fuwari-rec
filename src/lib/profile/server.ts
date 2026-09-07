import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  emptyProfile,
  XPROOF_CLIENT,
  XPROOF_ORIGIN,
  type PublicFxCard,
  type SingerProfile,
  type XproofIdentity,
} from "./types";
import { identitiesToFields, mergeIdentities, sanitizeSoulId, slugifyHandle } from "./xproof";

type ProfileRow = {
  user_id: string;
  slug: string;
  soul_id: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  is_public: boolean;
  x_handle: string;
  youtube_json: string;
  identities_json: string;
  xproof_linked: boolean;
  xproof_linked_at: string | Date | null;
  range_min_note: string;
  range_max_note: string;
  range_span: number;
  range_published_at: string | Date | null;
  fx_json: string;
  updated_at: string | Date | null;
};

function asIso(v: string | Date | null | undefined) {
  if (!v) return null;
  if (typeof v === "string") return v;
  return v.toISOString();
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToProfile(row: ProfileRow): SingerProfile {
  const identities = parseJson<XproofIdentity[]>(row.identities_json, []);
  const youtube = parseJson<string[]>(row.youtube_json, []);
  const fromIds = identitiesToFields(identities);
  return {
    slug: row.slug,
    soulId: row.soul_id || "",
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    isPublic: Boolean(row.is_public),
    xHandle: row.x_handle || fromIds.xHandle,
    youtube: youtube.length ? youtube : fromIds.youtube,
    identities,
    xproofLinked: Boolean(row.xproof_linked),
    xproofLinkedAt: asIso(row.xproof_linked_at),
    rangeMinNote: row.range_min_note,
    rangeMaxNote: row.range_max_note,
    rangeSpan: Number(row.range_span) || 0,
    rangePublishedAt: asIso(row.range_published_at),
    fx: parseJson<PublicFxCard[]>(row.fx_json, []),
    updatedAt: asIso(row.updated_at),
  };
}

function sanitizeSlug(raw: string) {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return s.length >= 2 ? s : "";
}

function fallbackSlug(seed: string) {
  const base = sanitizeSlug(seed) || "singer";
  const tail = Math.random().toString(36).slice(2, 6);
  return `${base}-${tail}`.slice(0, 32);
}

async function consumeXproofToken(token: string): Promise<{
  identities: XproofIdentity[];
  soulId?: string;
  error?: string;
}> {
  const body = JSON.stringify({
    token,
    client: XPROOF_CLIENT,
    service_name: "Fuwari REC",
  });
  const urls = [
    `${XPROOF_ORIGIN}/api/tauth/consume`,
    `${XPROOF_ORIGIN}/api/tauth-challenge`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, unknown>;
      const ids = identitiesFromUnknown(data);
      const soulId = sanitizeSoulId(String(data.soulId ?? data.soul_id ?? ""));
      if (ids.length || soulId) return { identities: ids, soulId: soulId || undefined };
    } catch {
      /* try next */
    }
  }

  try {
    const nonceRes = await fetch(
      `${XPROOF_ORIGIN}/api/tauth-challenge?token=${encodeURIComponent(token)}`,
      { headers: { accept: "application/json" } },
    );
    if (nonceRes.ok) {
      const nonceJson = (await nonceRes.json()) as { nonce?: string };
      if (nonceJson.nonce) {
        const confirm = await fetch(`${XPROOF_ORIGIN}/api/tauth-challenge`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            token,
            nonce: nonceJson.nonce,
            service_name: "Fuwari REC",
          }),
        });
        if (confirm.ok) {
          const data = (await confirm.json()) as Record<string, unknown>;
          const ids = identitiesFromUnknown(data);
          if (data.provisional_token) {
            await fetch(`${XPROOF_ORIGIN}/api/tauth-challenge`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
              },
              body: JSON.stringify({
                provisional_token: data.provisional_token,
                accept: true,
              }),
            }).catch(() => null);
          }
          if (ids.length) return { identities: ids, soulId: sanitizeSoulId(String(data.soulId ?? "")) || undefined };
          if (typeof data.username === "string") {
            return {
              identities: [
                { platform: "x", username: slugifyHandle(data.username) },
              ],
            };
          }
        }
      }
    }
  } catch {
    /* fall through */
  }

  return { identities: [], error: "XProof 側の消費 API に届きませんでした" };
}

function identitiesFromUnknown(data: Record<string, unknown>): XproofIdentity[] {
  const out: XproofIdentity[] = [];
  const push = (platform: XproofIdentity["platform"], username: unknown) => {
    const u = slugifyHandle(String(username ?? ""));
    if (u) out.push({ platform, username: u });
  };
  if (Array.isArray(data.identities)) {
    for (const item of data.identities) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const platform = String(rec.platform ?? "");
      if (platform === "x" || platform === "youtube" || platform === "dns") {
        push(platform, rec.username ?? rec.handle);
      }
    }
  }
  if (
    data.platform === "x" ||
    data.platform === "youtube" ||
    data.platform === "dns"
  ) {
    push(data.platform, data.username ?? data.handle);
  }
  push("x", data.x ?? data.x_handle ?? data.handle);
  const yt = data.youtube ?? data.channels;
  if (Array.isArray(yt)) {
    for (const ch of yt) push("youtube", ch);
  } else if (typeof yt === "string") {
    for (const ch of yt.split(/[,\s]+/)) push("youtube", ch);
  }
  return mergeIdentities([], out);
}

async function loadOrCreate(userId: string): Promise<SingerProfile> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select * from fuwari_profiles where user_id = ${userId} limit 1
  `;
  if (rows[0]) return rowToProfile(rows[0]);
  const slug = fallbackSlug(userId.slice(0, 8));
  await sql`
    insert into fuwari_profiles (user_id, slug, updated_at)
    values (${userId}, ${slug}, now())
    on conflict (user_id) do nothing
  `;
  const again = await sql<ProfileRow>`
    select * from fuwari_profiles where user_id = ${userId} limit 1
  `;
  return again[0] ? rowToProfile(again[0]) : emptyProfile(slug);
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => loadOrCreate(context.userId));

export const getPublicProfile = createServerFn({ method: "GET" })
  .validator((soulId: string) => sanitizeSoulId(String(soulId || "")))
  .handler(async ({ data: soulId }) => {
    if (!soulId) return null;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select * from fuwari_profiles
      where soul_id = ${soulId} and is_public = true and xproof_linked = true
      limit 1
    `;
    return rows[0] ? rowToProfile(rows[0]) : null;
  });

export type ProfilePatch = {
  slug?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  isPublic?: boolean;
  xHandle?: string;
  youtube?: string[];
  rangeMinNote?: string;
  rangeMaxNote?: string;
  rangeSpan?: number;
  clearRange?: boolean;
  fx?: PublicFxCard[];
};

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((patch: ProfilePatch) => patch)
  .handler(async ({ context, data: patch }) => {
    const current = await loadOrCreate(context.userId);
    let slug = current.slug;
    if (patch.slug != null) {
      const wanted = sanitizeSlug(patch.slug) || current.slug;
      if (wanted !== current.slug) {
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const taken = await sql<{ n: number }>`
          select count(*)::int as n from fuwari_profiles
          where lower(slug) = ${wanted} and user_id <> ${context.userId}
        `;
        if ((taken[0]?.n ?? 0) > 0) {
          throw new Error("この公開URLはすでに使われています");
        }
        slug = wanted;
      }
    }
    const rangeCleared = Boolean(patch.clearRange);
    const rangeChanged =
      !rangeCleared &&
      (patch.rangeMinNote != null ||
        patch.rangeMaxNote != null ||
        patch.rangeSpan != null);
    const next: SingerProfile = {
      ...current,
      slug,
      displayName:
        patch.displayName != null
          ? String(patch.displayName).slice(0, 80)
          : current.displayName,
      bio: patch.bio != null ? String(patch.bio).slice(0, 500) : current.bio,
      avatarUrl:
        patch.avatarUrl != null
          ? String(patch.avatarUrl).slice(0, 500)
          : current.avatarUrl,
      isPublic: patch.isPublic ?? current.isPublic,
      xHandle: current.xHandle,
      youtube: current.youtube,
      rangeMinNote: rangeCleared
        ? ""
        : patch.rangeMinNote != null
          ? String(patch.rangeMinNote).slice(0, 8)
          : current.rangeMinNote,
      rangeMaxNote: rangeCleared
        ? ""
        : patch.rangeMaxNote != null
          ? String(patch.rangeMaxNote).slice(0, 8)
          : current.rangeMaxNote,
      rangeSpan: rangeCleared
        ? 0
        : patch.rangeSpan != null
          ? Math.max(0, Math.round(patch.rangeSpan))
          : current.rangeSpan,
      rangePublishedAt: rangeCleared
        ? null
        : rangeChanged
          ? new Date().toISOString()
          : current.rangePublishedAt,
      fx: patch.fx ? patch.fx.slice(0, 12) : current.fx,
    };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into fuwari_profiles (
        user_id, slug, soul_id, display_name, bio, avatar_url, is_public,
        x_handle, youtube_json, identities_json, xproof_linked, xproof_linked_at,
        range_min_note, range_max_note, range_span, range_published_at,
        fx_json, updated_at
      ) values (
        ${context.userId}, ${next.slug}, ${current.soulId}, ${next.displayName}, ${next.bio},
        ${next.avatarUrl}, ${next.isPublic}, ${next.xHandle},
        ${JSON.stringify(next.youtube)}, ${JSON.stringify(next.identities)},
        ${next.xproofLinked}, ${next.xproofLinkedAt},
        ${next.rangeMinNote}, ${next.rangeMaxNote}, ${next.rangeSpan},
        ${next.rangePublishedAt},
        ${JSON.stringify(next.fx)}, now()
      )
      on conflict (user_id) do update set
        slug = excluded.slug,
        display_name = excluded.display_name,
        bio = excluded.bio,
        avatar_url = excluded.avatar_url,
        is_public = excluded.is_public,
        x_handle = excluded.x_handle,
        youtube_json = excluded.youtube_json,
        range_min_note = excluded.range_min_note,
        range_max_note = excluded.range_max_note,
        range_span = excluded.range_span,
        range_published_at = excluded.range_published_at,
        fx_json = excluded.fx_json,
        updated_at = now()
    `;
    return loadOrCreate(context.userId);
  });

export const linkXproof = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => ({
    token: String(input.token || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.token) {
      return {
        profile: await loadOrCreate(context.userId),
        consumeError: "連携トークンがありません",
      };
    }
    const current = await loadOrCreate(context.userId);
    const result = await consumeXproofToken(data.token);
    const soulId = sanitizeSoulId(result.soulId || "");
    if (!soulId) {
      return {
        profile: current,
        consumeError:
          result.error ||
          "XProof で魂のIDを設定してから、もう一度連携してください",
      };
    }
    const identities = result.identities;
    const fields = identitiesToFields(identities);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const taken = await sql<{ n: number }>`
      select count(*)::int as n from fuwari_profiles
      where soul_id = ${soulId} and user_id <> ${context.userId}
    `;
    if ((taken[0]?.n ?? 0) > 0) {
      return {
        profile: current,
        consumeError: "この魂のIDは別のアカウントで公開されています",
      };
    }
    await sql`
      update fuwari_profiles set
        soul_id = ${soulId},
        slug = ${soulId.slice(0, 32)},
        identities_json = ${JSON.stringify(identities)},
        x_handle = ${fields.xHandle},
        youtube_json = ${JSON.stringify(fields.youtube)},
        xproof_linked = true,
        xproof_linked_at = ${new Date().toISOString()},
        updated_at = now()
      where user_id = ${context.userId}
    `;
    return { profile: await loadOrCreate(context.userId), consumeError: undefined };
  });

export const unlinkXproof = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      update fuwari_profiles set
        soul_id = '',
        identities_json = '[]',
        x_handle = '',
        youtube_json = '[]',
        xproof_linked = false,
        xproof_linked_at = null,
        updated_at = now()
      where user_id = ${context.userId}
    `;
    return loadOrCreate(context.userId);
  });
