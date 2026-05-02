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
  readonly forms?: readonly PokemonFormProfile[];
  readonly moveCategory?: MoveCategoryProfile;
  readonly stats?: readonly PokemonStat[];
  readonly types?: readonly PokemonTypeProfile[];
  readonly artworkUrl?: string;
}

export interface PokemonFormProfile {
  readonly id: number;
  readonly apiName: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly meta: readonly string[];
  readonly stats: readonly PokemonStat[];
  readonly types: readonly PokemonTypeProfile[];
  readonly artworkUrl?: string;
}

export interface PokemonTypeProfile {
  readonly id: number;
  readonly name: string;
  readonly label: string;
  readonly iconUrl: string;
}

export interface MoveCategoryProfile {
  readonly name: string;
  readonly label: string;
  readonly iconUrl: string;
}

export interface PokemonStat {
  readonly key: string;
  readonly label: string;
  readonly value: number;
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
