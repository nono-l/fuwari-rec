import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "src/lib/page-dates.generated.ts");

/** Route files plus the body that page actually renders. */
const EXTRA = {
  "/": ["src/components/editor", "src/lib/audio", "src/lib/store"],
  "/effector": [
    "src/components/editor/effects-panel.tsx",
    "src/components/editor/pipeline-rack.tsx",
  ],
  "/train": ["src/components/editor/vocal-train-panel.tsx"],
  "/AI": ["src/components/editor/ai-runtime-panel.tsx", "src/lib/audio"],
  "/range": ["src/components/editor/range-panel.tsx"],
  "/analyze": ["src/components/editor/media-range-panel.tsx"],
};

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "page-dates.generated.ts" || name.startsWith(".")) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else if (/\.(tsx|ts|css|mjs)$/.test(name)) acc.push(abs);
  }
  return acc;
}

function routeFromFile(abs) {
  const rel = relative(root, abs).replaceAll("\\", "/");
  if (!rel.startsWith("src/routes/") || rel.startsWith("src/routes/api/")) return null;
  if (rel.endsWith("/__root.tsx") || rel.endsWith("/__root.ts")) return null;
  let rest = rel.slice("src/routes/".length).replace(/\.tsx?$/, "");
  if (rest === "index") return "/";
  if (rest.endsWith("/index")) rest = rest.slice(0, -"/index".length);
  const parts = rest.split("/").flatMap((seg) => {
    if (seg.endsWith(".index")) seg = seg.slice(0, -".index".length);
    if (!seg) return [];
    return seg.split(".").filter(Boolean);
  });
  if (!parts.length) return "/";
  return `/${parts.join("/")}`;
}

function collectPages() {
  const pages = new Map();
  const add = (route, abs) => {
    if (!route || !existsSync(abs)) return;
    const st = statSync(abs);
    const files = st.isDirectory() ? walk(abs) : [abs];
    const cur = pages.get(route) ?? [];
    for (const file of files) {
      if (!cur.includes(file)) cur.push(file);
    }
    pages.set(route, cur);
  };
  for (const file of walk(join(root, "src/routes"))) add(routeFromFile(file), file);
  for (const [route, rels] of Object.entries(EXTRA)) {
    for (const rel of rels) add(route, join(root, rel));
  }
  return pages;
}

function hashFiles(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function toJst(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return toJst(new Date());
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}+09:00`;
}

function newestMtime(files) {
  let ms = 0;
  for (const file of files) {
    const t = statSync(file).mtimeMs;
    if (t > ms) ms = t;
  }
  return toJst(new Date(ms || Date.now()));
}

function commitTime(files) {
  const rels = files.map((file) => relative(root, file));
  const iso = git(["log", "-1", "--format=%cI", "--", ...rels]);
  return iso ? toJst(iso) : "";
}

function isDirty(files) {
  const rels = files.map((file) => relative(root, file));
  const status = git(["status", "--porcelain", "--", ...rels]);
  return status.length > 0;
}

function readPrev() {
  if (!existsSync(outFile)) return {};
  const text = readFileSync(outFile, "utf8");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return {};
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
}

export function isPageSource(file) {
  const rel = relative(root, resolve(file)).replaceAll("\\", "/");
  if (!rel.startsWith("src/")) return false;
  if (rel === "src/lib/page-dates.generated.ts") return false;
  if (rel.startsWith("src/routes/api/")) return false;
  return (
    rel.startsWith("src/routes/") ||
    rel.startsWith("src/components/") ||
    rel.startsWith("src/lib/audio/") ||
    rel.startsWith("src/lib/store/")
  );
}

export function stampPageDates() {
  const prev = readPrev();
  const pages = collectPages();
  const next = {};
  for (const [route, files] of pages) {
    if (!files.length) continue;
    const hash = hashFiles(files);
    const old = prev[route];
    if (old?.hash === hash && old.published && old.modified) {
      next[route] = { published: old.published, modified: old.modified, hash };
      continue;
    }
    const modified = isDirty(files) ? newestMtime(files) : commitTime(files) || newestMtime(files);
    next[route] = {
      published: old?.published || modified,
      modified,
      hash,
    };
  }
  const body = `// Generated by scripts/page-dates.mjs. Do not edit.
export type PageDate = {
  published: string;
  modified: string;
  hash: string;
};

export const PAGE_DATES: Record<string, PageDate> = ${JSON.stringify(next, null, 2)};
`;
  const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (current !== body) writeFileSync(outFile, body);
  return next;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) stampPageDates();
