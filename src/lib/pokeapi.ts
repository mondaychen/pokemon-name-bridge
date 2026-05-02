import { RESOURCE_CONFIG_BY_KIND } from "../data/resources";
import type {
  LocalizedNames,
  PokemonStat,
  ResourceKind,
  ResourceLoadState,
  SearchEntry,
} from "../types";
import { buildPinyinFields } from "./search";

const API_ROOT = "https://pokeapi.co/api/v2";
const CACHE_VERSION = "v2";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const CONCURRENCY = 8;

type ProgressCallback = (state: ResourceLoadState) => void;

interface NamedApiResource {
  readonly name: string;
  readonly url: string;
}

interface NamedResourceList {
  readonly count: number;
  readonly results: readonly NamedApiResource[];
}

interface LanguageName {
  readonly name: string;
  readonly language: NamedApiResource;
}

interface VerboseEffect {
  readonly effect?: string;
  readonly short_effect?: string;
  readonly language: NamedApiResource;
}

interface FlavorText {
  readonly flavor_text: string;
  readonly language: NamedApiResource;
}

interface GenusText {
  readonly genus: string;
  readonly language: NamedApiResource;
}

interface GenerationRef {
  readonly name: string;
}

interface PokemonSpeciesDetail {
  readonly id: number;
  readonly name: string;
  readonly names: readonly LanguageName[];
  readonly genera?: readonly GenusText[];
  readonly flavor_text_entries?: readonly FlavorText[];
  readonly generation?: GenerationRef;
  readonly color?: NamedApiResource;
  readonly habitat?: NamedApiResource | null;
  readonly varieties?: readonly PokemonVariety[];
}

interface PokemonVariety {
  readonly is_default: boolean;
  readonly pokemon: NamedApiResource;
}

interface PokemonTypeSlot {
  readonly slot: number;
  readonly type: NamedApiResource;
}

interface PokemonCoreDetail {
  readonly base_experience: number | null;
  readonly height: number;
  readonly weight: number;
  readonly stats: readonly PokemonApiStat[];
  readonly types: readonly PokemonTypeSlot[];
}

interface PokemonApiStat {
  readonly base_stat: number;
  readonly stat: NamedApiResource;
}

interface MoveDetail {
  readonly id: number;
  readonly name: string;
  readonly names: readonly LanguageName[];
  readonly accuracy: number | null;
  readonly power: number | null;
  readonly pp: number | null;
  readonly priority: number;
  readonly type: NamedApiResource;
  readonly damage_class: NamedApiResource;
  readonly effect_entries?: readonly VerboseEffect[];
  readonly generation?: GenerationRef;
}

interface ItemDetail {
  readonly id: number;
  readonly name: string;
  readonly names: readonly LanguageName[];
  readonly cost: number;
  readonly category: NamedApiResource;
  readonly attributes: readonly NamedApiResource[];
  readonly effect_entries?: readonly VerboseEffect[];
}

interface AbilityDetail {
  readonly id: number;
  readonly name: string;
  readonly names: readonly LanguageName[];
  readonly effect_entries?: readonly VerboseEffect[];
  readonly flavor_text_entries?: readonly FlavorText[];
  readonly generation?: GenerationRef;
  readonly pokemon: readonly unknown[];
}

interface TypeDetail {
  readonly id: number;
  readonly name: string;
  readonly names: readonly LanguageName[];
  readonly move_damage_class: NamedApiResource | null;
  readonly moves: readonly unknown[];
  readonly pokemon: readonly unknown[];
}

type DetailByKind = {
  readonly pokemon: PokemonSpeciesDetail;
  readonly move: MoveDetail;
  readonly item: ItemDetail;
  readonly ability: AbilityDetail;
  readonly type: TypeDetail;
};

interface CacheEnvelope {
  readonly version: string;
  readonly savedAt: number;
  readonly entries: readonly SearchEntry[];
}

