# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
python3 -m http.server 8000   # serve; the app fetches ingredients.json, so file:// fails with CORS
node test.js                  # the whole test suite — no framework, no deps, exits 1 on failure
```

`test.js` is a single linear script with no test filtering. To run one section, comment out the
others or grep its output (sections are numbered `--- 1. ---`, `--- 2. ---`, …). There is no
build, no lint, no package.json, and no node_modules.

## Architecture

Static, dependency-free, no backend. **A recipe's contents live entirely in the URL query
string** — both pages accept the same query string, which is how the builder ⇄ recipe
round-trip works. `js/store.js` adds a small `localStorage` layer on top of that for **saved
recipes**, but a saved entry is just a name plus the query string that reproduces it, nothing
decoded — the codec stays the one place that knows recipe structure.

- `js/shared.js` — the only place that knows the URL codec and the macro math. Loaded by both
  pages; it is an IIFE that attaches `window.SB`. `test.js` executes it via `new Function` with
  a stub `window`, so it must stay browser-global-based and free of module syntax.
- `js/store.js` — the `localStorage` layer for saved recipes (`window.SBStore`). Knows nothing
  about ingredients, the URL codec, or macros; independently testable the same way as
  `shared.js`, via `new Function` and a `localStorage` shim in `test.js`.
- `js/builder.js`, `js/recipe.js`, `js/saved.js` — page controllers. All build DOM imperatively
  via `createElement`/`textContent`; there is no templating.
- `ingredients.json` — the ingredient database. See README for the per-field schema.

Style throughout: ES5-flavoured (`var`, `function`, IIFE per file, `'use strict'`). `test.js` is
the exception — it is Node-only and uses modern syntax.

## Invariants that break things quietly

- **`ingredient.id` is the URL query key.** Renaming one silently breaks every saved link.
  `n` and `s` are reserved (name, servings); `shared.js` `validate()` logs an error on collision.
- **`per100g.carb` is TOTAL carbohydrate, fiber included.** `netCarb` is derived at display time
  by `withNetCarb()` and never stored, so it cannot drift.
- **Ingredient order in `ingredients.json` is the URL parameter order**, which is what makes the
  same shake always produce the same URL. Entries must also stay grouped in `categories` order —
  `test.js` asserts this.
- **Rounding happens only at display time** (`fmtGrams`/`fmtMacro`/`fmtKcal`); accumulators stay
  exact. Grams are one decimal on purpose — half-gram units (1 tbsp sweet potato powder = 7.5 g)
  would lose the precision their fractional `step` exists to provide.
- Ingredient lines emitted for Cronometer are `"<grams> g <cronometerName>"` and nothing else.
  Trailing parentheticals get swallowed into Cronometer's search string; `test.js` asserts no
  line contains `(` or `)`.
- **Saved recipes store the query string, not decoded state.** `js/store.js`'s
  `shake-builder.recipes` localStorage key holds `{name, query, savedAt}` entries, where `query`
  is exactly what `SB.encodeRecipe()` returns. A saved entry replays through the same codec as a
  shared link, so it can never drift independently of it.

## Editing ingredients

`test.js` hardcodes the ingredient count and a table of label-serving values, so adding or
changing an entry means updating the assertions in sections 1b and 6. Section 7 (Atwater
4/4/9 cross-check on net carbs) is **informational** — Fry's cocoa, frozen raspberries, and
Prana chia legitimately exceed the 25% threshold.

The `*_nutrition.jpg` / `*_nutrition.png` packaging photos the numbers came from are gitignored
deliberately: they are the manufacturers' copyrighted images and this is a public repo. Keep them
local; do not commit them.

## Cronometer

There is no importer integration and re-adding one is a dead end — the importer ranks USDA/NCCDB
ahead of the CRDB entries these products live in, and matched 1 of 15 after two rounds of tuning.
The recipe page is a manual transcription sheet by design. README's "Why there is no importer
integration" has the full record.
