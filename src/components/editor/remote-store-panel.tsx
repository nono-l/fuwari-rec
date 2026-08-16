import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  guessSetupUrl,
  emptyRemoteConfig,
  loadRemoteConfig,
  saveRemoteConfig,
} from "@/lib/remote-store/config";
import {
  remoteKvGet,
  remoteKvSet,
  remoteLogIps,
  remoteLogRecent,
  remotePing,
  remoteSnapDelete,
  remoteSnapGet,
  remoteSnapList,
  remoteSnapSave,
  type AccessIpItem,
  type AccessLogItem,
} from "@/lib/remote-store/client";
import {
  FuwariRemoteSettings,
  RemoteSnapshotMeta,
  RemoteStoreConfig,
  FUWARI_APP,
} from "@/lib/remote-store/types";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = FUWARI_APP.settingsKey;

export function RemoteStorePanel() {
  const { user, isPending } = useCurrentUserState();
  const [config, setConfig] = useState<RemoteStoreConfig>(emptyRemoteConfig);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const [serviceInfo, setServiceInfo] = useState<string | null>(null);
  const [weekHits, setWeekHits] = useState<number | null>(null);
  const [snaps, setSnaps] = useState<RemoteSnapshotMeta[]>([]);
  const [snapTitle, setSnapTitle] = useState("マイ設定");
  const [logs, setLogs] = useState<AccessLogItem[]>([]);
  const [ipStats, setIpStats] = useState<AccessIpItem[]>([]);

  const master = useEditorStore((s) => s.master);
  const bpm = useEditorStore((s) => s.bpm);
  const rangeMinHz = useEditorStore((s) => s.rangeMinHz);
  const rangeMaxHz = useEditorStore((s) => s.rangeMaxHz);
  const rangeMinNote = useEditorStore((s) => s.rangeMinNote);
  const rangeMaxNote = useEditorStore((s) => s.rangeMaxNote);
  const mediaRangeResult = useEditorStore((s) => s.mediaRangeResult);
  const setMaster = useEditorStore((s) => s.setMaster);
  const setBpm = useEditorStore((s) => s.setBpm);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const saveTimer = useRef<number>(0);
  const persistConfig = useCallback((next: RemoteStoreConfig) => {
    setConfig(next);
    if (!user) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveRemoteConfig(next).catch((err) => {
        setStatus(
          err instanceof Error ? err.message : "Neon への保存に失敗しました",
        );
      });
    }, 400);
  }, [user]);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setConfig(emptyRemoteConfig());
      setHydrated(true);
      setStatus("サインインすると、接続鍵は Vercel / Neon に保存されます（ソースやブラウザには残りません）。");
      return;
    }
    let cancelled = false;
    void loadRemoteConfig()
      .then((loaded) => {
        if (!cancelled) {
          setConfig(loaded);
          setHydrated(true);
          setStatus("接続設定は Neon に動的保存しています。");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHydrated(true);
          setStatus(
            err instanceof Error ? err.message : "Neon から読めませんでした",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, isPending]);

  const setupHref =
    config.setupUrl.trim() ||
    (config.proxyUrl.trim() ? guessSetupUrl(config.proxyUrl) : "");

  const buildSettingsPayload = useCallback((): FuwariRemoteSettings => {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      master: {
        volume: master.volume,
        pitchSemitones: master.pitchSemitones,
        formantDb: master.formantDb,
        reverbMix: master.reverbMix,
        compressor: master.compressor,
        noise: master.noise,
        preset: master.preset,
      },
      range: {
        minHz: rangeMinHz,
        maxHz: rangeMaxHz,
        minNote: rangeMinNote,
        maxNote: rangeMaxNote,
      },
      mediaRange: mediaRangeResult
        ? {
            minNote: mediaRangeResult.minNote,
            maxNote: mediaRangeResult.maxNote,
            minHz: mediaRangeResult.minHz,
            maxHz: mediaRangeResult.maxHz,
            spanSemitones: mediaRangeResult.spanSemitones,
            trackName: mediaRangeResult.trackName,
            usedVocalIsolation: mediaRangeResult.usedVocalIsolation,
          }
        : null,
      bpm,
    };
  }, [
    master,
    bpm,
    rangeMinHz,
    rangeMaxHz,
    rangeMinNote,
    rangeMaxNote,
    mediaRangeResult,
  ]);

  const applySettings = useCallback(
    (data: FuwariRemoteSettings) => {
      if (data.master) {
        setMaster({
          volume: data.master.volume,
          pitchSemitones: data.master.pitchSemitones,
          formantDb: data.master.formantDb,
          reverbMix: data.master.reverbMix,
          compressor: data.master.compressor,
          noise: data.master.noise ?? 0,
          preset: data.master.preset as typeof master.preset,
        });
      }
      if (typeof data.bpm === "number") setBpm(data.bpm);
      useEditorStore.setState({
        rangeMinHz: data.range?.minHz ?? null,
        rangeMaxHz: data.range?.maxHz ?? null,
        rangeMinNote: data.range?.minNote ?? null,
        rangeMaxNote: data.range?.maxNote ?? null,
        mediaRangeResult: data.mediaRange
          ? {
              minHz: data.mediaRange.minHz,
              maxHz: data.mediaRange.maxHz,
              minNote: data.mediaRange.minNote,
              maxNote: data.mediaRange.maxNote,
              spanSemitones: data.mediaRange.spanSemitones,
              stableHits: 0,
              framesScanned: 0,
              durationSec: 0,
              usedVocalIsolation: data.mediaRange.usedVocalIsolation,
              trackId: "",
              trackName: data.mediaRange.trackName,
            }
          : null,
      });
    },
    [setMaster, setBpm, master.preset],
  );

  const refreshSnaps = useCallback(async () => {
    if (!config.enabled || !config.proxyUrl) {
      setSnaps([]);
      return;
    }
    const r = await remoteSnapList(config, FUWARI_APP.snapKind);
    if (r.ok) setSnaps(r.data.items ?? []);
  }, [config]);

  const refreshLogs = useCallback(async () => {
    if (!config.enabled || !config.proxyUrl || !config.apiKey) return;
    const [lr, ir] = await Promise.all([
      remoteLogRecent(config, 15),
      remoteLogIps(config),
    ]);
    if (lr.ok) {
      setLogs(lr.data.items ?? []);
      if (lr.data.your_ip) setClientIp(lr.data.your_ip);
    }
    if (ir.ok) setIpStats(ir.data.items ?? []);
  }, [config]);

  const testConnection = async () => {
    setBusy(true);
    setStatus("接続確認中…");
    const r = await remotePing(config);
    setBusy(false);
    const now = new Date().toLocaleString("ja-JP");
    setLastCheckAt(now);
    if (r.ok) {
      setConnected(true);
      const ip = r.data.client_ip ?? null;
      setClientIp(ip);
      setWeekHits(
        typeof r.data.week_hits_from_ip === "number"
          ? r.data.week_hits_from_ip
          : null,
      );
      setServiceInfo(
        [r.data.service, r.data.version, r.data.server]
          .filter(Boolean)
          .join(" · ") || null,
      );
      setStatus("接続できました。サーバー側のログにも記録されています。");
      setStatusMessage(
        ip ? `リモート接続OK（IP ${ip}）` : "リモートプロキシに接続できました",
      );
      await Promise.all([refreshSnaps(), refreshLogs()]);
    } else {
      setConnected(false);
      setServiceInfo(null);
      setWeekHits(null);
      setStatus(`接続失敗: ${r.error}`);
      setStatusMessage(`リモート接続失敗: ${r.error}`);
    }
  };

  const pushSettings = async () => {
    setBusy(true);
    setStatus("設定をアップロード中…");
    const payload = buildSettingsPayload();
    const r = await remoteKvSet(config, SETTINGS_KEY, payload);
    setBusy(false);
    if (r.ok) {
      setStatus("最新設定をクラウドに保存しました");
      setStatusMessage("リモートへ設定を保存しました");
      setConnected(true);
      void refreshLogs();
    } else {
      setStatus(`保存失敗: ${r.error}`);
      setStatusMessage(`リモート保存失敗: ${r.error}`);
    }
  };

  const pullSettings = async () => {
    setBusy(true);
    setStatus("設定をダウンロード中…");
    const r = await remoteKvGet<FuwariRemoteSettings>(config, SETTINGS_KEY);
    setBusy(false);
    if (!r.ok) {
      setStatus(`読込失敗: ${r.error}`);
      return;
    }
    if (!r.data.found || !r.data.value) {
      setStatus("クラウドに設定がありません（先にアップロードしてください）");
      return;
    }
    applySettings(r.data.value);
    setStatus(
      `設定を反映しました（${r.data.value.savedAt ?? r.data.updated_at ?? ""}）`,
    );
    setStatusMessage("リモートから設定を読み込みました");
    setConnected(true);
  };

  const saveNamedSnap = async () => {
    setBusy(true);
    const payload = buildSettingsPayload();
    const r = await remoteSnapSave(config, {
      title: snapTitle.trim() || "マイ設定",
      kind: FUWARI_APP.snapKind,
      payload,
    });
    setBusy(false);
    if (r.ok) {
      setStatus(`スナップショット保存 (#${r.data.id})`);
      await refreshSnaps();
    } else {
      setStatus(`スナップショット失敗: ${r.error}`);
    }
  };

  const loadSnap = async (id: number) => {
    setBusy(true);
    const r = await remoteSnapGet(config, id);
    setBusy(false);
    if (!r.ok || !r.data.found || !r.data.item) {
      setStatus(r.ok ? "見つかりません" : r.error);
      return;
    }
    applySettings(r.data.item.payload as FuwariRemoteSettings);
    setStatus(`「${r.data.item.title}」を反映しました`);
  };

  const deleteSnap = async (id: number) => {
    if (!confirm("このスナップショットを削除しますか？")) return;
    setBusy(true);
    const r = await remoteSnapDelete(config, id);
    setBusy(false);
    if (r.ok) {
      setStatus("削除しました");
      await refreshSnaps();
    } else {
      setStatus(r.error);
    }
  };

  useEffect(() => {
    if (config.enabled && config.proxyUrl && config.apiKey) {
      void refreshSnaps();
    }
  }, [
    config.enabled,
    config.proxyUrl,
    config.apiKey,
    config.namespace,
    refreshSnaps,
  ]);

  return (
    <div className="space-y-4">
      {/* 管理コンソール: 接続状態 */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Shield className="size-5 text-primary" />
              リモート管理コンソール
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              接続鍵（API キー / Basic）はソースにも localStorage にも置きません。
              サインイン中は <strong>Vercel / Neon</strong> にユーザー単位で動的保存します。
            </p>
            <SignedOut>
              <p className="mt-2 text-xs text-amber-800">
                サインインしてください。未ログインでは鍵を Neon に保存できません。
              </p>
            </SignedOut>
            <SignedIn>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {hydrated
                  ? "このアカウントの接続設定は Neon に保存されています。"
                  : "Neon から読み込み中…"}
              </p>
            </SignedIn>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={config.enabled}
              onChange={(e) =>
                persistConfig({ ...config, enabled: e.target.checked })
              }
            />
            リモートを有効
          </label>
        </div>

        {/* Status strip */}
        <div
          className={cn(
            "mt-4 grid gap-3 rounded-2xl border p-4 sm:grid-cols-3",
            connected === true && "border-primary/30 bg-primary/5",
            connected === false && "border-danger/30 bg-danger/5",
            connected === null && "border-border bg-muted/30",
          )}
        >
          <div className="flex items-start gap-2.5">
            {connected === true ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
            ) : connected === false ? (
              <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />
            ) : (
              <CloudOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            )}
            <div>
              <div className="text-[11px] text-muted-foreground">接続状態</div>
              <div className="text-sm font-semibold text-foreground">
                {connected === true
                  ? "接続OK"
                  : connected === false
                    ? "接続失敗"
                    : "未確認"}
              </div>
              {lastCheckAt && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  最終確認 {lastCheckAt}
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">
              プロキシが見た IP
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              {clientIp ?? "—"}
            </div>
            {weekHits != null && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                直近7日 約 {weekHits} 回
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">サービス</div>
            <div className="mt-0.5 truncate text-sm font-medium text-foreground">
              {serviceInfo ?? "—"}
            </div>
            {setupHref ? (
              <a
                href={setupHref}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                サーバー setup.php を開く
                <ExternalLink className="size-3" />
              </a>
            ) : (
              <div className="mt-1 text-[10px] text-muted-foreground">
                setup URL を下で設定可
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted-foreground sm:col-span-2">
            プロキシ URL（api/proxy.php）
            <input
              type="url"
              placeholder="https://example.com/fuwari/api/proxy.php"
              className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              value={config.proxyUrl}
              onChange={(e) =>
                persistConfig({ ...config, proxyUrl: e.target.value })
              }
              disabled={!config.enabled}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            API キー
            <input
              type="password"
              autoComplete="off"
              placeholder="API_KEY"
              className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              value={config.apiKey}
              onChange={(e) =>
                persistConfig({ ...config, apiKey: e.target.value })
              }
              disabled={!config.enabled}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Basic 認証ユーザー（任意・HTTPS おまじない）
            <input
              type="text"
              autoComplete="username"
              placeholder="空欄=オフ"
              className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              value={config.basicUser}
              onChange={(e) =>
                persistConfig({ ...config, basicUser: e.target.value })
              }
              disabled={!config.enabled}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Basic 認証パスワード
            <input
              type="password"
              autoComplete="current-password"
              placeholder="config の BASIC_AUTH_PASS"
              className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              value={config.basicPass}
              onChange={(e) =>
                persistConfig({ ...config, basicPass: e.target.value })
              }
              disabled={!config.enabled}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            名前空間
            <input
              type="text"
              placeholder="default"
              className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              value={config.namespace}
              onChange={(e) =>
                persistConfig({ ...config, namespace: e.target.value })
              }
              disabled={!config.enabled}
            />
          </label>
          <label className="block text-xs text-muted-foreground sm:col-span-2">
            サーバー setup.php URL（任意・接続監視画面へのリンク）
            <input
              type="url"
              placeholder={
                guessSetupUrl(config.proxyUrl) ||
                "https://example.com/fuwari/setup.php"
              }
              className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              value={config.setupUrl}
              onChange={(e) =>
                persistConfig({ ...config, setupUrl: e.target.value })
              }
              disabled={!config.enabled}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!config.enabled || busy}
            onClick={() => void testConnection()}
            className="min-w-[10rem]"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wifi className="size-4" />
            )}
            接続確認
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!config.enabled || busy}
            onClick={() => void pushSettings()}
          >
            <Save className="size-4" />
            設定アップ
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!config.enabled || busy}
            onClick={() => void pullSettings()}
          >
            <Download className="size-4" />
            設定ダウン
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!config.enabled || busy}
            onClick={() => void refreshLogs()}
          >
            <RefreshCw className="size-4" />
            ログ更新
          </Button>
        </div>

        {status && (
          <p
            className={cn(
              "mt-3 text-xs",
              connected === false ? "text-danger" : "text-muted-foreground",
            )}
          >
            {status}
          </p>
        )}
      </section>

      {/* 監視パネル */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Cloud className="size-4 text-primary" />
            接続元 IP（プロキシ集計）
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            接続確認後にここに出ます。setup.php の許可リスト用です。
          </p>
          <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto text-[11px]">
            {ipStats.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-muted-foreground">
                まだデータなし — 「接続確認」を押してください
              </li>
            ) : (
              ipStats.map((row) => (
                <li
                  key={row.ip}
                  className="flex justify-between gap-2 border-b border-border/60 py-1.5 font-mono"
                >
                  <span
                    className={
                      row.ip === clientIp ? "font-semibold text-primary" : ""
                    }
                  >
                    {row.ip}
                    {row.ip === clientIp ? " ← この端末" : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {row.hits}回 · {row.last_seen}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">
            直近の接続ログ
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            サーバーに届いた API 呼び出し（ping / kv など）
          </p>
          <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto text-[11px]">
            {logs.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-muted-foreground">
                ログなし
              </li>
            ) : (
              logs.map((row) => (
                <li
                  key={row.id}
                  className="border-b border-border/60 py-1.5 text-muted-foreground"
                >
                  <span className="font-mono text-foreground">{row.ip}</span>{" "}
                  · {row.action} · {row.ok ? "OK" : "NG"} · {row.created_at}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">
          名前付きスナップショット
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          MIX・BPM・声域結果を履歴として残せます（音声ファイル本体は保存しません）。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={snapTitle}
            onChange={(e) => setSnapTitle(e.target.value)}
            className="min-w-[12rem] flex-1 rounded-full border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="タイトル"
            disabled={!config.enabled}
          />
          <Button
            type="button"
            disabled={!config.enabled || busy}
            onClick={() => void saveNamedSnap()}
          >
            <Save className="size-4" />
            スナップショット保存
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {snaps.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              まだスナップショットがありません
            </li>
          ) : (
            snaps.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">
                    {s.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    #{s.id} · {s.updated_at}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void loadSnap(s.id)}
                >
                  読込
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void deleteSnap(s.id)}
                  title="削除"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