export async function loadSearchIndex(
  kind: ResourceKind,
  onProgress: ProgressCallback,
): Promise<readonly SearchEntry[]> {
  const cached = readCache(kind);

  if (cached) {
    onProgress({
      status: "ready",
      loaded: cached.length,
      total: cached.length,
      message: "Loaded from browser cache.",
    });
    return cached;
  }

  onProgress({ status: "loading", loaded: 0, total: 0 });

  const config = RESOURCE_CONFIG_BY_KIND[kind];
  const list = await fetchJson<NamedResourceList>(
    `${API_ROOT}/${config.endpoint}?limit=20000`,
  );
  const results = filterList(kind, list.results);

  onProgress({ status: "loading", loaded: 0, total: results.length });

  let completed = 0;
  const entries = await mapConcurrent(results, CONCURRENCY, async (resource) => {
    const detail = await fetchJson<DetailByKind[typeof kind]>(resource.url);
    const pokemonCore =
      kind === "pokemon"
        ? await fetchJson<PokemonCoreDetail>(
            defaultPokemonUrl(detail as PokemonSpeciesDetail),
          )
        : undefined;
    completed += 1;
    onProgress({
      status: "loading",
      loaded: completed,
      total: results.length,
    });

    return toSearchEntry(kind, detail, pokemonCore);
  });

  const searchable = entries.filter((entry): entry is SearchEntry =>
    Boolean(entry),
  );

  writeCache(kind, searchable);

  onProgress({
    status: "ready",
    loaded: searchable.length,
    total: searchable.length,
    message: "Ready.",
  });

  return searchable;
}

export function clearSearchCache(): void {
  for (const kind of Object.keys(RESOURCE_CONFIG_BY_KIND) as ResourceKind[]) {
    window.localStorage.removeItem(cacheKey(kind));
  }
}

function toSearchEntry<K extends ResourceKind>(
  kind: K,
  detail: DetailByKind[K],
  pokemonCore?: PokemonCoreDetail,
): SearchEntry | undefined {
  const names = getLocalizedNames(detail.names, detail.name);
  const pinyinFields = buildPinyinFields(
    names.chineseSimplified,
    names.chineseTraditional,
  );
  const common = {
    id: detail.id,
    kind,
    apiName: detail.name,
    ...names,
    ...pinyinFields,
  };

  if (kind === "pokemon") {
    const pokemon = detail as PokemonSpeciesDetail;
    return {
      ...common,
      summary: cleanText(
        firstLanguageText(pokemon.flavor_text_entries, "en") ||
          firstGenusText(pokemon.genera, "en") ||
          "Pokemon species",
      ),
      meta: [
        pokemonCore?.types
          .slice()
          .sort((first, second) => first.slot - second.slot)
          .map((slot) => titleize(slot.type.name))
          .filter(isPresent)
          .join(" / "),
        pokemonCore ? `${(pokemonCore.height / 10).toFixed(1)} m` : undefined,
        pokemonCore ? `${(pokemonCore.weight / 10).toFixed(1)} kg` : undefined,
        pokemonCore?.base_experience
          ? `Base XP ${pokemonCore.base_experience}`
          : undefined,
        titleize(pokemon.generation?.name),
        titleize(pokemon.color?.name),
        pokemon.habitat ? titleize(pokemon.habitat.name) : undefined,
      ].filter(isPresent),
      stats: pokemonCore ? toPokemonStats(pokemonCore.stats) : undefined,
      artworkUrl: pokemonArtworkUrl(pokemon.id),
    };
  }

  if (kind === "move") {
    const move = detail as MoveDetail;
    return {
      ...common,
      summary:
        firstEffectText(move.effect_entries) ||
        `${titleize(move.type.name)} ${titleize(move.damage_class.name)} move`,
      meta: [
        titleize(move.type.name),
        titleize(move.damage_class.name),
        move.power === null ? undefined : `Power ${move.power}`,
        move.accuracy === null ? undefined : `Acc ${move.accuracy}`,
        `PP ${move.pp}`,
        move.priority === 0 ? undefined : `Priority ${move.priority}`,
      ].filter(isPresent),
    };
  }

  if (kind === "item") {
    const item = detail as ItemDetail;
    return {
      ...common,
      summary:
        firstEffectText(item.effect_entries) ||
        `${titleize(item.category.name)} item`,
      meta: [
        titleize(item.category.name),
        `Cost ${item.cost}`,
        ...item.attributes.slice(0, 2).map((attribute) => titleize(attribute.name)),
      ].filter(isPresent),
    };
  }

  if (kind === "ability") {
    const ability = detail as AbilityDetail;
    return {
      ...common,
      summary:
        firstEffectText(ability.effect_entries) ||
        cleanText(firstLanguageText(ability.flavor_text_entries, "en")) ||
        "Pokemon ability",
      meta: [
        titleize(ability.generation?.name),
        `${ability.pokemon.length} Pokemon`,
      ].filter(isPresent),
    };
  }

  const type = detail as TypeDetail;
  return {
    ...common,
    summary: `${type.pokemon.length} Pokemon and ${type.moves.length} moves use this type.`,
    meta: [
      type.move_damage_class
        ? `${titleize(type.move_damage_class.name)} class`
        : "Type",
      `${type.pokemon.length} Pokemon`,
      `${type.moves.length} moves`,
    ],
  };
}

