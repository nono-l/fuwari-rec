import { useEffect } from "react";
import {
  Headphones,
  Mic,
  MicOff,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";
import { cn } from "@/lib/utils";

export function DevicePanel() {
  const inputDevices = useEditorStore((s) => s.inputDevices);
  const outputDevices = useEditorStore((s) => s.outputDevices);
  const inputDeviceId = useEditorStore((s) => s.inputDeviceId);
  const outputDeviceId = useEditorStore((s) => s.outputDeviceId);
  const outputSelectSupported = useEditorStore((s) => s.outputSelectSupported);
  const devicesPermission = useEditorStore((s) => s.devicesPermission);
  const devicesLoading = useEditorStore((s) => s.devicesLoading);
  const inputEnabled = useEditorStore((s) => s.inputEnabled);
  const outputEnabled = useEditorStore((s) => s.outputEnabled);
  const status = useEditorStore((s) => s.status);
  const refreshAudioDevices = useEditorStore((s) => s.refreshAudioDevices);
  const setInputDevice = useEditorStore((s) => s.setInputDevice);
  const setOutputDevice = useEditorStore((s) => s.setOutputDevice);
  const toggleInputEnabled = useEditorStore((s) => s.toggleInputEnabled);
  const toggleOutputEnabled = useEditorStore((s) => s.toggleOutputEnabled);

  useEffect(() => {
    void refreshAudioDevices({ requestPermission: false });
  }, [refreshAudioDevices]);

  const recording = status === "recording";

  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            入出力デバイス
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            マイク／スピーカーの選択と、一時オフ切り替え
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={devicesLoading || recording}
          onClick={() => void refreshAudioDevices({ requestPermission: true })}
        >
          <RefreshCw
            className={cn("size-3.5", devicesLoading && "animate-spin")}
          />
          {devicesPermission === "granted" ? "再スキャン" : "許可して一覧取得"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="block">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {inputEnabled ? (
                <Mic className="size-3.5" />
              ) : (
                <MicOff className="size-3.5 text-danger" />
              )}
              入力（マイク）
              {!inputEnabled && (
                <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                  オフ
                </span>
              )}
            </span>
            <Button
              type="button"
              size="sm"
              variant={inputEnabled ? "secondary" : "danger"}
              onClick={toggleInputEnabled}
              aria-pressed={!inputEnabled}
              title={inputEnabled ? "入力を一時オフ" : "入力をオンに戻す"}
            >
              {inputEnabled ? (
                <>
                  <MicOff className="size-3.5" />
                  一時オフ
                </>
              ) : (
                <>
                  <Mic className="size-3.5" />
                  オン
                </>
              )}
            </Button>
          </div>
          <select
            className={cn(
              "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              !inputEnabled && "opacity-60",
            )}
            value={inputDeviceId}
            disabled={recording || devicesLoading || !inputEnabled}
            onChange={(e) => setInputDevice(e.target.value)}
            aria-label="入力デバイス"
          >
            <option value="">システムのデフォルト</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="block">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {outputEnabled ? (
                <Headphones className="size-3.5" />
              ) : (
                <VolumeX className="size-3.5 text-danger" />
              )}
              出力（スピーカー）
              {!outputEnabled && (
                <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                  オフ
                </span>
              )}
            </span>
            <Button
              type="button"
              size="sm"
              variant={outputEnabled ? "secondary" : "danger"}
              onClick={toggleOutputEnabled}
              aria-pressed={!outputEnabled}
              title={outputEnabled ? "出力を一時オフ" : "出力をオンに戻す"}
            >
              {outputEnabled ? (
                <>
                  <VolumeX className="size-3.5" />
                  一時オフ
                </>
              ) : (
                <>
                  <Volume2 className="size-3.5" />
                  オン
                </>
              )}
            </Button>
          </div>
          <select
            className={cn(
              "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              !outputEnabled && "opacity-60",
            )}
            value={outputDeviceId}
            disabled={
              recording ||
              devicesLoading ||
              !outputSelectSupported ||
              !outputEnabled
            }
            onChange={(e) => void setOutputDevice(e.target.value)}
            aria-label="出力デバイス"
          >
            <option value="">システムのデフォルト</option>
            {outputDevices.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        モニターはスピーカーではなく、耳に届くもので聞いてください。100円ショップのイヤホンで十分です。
        「一時オフ」はデバイス選択を保ったままミュートします。
        入力オフ中は録音できません。出力オフはトラック再生と YouTube をミュートします。
        {devicesPermission !== "granted" && (
          <>
            {" "}
            デバイス名表示にはマイク許可が必要です。
          </>
        )}
        {!outputSelectSupported && (
          <>
            {" "}
            出力選択は Chrome / Edge などで利用できます。
          </>
        )}
      </p>
    </section>
  );
}
