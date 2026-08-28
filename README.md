# Shake Builder

A static, no-build web app for composing shakes in the units you actually measure them in
(scoops, cups, tbsp) and seeing the macros update live.

- **`index.html`** — the builder. Tap `+`/`−`, watch the totals bar.
- **`recipe.html`** — a shareable recipe page. The whole recipe lives in the URL.
- **`saved.html`** — recipes you've saved, kept in this browser's `localStorage`.

No dependencies, no build step, no backend.

## Running it

The app fetches `ingredients.json`, so it must be served over HTTP — opening `index.html`
as a `file://` URL will fail with a CORS error.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

Push the repo, then Settings → Pages → deploy from branch, root folder. The files are served
as-is.

## Editing ingredients

Everything lives in `ingredients.json`. The 15 entries are the products in
`ingredients.txt`, with `per100g` derived from the serving size printed on each product's
packaging.

The packaging photos those numbers came from are kept locally but are **not** committed — they
are the manufacturers' copyrighted product images, and this is a public repo. The nutrition
figures themselves are facts rather than creative work, so `ingredients.json` is fine to
publish. `.gitignore` covers `*_nutrition.jpg` and `*_nutrition.png`.

```json
{
  "id": "on-whey-chocolate",
  "name": "ON whey, chocolate",
  "category": "Protein",
  "unit": { "label": "scoop", "plural": "scoops", "grams": 32 },
  "step": 0.5,
  "per100g": { "kcal": 375, "carb": 9.38, "fiber": 1.56, "protein": 75, "fat": 6.25 },
  "cronometerName": "Optimum Nutrition, Gold Standard, 100% Whey, Extreme Milk Chocolate, Canada",
  "verified": true
}
```

| Field | Notes |
| --- | --- |
| `id` | Lowercase, `[a-z0-9-]`, unique. **This is the URL query key**, so renaming it breaks any saved links. Cannot be `n` or `s` (reserved). |
| `name` | Short label for the UI only. Kept separate from `cronometerName` because the full database names run to four wrapped lines on a phone. |
| `category` | Must appear in the top-level `categories` array. Drives the filter chips. |
| `unit.grams` | Mass of one natural unit. This is the only conversion — liquids get a mass per cup like anything else. |
| `step` | Increment for the `+`/`−` buttons. `0.5` for scoops, `0.25` for cups, `1` for whole items. |
| `per100g` | All nutrients per 100 g, at 2 dp. `carb` is **total** carbohydrate, fiber included. |
| `cronometerName` | The exact Cronometer database name, shown on the recipe page so you know what to search for. |
| `verified` | `false` until you've checked the numbers against packaging. Shows a `•` in the builder. |

Three entries are `verified: false` — **banana, frozen raspberries, frozen strawberries**.
There were no screenshots for the fruits, so those use USDA reference values.

### Deriving `per100g` from a label

Take the printed serving size and scale to 100 g. The Gold Standard scoop is 32 g with 2 g
fat, so `2 × 100 ÷ 32 = 6.25`. Keep 2 decimal places: at 1 dp that becomes `6.2`, which
visibly drifts once multiplied back up to a real serving.

A couple of things worth knowing about:

- **Liquids** (soy beverage, milk, canned pumpkin) are labelled per mL, not per gram. They're
  entered as 1 mL ≈ 1 g, so macros per cup come out exactly as printed and only the gram
  figure carries a ~3% slip.
- **Pure-carb powders** (dextrose, cyclic dextrin) are 100 g carbohydrate per 100 g. Dextrose
  is dosed by the tbsp (10 g), cyclic dextrin by its 25 g scoop; choose the `step` that gives
  you carb increments you can actually dial in.
- An ingredient whose label prints only a gram serving — no scoop or volume — can take a
  `unit` of `{ "label": "g", "grams": 1 }`. It is then dosed straight in grams and its recipe
  line shows no separate natural amount. No current ingredient needs this.

Pick `unit` for the granularity you need, not just the measure the label happens to print.
Weights are shown to one decimal, so half-gram units stay honest.

### Categories

The top-level `categories` array defines both the chip order and the grouping of the
ingredient list:

```json
"categories": ["Protein", "Base", "Carbs", "Fruit", "Flavor"]
```

Chips filter the "Add ingredients" list and combine with the text box. Tapping the active chip
clears it. Adding a category means adding it here *and* to the relevant ingredients — an
ingredient whose `category` isn't in this array logs an error and never appears under a chip.

### Carbs and fiber

