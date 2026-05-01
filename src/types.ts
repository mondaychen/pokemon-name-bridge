export type ResourceKind = "pokemon" | "move" | "item" | "ability" | "type";

export interface ResourceConfig {
  readonly kind: ResourceKind;
  readonly label: string;
  readonly shortLabel: string;
  readonly endpoint: string;
  readonly accent: string;
}

export interface LocalizedNames {
  readonly english: string;
  readonly chineseSimplified: string;
  readonly chineseTraditional: string;
  readonly japanese: string;
}

export interface SearchEntry extends LocalizedNames {
  readonly id: number;
  readonly kind: ResourceKind;
  readonly apiName: string;
  readonly pinyin: string;
  readonly pinyinCompact: string;
  readonly summary: string;
  readonly meta: readonly string[];
  readonly artworkUrl?: string;
}

export interface ResourceLoadState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly loaded: number;
  readonly total: number;
  readonly message?: string;
}

export interface SearchHit {
  readonly entry: SearchEntry;
  readonly score: number;
}
