import type { ResourceConfig, ResourceKind } from "../types";

export const RESOURCE_CONFIGS: readonly ResourceConfig[] = [
  {
    kind: "pokemon",
    label: "Pokemon",
    shortLabel: "Pokemon",
    endpoint: "pokemon-species",
    accent: "#ef4444",
  },
  {
    kind: "move",
    label: "Moves",
    shortLabel: "Move",
    endpoint: "move",
    accent: "#2563eb",
  },
  {
    kind: "item",
    label: "Items",
    shortLabel: "Item",
    endpoint: "item",
    accent: "#d97706",
  },
  {
    kind: "ability",
    label: "Abilities",
    shortLabel: "Ability",
    endpoint: "ability",
    accent: "#059669",
  },
  {
    kind: "type",
    label: "Types",
    shortLabel: "Type",
    endpoint: "type",
    accent: "#7c3aed",
  },
] as const;

export const RESOURCE_ORDER = RESOURCE_CONFIGS.map((config) => config.kind);

export const RESOURCE_CONFIG_BY_KIND: Record<ResourceKind, ResourceConfig> = Object.fromEntries(
  RESOURCE_CONFIGS.map((config) => [config.kind, config]),
) as Record<ResourceKind, ResourceConfig>;