function getLocalizedNames(
  names: readonly LanguageName[],
  fallback: string,
): LocalizedNames {
  return {
    english: nameForLanguage(names, ["en"]) || titleize(fallback) || fallback,
    chineseSimplified: nameForLanguage(names, ["zh-Hans", "zh-hans"]),
    chineseTraditional: nameForLanguage(names, ["zh-Hant", "zh-hant"]),
    japanese: nameForLanguage(names, ["ja-Hrkt", "ja", "ja-hrkt"]),
  };
}

function nameForLanguage(
  names: readonly LanguageName[],
  languageCodes: readonly string[],
): string {
  for (const languageCode of languageCodes) {
    const match = names.find((entry) => entry.language.name === languageCode);

    if (match) {
      return match.name;
    }
  }

  return "";
}

function firstLanguageText(
  entries: readonly FlavorText[] | undefined,
  languageCode: string,
): string {
  return (
    entries?.find((entry) => entry.language.name === languageCode)?.flavor_text ??
    ""
  );
}

function firstGenusText(
  entries: readonly GenusText[] | undefined,
  languageCode: string,
): string {
  return entries?.find((entry) => entry.language.name === languageCode)?.genus ?? "";
}

function firstEffectText(
  entries: readonly VerboseEffect[] | undefined,
): string {
  const effect = entries?.find((entry) => entry.language.name === "en");
  return cleanText(effect?.short_effect || effect?.effect || "");
}

function filterList(
  kind: ResourceKind,
  resources: readonly NamedApiResource[],
): readonly NamedApiResource[] {
  if (kind !== "type") {
    return resources;
  }

  const excludedTypes = new Set(["unknown", "shadow"]);
  return resources.filter((resource) => !excludedTypes.has(resource.name));
}

async function mapConcurrent<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  mapper: (item: Input, index: number) => Promise<Output>,
): Promise<readonly Output[]> {
  const output: Output[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      output[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return output;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`PokeAPI request failed with ${response.status}: ${url}`);
  }

  return (await response.json()) as T;
}

function readCache(kind: ResourceKind): readonly SearchEntry[] | undefined {
  try {
    const raw = window.localStorage.getItem(cacheKey(kind));

    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as CacheEnvelope;
    const isFresh =
      parsed.version === CACHE_VERSION &&
      Date.now() - parsed.savedAt < CACHE_TTL_MS &&
      Array.isArray(parsed.entries);

    return isFresh ? parsed.entries : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(kind: ResourceKind, entries: readonly SearchEntry[]): void {
  const envelope: CacheEnvelope = {
    version: CACHE_VERSION,
    savedAt: Date.now(),
    entries,
  };

  try {
    window.localStorage.setItem(cacheKey(kind), JSON.stringify(envelope));
  } catch {
    // Search still works without cache; quota and privacy settings vary by browser.
  }
}

function cacheKey(kind: ResourceKind): string {
  return `poke-translate:${CACHE_VERSION}:${kind}`;
}

function pokemonArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function defaultPokemonUrl(species: PokemonSpeciesDetail): string {
  return (
    species.varieties?.find((variety) => variety.is_default)?.pokemon.url ||
    `${API_ROOT}/pokemon/${species.id}`
  );
}

function toPokemonStats(stats: readonly PokemonApiStat[]): readonly PokemonStat[] {
  const labels: Record<string, string> = {
    hp: "HP",
    attack: "Atk",
    defense: "Def",
    "special-attack": "SpA",
    "special-defense": "SpD",
    speed: "Spe",
  };

  return stats.map((entry) => ({
    key: entry.stat.name,
    label: labels[entry.stat.name] || titleize(entry.stat.name) || entry.stat.name,
    value: entry.base_stat,
  }));
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\$effect_chance/g, "effect chance").trim();
}

function titleize(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}
