import { PAGE_DATES, type PageDate } from "@/lib/page-dates.generated";

export type PageDateStamp = {
  published?: string;
  modified?: string;
};

/** Head tags 棚 (tana) reads: article dates, then JSON-LD, then Last-Modified. */
export function articleDateHead(dates: PageDateStamp) {
  const meta: Array<
    { property: string; content: string } | { name: string; content: string }
  > = [];
  if (dates.published) {
    meta.push({ property: "article:published_time", content: dates.published });
  }
  if (dates.modified) {
    meta.push({ property: "article:modified_time", content: dates.modified });
    meta.push({ name: "date", content: dates.modified });
  }
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    ...(dates.published ? { datePublished: dates.published } : {}),
    ...(dates.modified ? { dateModified: dates.modified } : {}),
  };
  const scripts =
    dates.published || dates.modified
      ? [{ type: "application/ld+json", children: JSON.stringify(ld) }]
      : [];
  return { meta, scripts };
}

export function pageDateForPath(pathname: string): PageDateStamp {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  const table = PAGE_DATES as Record<string, PageDate>;
  if (table[path]) return table[path];
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const pattern = `^${key.replace(/\$[^/]+/g, "[^/]+").replace(/\/$/, "")}/?$`;
    if (new RegExp(pattern).test(path)) return table[key]!;
  }
  return table["/"] ?? {};
}

export function lastModifiedHeader(dates: PageDateStamp): Record<string, string> | undefined {
  if (!dates.modified) return;
  const ms = Date.parse(dates.modified);
  if (Number.isNaN(ms)) return;
  return { "Last-Modified": new Date(ms).toUTCString() };
}
