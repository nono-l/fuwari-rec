export type XproofIdentity = {
  platform: "x" | "youtube" | "dns";
  username: string;
};

export type PublicFxCard = {
  id: string;
  name: string;
  summary: string;
  savedAt: string;
};

export type SingableSong = {
  id: string;
  title: string;
  artist: string;
  mgmtNo: string;
  genre: string;
  keyNote: string;
  vocalMinNote?: string;
  vocalMaxNote?: string;
  bpm?: number;
  markedAt: string | null;
  source?: "self" | "proxy";
  addedByName?: string;
};

export type OpsPublic = "hide" | "presence" | "count";

export type SingableSinger = {
  soulId: string;
  displayName: string;
  avatarUrl: string;
  rangeMinNote: string;
  rangeMaxNote: string;
  markedAt: string | null;
};

export type SingerProfile = {
  slug: string;
  soulId: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  isPublic: boolean;
  xHandle: string;
  youtube: string[];
  identities: XproofIdentity[];
  xproofLinked: boolean;
  xproofLinkedAt: string | null;
  rangeMinNote: string;
  rangeMaxNote: string;
  rangeSpan: number;
  rangePublishedAt: string | null;
  fx: PublicFxCard[];
  singable: SingableSong[];
  opsPublic: OpsPublic;
  opsCount: number;
  updatedAt: string | null;
  /** Set only when fetching a card: public, or private preview for owner / 運営. */
  viewAs?: "public" | "owner" | "ops";
};

export const emptyProfile = (slug = ""): SingerProfile => ({
  slug,
  soulId: "",
  displayName: "",
  bio: "",
  avatarUrl: "",
  isPublic: true,
  xHandle: "",
  youtube: [],
  identities: [],
  xproofLinked: false,
  xproofLinkedAt: null,
  rangeMinNote: "",
  rangeMaxNote: "",
  rangeSpan: 0,
  rangePublishedAt: null,
  fx: [],
  singable: [],
  opsPublic: "hide",
  opsCount: 0,
  updatedAt: null,
});

export const XPROOF_ORIGIN = "https://xauth.grok.me";
export const XPROOF_CLIENT = "fuwari";
