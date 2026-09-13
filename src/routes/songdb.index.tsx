import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/editor/app-shell";
import { SongdbPanel } from "@/components/editor/songdb-panel";

const searchSchema = z.object({
  arrange: z.string().optional(),
});

export const Route = createFileRoute("/songdb/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: SongdbPage,
  head: () => ({
    meta: [{ title: "楽曲リスト — Fuwari REC" }],
  }),
});

function SongdbPage() {
  const { arrange } = Route.useSearch();
  return (
    <AppShell
      title="楽曲リスト"
      description="曲名・歌手名・歌詞の一部・番組名・原曲からさがします。同じ原曲にアレンジを何件でも登録できます。"
      transport={false}
    >
      <SongdbPanel arrangeCode={arrange ?? ""} />
    </AppShell>
  );
}
