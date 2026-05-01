# Pokemon Translation Finder Goal

## Product Goal

Build a clean, modern website for Chinese-speaking Pokemon players who need to quickly look up English and Japanese names plus basic game information for Pokemon resources.

## Users

- Chinese-speaking players reading English or Japanese Pokemon game content.
- Players who know part of a Chinese name, a pinyin spelling, or an English/Japanese name and need a fast lookup.

## Core Requirements

- The site runs from this folder as a TypeScript web app.
- Users can search by Chinese characters, pinyin, English names, Japanese names, or internal API names.
- Complete names are not required; partial search should return useful matches.
- Supported resource categories include Pokemon, moves, items, abilities, and types.
- Results show English, Simplified Chinese, Traditional Chinese when available, Japanese names, pinyin, category, and basic information.
- Data is queried from PokeAPI and cached locally in the browser after the first load.
- The interface should look clean, modern, and focused on fast lookup.
- The implementation should be well typed and organized into small modules.
- The folder should use git for version control.

## Data Strategy

- Use PokeAPI REST endpoints as the source of truth:
  - `pokemon-species`
  - `move`
  - `item`
  - `ability`
  - `type`
- Fetch each category list, then fetch detail records in bounded concurrent batches.
- Extract localized names from PokeAPI `names` arrays.
- Build a compact search index in the browser and store it in `localStorage` by category and version.
- For pinyin search, derive normalized pinyin from Simplified or Traditional Chinese names.
- For Pokemon visual context, show official artwork by species id.

## User Experience

- First screen is the actual search experience, not a marketing page.
- Search box accepts Chinese, pinyin, English, Japanese, or API slugs.
- Category filters let users narrow results.
- Loading states show index progress per category.
- Result cards should be scannable and dense enough for repeated lookup.
- Empty states and error states should be actionable.

## Technical Plan

- Vite + React + TypeScript.
- `pinyin-pro` for pinyin generation.
- Strict TypeScript settings.
- Separate modules for PokeAPI fetching, search normalization/scoring, and UI state.
- Use responsive CSS without a heavy component framework.

## Verification

- `npm run typecheck` must pass.
- `npm run build` must pass.
- Manual browser check should verify that the app loads, shows category progress, and can search once data is available.
