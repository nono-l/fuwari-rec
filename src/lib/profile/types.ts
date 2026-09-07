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
  updatedAt: string | null;
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
  updatedAt: null,
});

export const XPROOF_ORIGIN = "https://xauth.grok.me";
export const XPROOF_CLIENT = "fuwari";
