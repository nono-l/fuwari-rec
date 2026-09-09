import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "配信規約 / ビデオポリシー · Fuwari REC" },
      {
        name: "description",
        content: "Fuwari REC streaming terms / video policy",
      },
    ],
  }),
});

function Block({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-10">
      <h2 className="text-[13px] font-semibold tracking-[0.18em] text-muted-foreground">
        {title}
      </h2>
      <p className="mt-3 text-[15px] leading-8 text-foreground">{body}</p>
    </section>
  );
}

function TermsPage() {
  return (
    <main className="min-h-dvh bg-background px-6 pb-20 pt-16 text-foreground antialiased">
      <article className="mx-auto w-full max-w-[34rem]">
        <div className="text-[11px] tracking-[0.28em] text-muted-foreground">
          FUWARI REC
        </div>
        <h1 className="mt-6 text-[28px] font-semibold tracking-[0.08em]">
          Streaming terms
        </h1>
        <div className="mt-2 text-[13px] tracking-[0.22em] text-muted-foreground">
          Video policy
        </div>
        <p className="mt-10 text-[15px] leading-8 text-foreground">
          歌を外へ運ぶ契約です。許可は短い。条件はひとつです。
        </p>
        <Block
          title="Condition"
          body="名前を付ける。XProof で魂のIDが付いた歌だけ、スタジオの外へ出してよい。配信、収録、切り抜き、再編集、再投稿、公開を含む。回数も長さも問わない。名前があるから、登録者や再生が誰の実績か分かる。名前のないまま外へ出すのは仕様外で、許可しない。"
        />
        <Block
          title="Not asked"
          body="プラットフォームは問わない。個人か会社かも問わない。収益も、有料か無料も、人数も問わない。事前連絡はいらない。収益分配もない。"
        />
        <Block
          title="Fine to leave in"
          body="声域、エフェクト、伴奏の曲名、スタジオの画面。YouTube の公式埋め込みとその再生。隠し立てしなくてよい。この契約を画面に出す必要もない。出してもよい。"
        />
        <Block
          title="Not required"
          body="許可を乞う手紙はいらない。ロゴもいらない。Fuwari そのものを無名のコピーとして配ってはいけない。歌は旅してよい。入り口そのものを、名前なしで複製してはいけない。YouTube の映像は公式埋め込みのまま。こちらで持ち出し直さない。"
        />
        <p className="mt-12 text-[15px] leading-8 text-muted-foreground">
          声は税ではない。名前が台帳になる。名のある歌は、夜へ出てよい。
        </p>
        <p className="mt-14">
          <Link
            to="/"
            className="text-[13px] tracking-[0.12em] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            スタジオへ戻る
          </Link>
        </p>
      </article>
    </main>
  );
}