`carb` is total carbohydrate (fiber included, as on a nutrition label). The app displays
**net carbs** — `carb − fiber` — everywhere it shows a carb number, and the recipe page breaks
out total carbs and fiber separately. `netCarb` is always derived at display time, never
stored, so it cannot drift out of sync.

### Logging a shake in Cronometer

Entry is manual: Cronometer's recipe importer could not match these products (see
[Why there is no importer integration](#why-there-is-no-importer-integration)), so the recipe
page is built as a transcription sheet instead. Each ingredient shows the exact
`cronometerName` to search for, with the weight beneath it.

Expect the app's totals and Cronometer's to differ slightly. The app computes from the values
transcribed off your packaging; your Cronometer recipe uses whichever database entries you
pick. Neither is wrong, they are just different sources.

## URL format

A recipe's contents are fully encoded in the query string — no server involved. (Saved
recipes, below, add a small `localStorage` layer on top of this, but it stores the same query
string rather than any decoded state.)

```
recipe.html?n=Post-workout&s=1&on-whey-chocolate=1&nutrilait-milk-1=1&banana=1
```

- `n` — recipe name
- `s` — servings (macros are shown per serving)
- everything else — quantity in that ingredient's **natural unit**, not grams

Parameters are emitted in `ingredients.json` order, so the same shake always produces the same
URL. Both pages accept the same query string, which is how "Edit recipe" round-trips. The URL
is safe to hand-edit.

## Saved recipes

`saved.html` lists recipes saved from the recipe page's **Save** button, backed by
`localStorage`. There is still no account and no server, so saves are per-browser and are lost
if site data is cleared — use **Export** to copy a JSON backup and **Import** to restore it
(also how you'd move saved recipes to a different browser or device).

Storage key: `shake-builder.recipes`. Value shape:

```json
{
  "v": 1,
  "recipes": [
    { "name": "Morning Shake", "query": "on-whey-chocolate=1&banana=1", "savedAt": "2026-08-27T12:00:00.000Z" }
  ]
}
```

Each entry stores a **name** and the **query string** `SB.encodeRecipe` would produce for that
recipe — not decoded ingredient quantities — so a saved recipe replays through the same codec
as a shared link and can't drift out of sync with it. `js/store.js` (`window.SBStore`) is the
only file that touches `localStorage`; it doesn't know about ingredients or macros.

## Tests

```sh
node test.js
```

Covers macro math against hand-computed values, URL round-tripping, ingredient-line
formatting, malformed-input handling, and `ingredients.json` integrity. Worth running after
editing ingredient data — it checks fiber never exceeds total carbs, and cross-checks stated
calories against 4/4/9 on net carbs to catch typos.

That cross-check is informational, not a failure. Three entries legitimately trip it:

- **Fry's cocoa** — the label is per 5 g, so every value is rounded to the nearest 0.5 g and
  the error is enormous once scaled ×20.
- **Frozen raspberries** and **Prana chia** — very high fiber, and fiber does contribute *some*
  energy, so subtracting all of it underestimates calories.

## Layout

```
index.html        builder
recipe.html       shareable recipe page
saved.html        saved-recipes list (localStorage)
js/shared.js      ingredient loading, URL codec, macro math  (shared by both pages)
js/builder.js     builder logic
js/recipe.js      recipe page logic
js/saved.js       saved-recipes page logic
js/store.js       localStorage layer for saved recipes
css/styles.css    mobile-first, light and dark
ingredients.json  the ingredient database
ingredients.txt   the source product list, by category
test.js           headless checks
```

## Why there is no importer integration

Cronometer has a recipe importer that takes a URL or a pasted ingredient list, and an earlier
version of this app targeted it. It does not work for these products.

Pasting an ingredient list matched 0 of 15 ingredients, and the failures were not near misses:
Hydro Pea matched *frozen green peas*, Naked PB matched ordinary *peanut butter*, Fry's cocoa
matched *Paprika Seasoning*. Two rounds of tuning the emitted text — dropping a trailing
`(2 scoops)` that was being swallowed into the search string, then simplifying the names — got
it to 1 of 15. The one that worked was Optimum Nutrition Gold Standard.

That result is consistent: the importer ranks the official databases (USDA, NCCDB) ahead of
the community-submitted CRDB, and every product here except Gold Standard exists only in CRDB.
The entries are findable in Cronometer's own search, but the importer will not rank them.
Sending the exact CRDB name fights that ranking rather than working with it, and no string
tuning reliably wins.

Manual entry, saved as a Cronometer recipe for combinations you repeat, is less work than
fighting the matcher on every shake. The schema.org `Recipe` markup and the URL-import support
that existed for this were removed once that became clear.
