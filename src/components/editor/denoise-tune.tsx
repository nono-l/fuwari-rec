import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_DENOISE_TUNE,
  type DenoiseTune,
} from "@/lib/audio/obs-filters";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function DenoiseTuneControls({
  value,
  onChange,
}: {
  value: DenoiseTune;
  onChange: (next: DenoiseTune) => void;
}) {
  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      <div>
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>量</span>
          <span className="tabular-nums text-foreground">{pct(value.mix)}</span>
        </div>
        <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
          元の声と抑制後の混ぜ。右だけだとファンやヒスが削れた音になります
        </p>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[Math.round(value.mix * 100)]}
          onValueChange={([n]) => onChange({ ...value, mix: (n ?? 0) / 100 })}
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
          <span>元の声</span>
          <span>抑制だけ</span>
        </div>
      </div>
      <div>
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>攻撃性</span>
          <span className="tabular-nums text-foreground">
            {pct(value.attack)}
          </span>
        </div>
        <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
          低域のゴロゴロと高域のヒスをどれだけ切るか。上げすぎると声が薄くなります
        </p>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[Math.round(value.attack * 100)]}
          onValueChange={([n]) =>
            onChange({ ...value, attack: (n ?? 0) / 100 })
          }
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
          <span>やさしい</span>
          <span>強く切る</span>
        </div>
      </div>
      <label className="flex items-start gap-2 text-[12px] font-medium text-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.gateLink}
          onChange={() => onChange({ ...value, gateLink: !value.gateLink })}
        />
        <span>
          ゲート連動
          <span className="mt-0.5 block text-[10px] font-normal leading-relaxed text-muted-foreground">
            声が小さいときだけさらに落とす。語尾は残しつつ、無言のファンノイズを消します
          </span>
        </span>
      </label>
      {value.gateLink && (
        <div>
          <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
            <span>連動スレッショルド</span>
            <span className="tabular-nums text-foreground">
              {value.thresholdDb.toFixed(0)} dB
            </span>
          </div>
          <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
            この大きさ未満を「無言」とみなす。ゲートと同じくらいが無難です
          </p>
          <Slider
            min={-80}
            max={0}
            step={1}
            value={[value.thresholdDb]}
            onValueChange={([n]) =>
              onChange({ ...value, thresholdDb: n ?? -38 })
            }
          />
        </div>
      )}
      <button
        type="button"
        className="text-[10px] text-primary hover:underline"
        onClick={() => onChange({ ...DEFAULT_DENOISE_TUNE })}
      >
        ノイズ抑制の初期値に戻す
      </button>
    </div>
  );
}
