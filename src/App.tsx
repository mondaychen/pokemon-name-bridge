import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { RESOURCE_CONFIG_BY_KIND, RESOURCE_CONFIGS } from "./data/resources";
import { clearSearchCache, loadSearchIndex } from "./lib/pokeapi";
import { searchEntries } from "./lib/search";
import type {
  ResourceKind,
  ResourceLoadState,
  SearchEntry,
  SearchHit,
} from "./types";

const INITIAL_STATE: ResourceLoadState = {
  status: "idle",
  loaded: 0,
  total: 0,
};

const DEFAULT_STATES = Object.fromEntries(
  RESOURCE_CONFIGS.map((config) => [config.kind, INITIAL_STATE]),
) as Record<ResourceKind, ResourceLoadState>;

const DEFAULT_SELECTED = new Set<ResourceKind>(
  RESOURCE_CONFIGS.map((config) => config.kind),
);

export function App(): ReactElement {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<readonly SearchEntry[]>([]);
  const [states, setStates] =
    useState<Record<ResourceKind, ResourceLoadState>>(DEFAULT_STATES);
  const [selectedKinds, setSelectedKinds] =
    useState<ReadonlySet<ResourceKind>>(DEFAULT_SELECTED);

  useEffect(() => {
    let cancelled = false;

    async function loadKind(config: (typeof RESOURCE_CONFIGS)[number]): Promise<void> {
      if (cancelled) {
        return;
      }

      try {
        const index = await loadSearchIndex(config.kind, (state) => {
          if (!cancelled) {
            setStates((current) => ({ ...current, [config.kind]: state }));
          }
        });

        if (!cancelled) {
          setEntries((current) => [...current, ...index]);
        }
      } catch (error) {
        if (!cancelled) {
          setStates((current) => ({
            ...current,
            [config.kind]: {
              status: "error",
              loaded: 0,
              total: 0,
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to load this category.",
            },
          }));
        }
      }
    }

    async function loadAll(): Promise<void> {
      await Promise.all(RESOURCE_CONFIGS.map((config) => loadKind(config)));
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedKinds.has(entry.kind)),
    [entries, selectedKinds],
  );

  const hits = useMemo(
    () => searchEntries(selectedEntries, query),
    [query, selectedEntries],
  );

  const totals = useMemo(() => {
    const ready = Object.values(states).filter(
      (state) => state.status === "ready",
    ).length;
    const loaded = Object.values(states).reduce(
      (sum, state) => sum + state.loaded,
      0,
    );
    const total = Object.values(states).reduce(
      (sum, state) => sum + state.total,
      0,
    );

    return { ready, loaded, total };
  }, [states]);

  function toggleKind(kind: ResourceKind): void {
    setSelectedKinds((current) => {
      const next = new Set(current);

      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }

      return next.size > 0 ? next : current;
    });
  }

  function refreshData(): void {
    clearSearchCache();
    window.location.reload();
  }

  return (
    <main className="app-shell">
      <section className="lookup-panel" aria-labelledby="page-title">
        <div className="intro">
          <div>
            <p className="eyebrow">Pokemon name bridge</p>
            <h1 id="page-title">Search Chinese, pinyin, English, or Japanese</h1>
          </div>
          <button className="ghost-button" type="button" onClick={refreshData}>
            Refresh data
          </button>
        </div>

        <label className="search-box">
          <span>Search</span>
          <input
            autoComplete="off"
            autoFocus
            inputMode="search"
            placeholder="皮卡丘, pikachu, pika, でんき, thunder..."
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="filter-row" aria-label="Resource filters">
          {RESOURCE_CONFIGS.map((config) => (
            <button
              className="filter-chip"
              data-selected={selectedKinds.has(config.kind)}
              key={config.kind}
              style={{ "--accent": config.accent } as CSSProperties}
              type="button"
              onClick={() => toggleKind(config.kind)}
            >
              <span>{config.label}</span>
              <small>{states[config.kind].loaded || "..."}</small>
            </button>
          ))}
        </div>

        <div className="status-grid">
          {RESOURCE_CONFIGS.map((config) => (
            <LoadStatus
              key={config.kind}
              label={config.label}
              state={states[config.kind]}
            />
          ))}
        </div>

        <div className="result-toolbar">
          <strong>{hits.length} matches</strong>
          <span>
            {totals.ready}/{RESOURCE_CONFIGS.length} categories ready
            {totals.total > 0
              ? `, ${totals.loaded.toLocaleString()}/${totals.total.toLocaleString()} records indexed`
              : ""}
          </span>
        </div>

        <section className="results" aria-live="polite">
          {hits.length > 0 ? (
            hits.map((hit) => (
              <ResultCard hit={hit} key={`${hit.entry.kind}-${hit.entry.id}`} />
            ))
          ) : (
            <div className="empty-state">
              <strong>No matches yet</strong>
              <span>
                Try fewer letters, a Chinese character, pinyin without tones, or
                enable more categories.
              </span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

interface LoadStatusProps {
  readonly label: string;
  readonly state: ResourceLoadState;
}

function LoadStatus({ label, state }: LoadStatusProps): ReactElement {
  const progress =
    state.total > 0 ? Math.min(100, (state.loaded / state.total) * 100) : 0;

  return (
    <div className="load-status" data-state={state.status}>
      <div>
        <strong>{label}</strong>
        <span>{statusText(state)}</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

interface ResultCardProps {
  readonly hit: SearchHit;
}

function ResultCard({ hit }: ResultCardProps): ReactElement {
  const { entry } = hit;
  const config = RESOURCE_CONFIG_BY_KIND[entry.kind];

  return (
    <article
      className="result-card"
      style={{ "--accent": config.accent } as CSSProperties}
    >
      <div className="art-slot" aria-hidden="true">
        {entry.artworkUrl ? (
          <img src={entry.artworkUrl} alt="" loading="lazy" />
        ) : (
          <span>{config.shortLabel.slice(0, 2)}</span>
        )}
      </div>

      <div className="result-body">
        <div className="result-heading">
          <div>
            <span className="kind-label">{config.shortLabel} #{entry.id}</span>
            <h2>{entry.chineseSimplified || entry.english}</h2>
          </div>
          <span className="score-label">Score {hit.score}</span>
        </div>

        <dl className="name-grid">
          <div>
            <dt>English</dt>
            <dd>{entry.english}</dd>
          </div>
          <div>
            <dt>Japanese</dt>
            <dd>{entry.japanese || "Unknown"}</dd>
          </div>
          <div>
            <dt>Simplified</dt>
            <dd>{entry.chineseSimplified || "Unknown"}</dd>
          </div>
          <div>
            <dt>Traditional</dt>
            <dd>{entry.chineseTraditional || "Unknown"}</dd>
          </div>
          <div>
            <dt>Pinyin</dt>
            <dd>{entry.pinyin || "Unknown"}</dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>{entry.apiName}</dd>
          </div>
        </dl>

        <p>{entry.summary}</p>

        {entry.meta.length > 0 ? (
          <div className="meta-row">
            {entry.meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function statusText(state: ResourceLoadState): string {
  if (state.status === "ready") {
    return `${state.loaded.toLocaleString()} ready`;
  }

  if (state.status === "error") {
    return state.message || "Error";
  }

  if (state.status === "loading") {
    if (state.total === 0) {
      return "Starting";
    }

    return `${state.loaded.toLocaleString()} / ${state.total.toLocaleString()}`;
  }

  return "Waiting";
}
