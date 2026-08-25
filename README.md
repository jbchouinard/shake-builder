# Shake Builder

A static, no-build web app for composing shakes in the units you actually measure them in
(scoops, cups, tbsp), seeing macros update live, and handing the result to Cronometer.

- **`index.html`** — the builder. Tap `+`/`−`, watch the totals bar.
- **`recipe.html`** — a shareable recipe page. The whole recipe lives in the URL.

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
as-is. You need a public URL for Cronometer's URL importer to have any chance of reaching the
page (see the caveat below).

## Editing ingredients

Everything lives in `ingredients.json`. The 15 entries are the products in
`ingredients.txt`, with `per100g` derived from the serving size printed on each packaging
screenshot in this folder.

```json
{
  "id": "on-whey-chocolate",
  "name": "Gold Standard Whey, choc",
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
| `cronometerName` | The exact Cronometer database name. This is what gets written onto the recipe page and has to match on import. |
| `verified` | `false` until you've checked the numbers against packaging. Shows a `•` in the builder. |

Three entries are `verified: false` — **banana, frozen raspberries, frozen strawberries**.
There were no screenshots for the fruits, so those use USDA reference values.

### Deriving `per100g` from a label

Take the printed serving size and scale to 100 g. The Gold Standard scoop is 32 g with 2 g
fat, so `2 × 100 ÷ 32 = 6.25`. Keep 2 decimal places: at 1 dp that becomes `6.2`, which
visibly drifts once multiplied back up to a real serving.

Two conversions worth knowing about:

- **Liquids** (soy beverage, milk, canned pumpkin) are labelled per mL, not per gram. They're
  entered as 1 mL ≈ 1 g, so macros per cup come out exactly as printed and only the gram
  figure carries a ~3% slip.
- **Dextrose** has no scoop or volume on the label, only a 5 g serving, so it's dosed directly
  in grams with a step of 5. Its ingredient line omits the redundant `(… g)` parenthetical.

### Categories

The top-level `categories` array defines both the chip order and the grouping of the
ingredient list:

```json
"categories": ["Protein", "Base", "Carbs", "Other"]
```

Chips filter the "Add ingredients" list and combine with the text box. Tapping the active chip
clears it. Adding a category means adding it here *and* to the relevant ingredients — an
ingredient whose `category` isn't in this array logs an error and never appears under a chip.

### Carbs and fiber

`carb` is total carbohydrate (fiber included, as on a nutrition label). The app displays
**net carbs** — `carb − fiber` — everywhere it shows a carb number, and the recipe page breaks
out total carbs and fiber separately. `netCarb` is always derived at display time, never
stored, so it cannot drift out of sync.

### Matching your actual products

Cronometer matches the ingredient names it receives against *its* database, whose entries may
not be your tub of whey. If you create Custom Foods in Cronometer and put their exact names in
`cronometerName`, matching becomes deterministic. Either way, check the matched foods before
saving the recipe.

## URL format

The recipe is fully encoded in the query string — no storage, no server:

```
recipe.html?n=Post-workout&s=1&on-whey-chocolate=1&nutrilait-milk-1=1&banana=1
```

- `n` — recipe name
- `s` — servings (macros are shown per serving)
- everything else — quantity in that ingredient's **natural unit**, not grams

Parameters are emitted in `ingredients.json` order, so the same shake always produces the same
URL. Both pages accept the same query string, which is how "Edit recipe" round-trips. The URL
is safe to hand-edit.

## Importing into Cronometer

In Cronometer: **Foods → Custom Recipes → Import Recipe**.

**Paste the ingredients.** Hit *Copy ingredients* on the recipe page, then in the import dialog
use *"copy and paste the ingredients here"* and paste. One ingredient per line, quantity first:

```
32 g Optimum Nutrition, Gold Standard, 100% Whey, Extreme Milk Chocolate, Canada
250 g Saputo, Nutrilait, Partly Skimmed Milk, 1% M.F.
118 g Banana, Fresh
```

Grams-first is deliberate: Cronometer matches a weight far more reliably than it guesses what
a "scoop" weighs.

### Tuning the match

**Cronometer's matcher struggles with these products.** An early version of this app appended
the natural amount — `32 g … Canada (1 scoop)` — and matching was hopeless: Hydro Pea matched
*frozen green peas*, Naked PB matched ordinary *peanut butter*. Cronometer appears to treat
everything after the quantity as the food name to search, so the parenthetical became part of
the search string. It now lives outside the copied text and outside the microdata, shown only
on the page for you.

If matching is still poor, `cronometerName` is the knob — it's deliberately separate from the
display `name`, so you can rewrite it freely without touching the UI. Things worth trying:

- **Drop the commas.** They're in the Cronometer database entries, but a fuzzy matcher may
  split on them and weight the fragments oddly.
- **Drop `, Canada`** from the Optimum Nutrition entry, and other locale suffixes. If the
  matcher favours the US databases, that suffix can only hurt.
- **Lead with the distinguishing word** rather than the brand — `Hydro Pea Protein Zammex`
  instead of `Zammex, Hydro Pea` — so the strongest token isn't buried behind a brand name the
  matcher doesn't recognise.
- **Create Custom Foods** in Cronometer using the values in `ingredients.json`, and set
  `cronometerName` to their exact names. Slowest to set up, but it's the only option that
  makes matching deterministic instead of probabilistic.

Whatever you land on, check the matched foods before saving the recipe — a wrong match is
silent and will quietly corrupt the day's numbers.

**The URL path — best-effort.** Pasting the recipe page's URL into the importer may work, but
**probably will not**, and the reason is structural: this is a static site, so the recipe is
built in your browser from the query parameters. Fetch the page without running JavaScript and
the ingredient list is literally empty:

```sh
curl -s 'http://localhost:8000/recipe.html?banana=1' | grep -c recipeIngredient   # -> 0
```

If Cronometer's fetcher executes JavaScript it will see the full recipe, complete with
schema.org `Recipe` JSON-LD and microdata; if it doesn't, it sees nothing. The page emits both
metadata formats to maximise the odds, but this is untestable from here — try it once against
your deployed URL and you'll know.

If you later want the URL path to work reliably, the fix is a prerender shim (a Cloudflare
Worker or Netlify Edge Function) that renders the query params into HTML server-side. That's a
backend, which this project deliberately doesn't have.

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
js/shared.js      ingredient loading, URL codec, macro math  (shared by both pages)
js/builder.js     builder logic
js/recipe.js      recipe page logic
css/styles.css    mobile-first, light and dark
ingredients.json  the ingredient database
ingredients.txt   the source product list, by category
*_nutrition.*     packaging screenshots the per100g values were read from
test.js           headless checks
```
