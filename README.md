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

Everything lives in `ingredients.json`. The seeded values are **generic reference data** and
every entry is marked `"verified": false` — the builder shows a small `•` next to any
unverified ingredient. Replace them with the numbers from your own packaging and flip the flag.

```json
{
  "id": "whey-isolate",
  "name": "Whey protein isolate",
  "unit": { "label": "scoop", "plural": "scoops", "grams": 30 },
  "step": 0.5,
  "per100g": { "kcal": 370, "carb": 5, "fiber": 0, "protein": 86, "fat": 2 },
  "cronometerName": "Whey Protein Isolate Powder",
  "verified": false
}
```

| Field | Notes |
| --- | --- |
| `id` | Lowercase, `[a-z0-9-]`, unique. **This is the URL query key**, so renaming it breaks any saved links. Cannot be `n` or `s` (reserved). |
| `unit.grams` | Mass of one natural unit. This is the only conversion — liquids get a mass per cup like anything else. |
| `step` | Increment for the `+`/`−` buttons. `0.5` for scoops, `0.25` for cups, `1` for whole items. |
| `per100g` | All nutrients per 100 g. `carb` is **total** carbohydrate, fiber included. |
| `cronometerName` | The text written onto the recipe page. Kept separate from `name` — see below. |
| `verified` | `false` until you've checked the numbers against packaging. |

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
recipe.html?n=Post-workout&s=1&whey-isolate=2&milk-2pct=1&banana=1
```

- `n` — recipe name
- `s` — servings (macros are shown per serving)
- everything else — quantity in that ingredient's **natural unit**, not grams

Parameters are emitted in `ingredients.json` order, so the same shake always produces the same
URL. Both pages accept the same query string, which is how "Edit recipe" round-trips. The URL
is safe to hand-edit.

## Importing into Cronometer

In Cronometer: **Foods → Custom Recipes → Import Recipe**.

**The reliable path — paste the ingredients.** Hit *Copy ingredients* on the recipe page, then
in the import dialog use *"copy and paste the ingredients here"* and paste. One ingredient per
line, grams first:

```
60 g Whey Protein Isolate Powder (2 scoops)
244 g Milk, 2% Milkfat (1 cup)
118 g Bananas, Raw (1 medium)
```

Grams-first is deliberate: Cronometer matches a weight far more reliably than it guesses what
a "scoop" weighs. This path works on free accounts and does not depend on any scraping.

**The URL path — best-effort.** Pasting the recipe page's URL into the importer may work, but
**probably will not**, and the reason is structural: this is a static site, so the recipe is
built in your browser from the query parameters. Fetch the page without running JavaScript and
the ingredient list is literally empty:

```sh
curl -s 'http://localhost:8000/recipe.html?whey-isolate=2' | grep -c recipeIngredient   # -> 0
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

That cross-check is informational, not a failure. Cocoa powder legitimately trips it: USDA
applies food-specific Atwater factors to cocoa, so 4/4/9 overestimates it by about 30%.

## Layout

```
index.html        builder
recipe.html       shareable recipe page
js/shared.js      ingredient loading, URL codec, macro math  (shared by both pages)
js/builder.js     builder logic
js/recipe.js      recipe page logic
css/styles.css    mobile-first, light and dark
ingredients.json  the ingredient database
test.js           headless checks
```
