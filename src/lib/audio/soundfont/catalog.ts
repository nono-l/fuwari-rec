export type SoundfontInfo = {
  id: string;
  label: string;
  hint: string;
  bytes: number;
  urls: string[];
  /** Server unpacks .tar.gz and returns the first .sf2 inside. */
  unpack?: "targz-sf2";
  /** Too large for the app proxy — user picks a local .sf2. */
  localOnly?: boolean;
};

/** Remote GM fonts. Never bundled — downloaded only if the user picks one. */
export const SOUNDFONT_CATALOG: SoundfontInfo[] = [
  {
    id: "vintage",
    label: "Vintage Dreams",
    hint: "約 0.3MB · すぐ入るデモ音源",
    bytes: 314_640,
    urls: [
      "https://cdn.jsdelivr.net/gh/FluidSynth/fluidsynth@master/sf2/VintageDreamsWaves-v2.sf2",
      "https://raw.githubusercontent.com/FluidSynth/fluidsynth/master/sf2/VintageDreamsWaves-v2.sf2",
    ],
  },
  {
    id: "timgm6mb",
    label: "TimGM6mb",
    hint: "約 6MB · 軽量 GM",
    bytes: 5_941_542,
    unpack: "targz-sf2",
    urls: [
      "https://deb.debian.org/debian/pool/main/t/timgm6mb-soundfont/timgm6mb-soundfont_1.3.orig.tar.gz",
      "https://ftp.debian.org/debian/pool/main/t/timgm6mb-soundfont/timgm6mb-soundfont_1.3.orig.tar.gz",
    ],
  },
  {
    id: "generaluser",
    label: "GeneralUser GS",
    hint: "約 30MB · バランスの良い GM",
    bytes: 31_281_186,
    urls: [
      "https://raw.githubusercontent.com/ROCKNIX/generaluser-gs/main/GeneralUser%20GS%20v1.471.sf2",
      "https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2",
    ],
  },
  {
    id: "fluidr3",
    label: "FluidR3 GM",
    hint: "約 141MB · 大きすぎるので手元の .sf2 を指定",
    bytes: 148_447_566,
    localOnly: true,
    urls: [],
  },
];

export function soundfontInfo(id: string) {
  return SOUNDFONT_CATALOG.find((s) => s.id === id) ?? null;
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / (1024 * 1024)).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)}MB`;
}