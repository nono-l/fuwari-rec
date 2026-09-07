const RETURN_KEY = "fuwari-auth-return-to";

export type AuthPublicConfig = {
  canonicalOrigin: string | null;
  handoffOrigins: string[];
};

export async function fetchAuthPublicConfig(): Promise<AuthPublicConfig> {
  try {
    const res = await fetch("/api/auth-public-config", {
      credentials: "same-origin",
    });
    if (!res.ok) return { canonicalOrigin: null, handoffOrigins: [] };
    const data = (await res.json()) as Partial<AuthPublicConfig>;
    return {
      canonicalOrigin: data.canonicalOrigin ?? null,
      handoffOrigins: Array.isArray(data.handoffOrigins)
        ? data.handoffOrigins.filter((o) => typeof o === "string")
        : [],
    };
  } catch {
    return { canonicalOrigin: null, handoffOrigins: [] };
  }
}

export function rememberReturnTo(url: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RETURN_KEY, url);
  } catch {
    /* ignore */
  }
}

export function readReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearReturnTo() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
}

export function isAllowedReturnTo(
  raw: string,
  handoffOrigins: string[],
): URL | null {
  let dest: URL;
  try {
    dest = new URL(raw);
  } catch {
    return null;
  }
  if (dest.protocol !== "https:" && dest.protocol !== "http:") return null;
  const origin = dest.origin;
  if (handoffOrigins.some((o) => o.replace(/\/+$/, "") === origin)) {
    return dest;
  }
  // Same-host relative is never passed as absolute here; allow current origin.
  if (typeof window !== "undefined" && origin === window.location.origin) {
    return dest;
  }
  return null;
}

export function bridgeCallbackURL(returnTo: string) {
  return `/auth/bridge?returnTo=${encodeURIComponent(returnTo)}`;
}
