import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { RESOURCE_CONFIG_BY_KIND, RESOURCE_CONFIGS } from "./data/resources";
import { clearSearchCache, loadSearchIndex } from "./lib/pokeapi";
import { searchEntries } from "./lib/search";
import type { ResourceKind, ResourceLoadState, SearchEntry, SearchHit } from "./types";

const INITIAL_STATE: ResourceLoadState = {
  status: "idle",
  loaded: 0,
  total: 0,
};

const DEFAULT_STATES = Object.fromEntries(
  RESOURCE_CONFIGS.map((config) => [config.kind, INITIAL_STATE]),
) as Record<ResourceKind, ResourceLoadState>;

const DEFAULT_SELECTED = new Set<ResourceKind>(RESOURCE_CONFIGS.map((config) => config.kind));

export function App(): ReactElement {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<readonly SearchEntry[]>([]);
  const [states, setStates] = useState<Record<ResourceKind, ResourceLoadState>>(DEFAULT_STATES);
  const [selectedKinds, setSelectedKinds] = useState<ReadonlySet<ResourceKind>>(DEFAULT_SELECTED);

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
              message: error instanceof Error ? error.message : "Unable to load this category.",
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

  const hits = useMemo(() => searchEntries(selectedEntries, query), [query, selectedEntries]);

  const totals = useMemo(() => {
    const ready = Object.values(states).filter((state) => state.status === "ready").length;
    const loaded = Object.values(states).reduce((sum, state) => sum + state.loaded, 0);
    const total = Object.values(states).reduce((sum, state) => sum + state.total, 0);

    return { ready, loaded, total };
  }, [states]);

  const indexingSummary = `${totals.ready}/${RESOURCE_CONFIGS.length} categories ready${
    totals.total > 0
      ? `, ${totals.loaded.toLocaleString()}/${totals.total.toLocaleString()} records indexed`
      : ""
  }`;

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
    void clearSearchCache().finally(() => {
      window.location.reload();
    });
  }

  return (
    <main className="app-shell">
      <section className="lookup-panel" aria-labelledby="page-title">
        <div className="intro">
          <div>
            <p className="eyebrow">Pokemon name bridge</p>
            <h1 id="page-title">Search Chinese, pinyin, English, or Japanese</h1>
          </div>
          <div className="header-status">
            <div className="status-grid">
              {RESOURCE_CONFIGS.map((config) => (
                <LoadStatus key={config.kind} label={config.label} state={states[config.kind]} />
              ))}
            </div>
            <div className="header-actions">
              <span className="header-total">{indexingSummary}</span>
              {totals.ready === RESOURCE_CONFIGS.length ? (
                <button className="ghost-button" type="button" onClick={refreshData}>
                  Refresh data
                </button>
              ) : null}
            </div>
          </div>
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

        <div className="result-toolbar">
          <strong>{hits.length} matches</strong>
        </div>

        <section className="results" aria-live="polite">
          {hits.length > 0 ? (
            hits.map((hit) => <ResultCard hit={hit} key={`${hit.entry.kind}-${hit.entry.id}`} />)
          ) : (
            <div className="empty-state">
              <strong>No matches yet</strong>
              <span>
                Try fewer letters, a Chinese character, pinyin without tones, or enable more
                categories.
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
  const progress = state.total > 0 ? Math.min(100, (state.loaded / state.total) * 100) : 0;

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
  const forms = entry.forms ?? [];
  const [activeFormName, setActiveFormName] = useState(
    forms.find((form) => form.isDefault)?.apiName ?? forms[0]?.apiName ?? "",
  );
  const activeForm = forms.find((form) => form.apiName === activeFormName) ?? forms[0];
  const artworkUrl = activeForm?.artworkUrl ?? entry.artworkUrl;
  const meta = activeForm?.meta ?? entry.meta;
  const stats = activeForm?.stats ?? entry.stats;
  const types = activeForm?.types ?? entry.types ?? [];
  const apiName = activeForm?.apiName ?? entry.apiName;
  const placeholderText = placeholderLabel(entry, config.shortLabel);
  const wikiLinks = wikiLinksFor(entry);

  return (
    <article className="result-card" style={{ "--accent": config.accent } as CSSProperties}>
      <div className="art-column" aria-hidden="true">
        <div className="art-slot">
          {artworkUrl ? (
            <img
              className={entry.kind === "item" ? "item-art" : undefined}
              src={artworkUrl}
              alt=""
              loading="lazy"
            />
          ) : (
            <span>{placeholderText}</span>
          )}
        </div>
        {types.length > 0 ? <IconBadges types={types} /> : null}
      </div>

      <div className="result-body">
        <div className="result-heading">
          <div>
            <span className="kind-label">
              {config.shortLabel} #{entry.id}
            </span>
            <div className="title-row">
              <h2>{entry.chineseSimplified || entry.english}</h2>
              <WikiLinks links={wikiLinks} />
            </div>
          </div>
          <span className="score-label">Score {hit.score}</span>
        </div>

        {forms.length > 1 ? (
          <div className="form-tabs" aria-label="Pokemon forms">
            {forms.map((form) => (
              <button
                data-selected={form.apiName === activeForm?.apiName}
                key={form.apiName}
                type="button"
                onClick={() => setActiveFormName(form.apiName)}
              >
                {form.label}
              </button>
            ))}
          </div>
        ) : null}

        <dl className="name-grid">
          <div>
            <dt>English</dt>
            <dd>
              <CopyValue value={entry.english} />
            </dd>
          </div>
          <div>
            <dt>Japanese</dt>
            <dd>
              <CopyValue value={entry.japanese || "Unknown"} />
            </dd>
          </div>
          <div>
            <dt>Simplified</dt>
            <dd>
              <CopyValue value={entry.chineseSimplified || "Unknown"} />
            </dd>
          </div>
          <div>
            <dt>Traditional</dt>
            <dd>
              <CopyValue value={entry.chineseTraditional || "Unknown"} />
            </dd>
          </div>
          <div>
            <dt>Pinyin</dt>
            <dd>
              <CopyValue value={entry.pinyin || "Unknown"} />
            </dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>
              <CopyValue value={apiName} />
            </dd>
          </div>
        </dl>

        <p>{entry.summary}</p>

        {meta.length > 0 ? (
          <div className="meta-row">
            {entry.moveCategory?.iconUrl ? (
              <img
                className="meta-move-category"
                src={entry.moveCategory.iconUrl}
                alt={entry.moveCategory.label}
                title={entry.moveCategory.label}
                loading="lazy"
              />
            ) : null}
            {meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}

        {stats ? <StatSpread stats={stats} /> : null}
      </div>
    </article>
  );
}

interface CopyValueProps {
  readonly value: string;
}

function CopyValue({ value }: CopyValueProps): ReactElement {
  const [copied, setCopied] = useState(false);

  async function copyValue(): Promise<void> {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1100);
  }

  return (
    <button
      className="copy-value"
      data-copied={copied}
      title={`Copy ${value}`}
      type="button"
      onClick={() => void copyValue()}
    >
      <span>{value}</span>
      {copied ? (
        <small>Copied</small>
      ) : (
        <svg
          aria-hidden="true"
          className="copy-icon"
          fill="none"
          height="24"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

interface WikiLinksProps {
  readonly links: {
    readonly bulbapedia: string;
    readonly chineseWiki: string;
  };
}

function WikiLinks({ links }: WikiLinksProps): ReactElement {
  return (
    <div className="wiki-links" aria-label="Wiki links">
      <a href={links.bulbapedia} target="_blank" rel="noreferrer">
        Bulbapedia
      </a>
      <a href={links.chineseWiki} target="_blank" rel="noreferrer">
        神奇寶貝百科
      </a>
    </div>
  );
}

function placeholderLabel(entry: SearchEntry, fallback: string): string {
  if ((entry.kind === "move" || entry.kind === "ability") && entry.chineseSimplified) {
    return Array.from(entry.chineseSimplified)[0] ?? fallback.slice(0, 2);
  }

  return fallback.slice(0, 2);
}

function wikiLinksFor(entry: SearchEntry): {
  readonly bulbapedia: string;
  readonly chineseWiki: string;
} {
  const chineseName = entry.chineseSimplified || entry.chineseTraditional || entry.english;

  return {
    bulbapedia: bulbapediaUrl(entry),
    chineseWiki: chineseWikiUrl(entry.kind, chineseName),
  };
}

function bulbapediaUrl(entry: SearchEntry): string {
  const title = entry.kind === "move" ? `${entry.english} (move)` : entry.english;

  return `https://bulbapedia.bulbagarden.net/wiki/${wikiPath(title)}`;
}

function chineseWikiUrl(kind: SearchEntry["kind"], chineseName: string): string {
  const suffixByKind: Record<SearchEntry["kind"], string> = {
    pokemon: "",
    move: "（招式）",
    item: "（道具）",
    ability: "（特性）",
    type: "（属性）",
  };

  return `https://wiki.52poke.com/wiki/${wikiPath(`${chineseName}${suffixByKind[kind]}`)}`;
}

function wikiPath(title: string): string {
  return encodeURIComponent(title.trim().replace(/\s+/g, "_"));
}

interface IconBadgesProps {
  readonly types: NonNullable<SearchEntry["forms"]>[number]["types"];
}

function IconBadges({ types }: IconBadgesProps): ReactElement {
  return (
    <div className="icon-badges" aria-label="Pokemon types">
      {types.map((type) => (
        <span className="type-icon" key={type.name} title={type.label}>
          <img alt={type.label} src={type.iconUrl} loading="lazy" />
          <span>{type.label}</span>
        </span>
      ))}
    </div>
  );
}

interface StatSpreadProps {
  readonly stats: NonNullable<SearchEntry["stats"]>;
}

function StatSpread({ stats }: StatSpreadProps): ReactElement {
  const total = stats.reduce((sum, stat) => sum + stat.value, 0);
  const maxStat = Math.max(...stats.map((stat) => stat.value), 150);

  return (
    <section className="stat-spread" aria-label="Base stat spread">
      <div className="stat-total">
        <strong>Base stats</strong>
        <span>Total {total}</span>
      </div>
      <div className="stat-list">
        {stats.map((stat) => (
          <div className="stat-row" key={stat.key}>
            <span className="stat-label">{stat.label}</span>
            <div className="stat-meter" aria-hidden="true">
              <span
                style={
                  {
                    "--stat-color": statColor(stat.value),
                    width: `${(stat.value / maxStat) * 100}%`,
                  } as CSSProperties
                }
              />
            </div>
            <span className="stat-value">{stat.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function statColor(value: number): string {
  const clamped = Math.min(120, Math.max(30, value));
  const ratio = (clamped - 30) / 90;
  const hue = Math.round(ratio * 120);

  return `hsl(${hue} 72% 45%)`;
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
