import { pinyin } from "pinyin-pro";
import { RESOURCE_ORDER } from "../data/resources";
import type { SearchEntry, SearchHit } from "../types";

const NON_SEARCHABLE = /[^\p{Letter}\p{Number}]+/gu;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(NON_SEARCHABLE, "");
}

export function toPinyinText(value: string): string {
  const syllables = pinyin(value, {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  });

  return syllables.join(" ").toLocaleLowerCase();
}

export function buildPinyinFields(
  chineseSimplified: string,
  chineseTraditional: string,
): Pick<SearchEntry, "pinyin" | "pinyinCompact"> {
  const source = chineseSimplified || chineseTraditional;
  const pinyinText = source ? toPinyinText(source) : "";

  return {
    pinyin: pinyinText,
    pinyinCompact: normalizeSearchText(pinyinText),
  };
}

export function searchEntries(
  entries: readonly SearchEntry[],
  rawQuery: string,
  limit = 80,
): readonly SearchHit[] {
  const query = normalizeSearchText(rawQuery);

  if (!query) {
    return entries
      .slice()
      .sort(compareEntries)
      .slice(0, limit)
      .map((entry) => ({ entry, score: 1 }));
  }

  return entries
    .map((entry) => {
      const score = scoreEntry(entry, query);
      return score > 0 ? { entry, score } : undefined;
    })
    .filter((hit): hit is SearchHit => Boolean(hit))
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return compareEntries(first.entry, second.entry);
    })
    .slice(0, limit);
}

function scoreEntry(entry: SearchEntry, query: string): number {
  const weightedFields: readonly [string, number][] = [
    [entry.chineseSimplified, 120],
    [entry.chineseTraditional, 115],
    [entry.pinyinCompact, 110],
    [entry.pinyin, 105],
    [entry.english, 95],
    [entry.japanese, 90],
    [entry.apiName, 75],
    [String(entry.id), 60],
  ];

  let best = 0;

  for (const [field, weight] of weightedFields) {
    const normalized = normalizeSearchText(field);

    if (!normalized) {
      continue;
    }

    if (normalized === query) {
      best = Math.max(best, weight + 35);
    } else if (normalized.startsWith(query)) {
      best = Math.max(best, weight + 20);
    } else if (normalized.includes(query)) {
      best = Math.max(best, weight);
    }
  }

  return best;
}

function compareEntries(first: SearchEntry, second: SearchEntry): number {
  const kindDelta =
    RESOURCE_ORDER.indexOf(first.kind) - RESOURCE_ORDER.indexOf(second.kind);

  if (kindDelta !== 0) {
    return kindDelta;
  }

  return first.id - second.id || first.english.localeCompare(second.english);
}
