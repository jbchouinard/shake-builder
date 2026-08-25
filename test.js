/* Headless check of shared.js: macro math, URL round-trip, edge cases. */
const fs = require('fs');
const path = require('path');
const root = __dirname;

// shared.js attaches to a global; give it one plus the browser bits it touches.
const win = { URLSearchParams };
global.window = win;
global.URLSearchParams = URLSearchParams;
new Function('window', fs.readFileSync(path.join(root, 'js/shared.js'), 'utf8'))(win);
const SB = win.SB;

const data = JSON.parse(fs.readFileSync(path.join(root, 'ingredients.json'), 'utf8'));
const list = data.ingredients;
const byId = Object.fromEntries(list.map(i => [i.id, i]));

let fails = 0;
function eq(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual}${ok ? '' : `  (expected ${expected})`}`);
}

console.log('--- 1. macro math: 2 scoops whey + 1 banana + 1 cup 2% milk ---');
const recipe = { name: 'Morning Shake', servings: 1, qty: { 'whey-isolate': 2, banana: 1, 'milk-2pct': 1 } };
const t = SB.computeTotals(recipe, list);
// Hand-computed: 60g whey + 118g banana + 244g milk
eq('kcal',     SB.fmtKcal(t.total.kcal),     449);   // 222 + 105.02 + 122
eq('carb',     SB.fmtMacro(t.total.carb),    41.6);  // 3 + 26.904 + 11.712
eq('fiber',    SB.fmtMacro(t.total.fiber),   3.1);   // 0 + 3.068 + 0
eq('net carb', SB.fmtMacro(t.total.netCarb), 38.5);  // 41.616 - 3.068
eq('protein',  SB.fmtMacro(t.total.protein), 61);    // 51.6 + 1.298 + 8.052
eq('fat',      SB.fmtMacro(t.total.fat),     6.4);   // 1.2 + 0.354 + 4.88
eq('grams (whey)', SB.fmtGrams(t.lines[0].grams), 60);
eq('net carb never exceeds carb',
   list.every(i => i.per100g.fiber <= i.per100g.carb), true);

console.log('\n--- 2. servings divide the totals ---');
const t2 = SB.computeTotals({ ...recipe, servings: 2 }, list);
eq('per-serving kcal', SB.fmtKcal(t2.perServing.kcal), 225);  // 449.02 / 2 = 224.51
eq('total kcal unchanged', SB.fmtKcal(t2.total.kcal), 449);

console.log('\n--- 3. URL round-trip ---');
const qs = SB.encodeRecipe(recipe, list);
console.log('     ' + qs);
const back = SB.decodeRecipe(qs, byId);
eq('name', back.name, 'Morning Shake');
eq('servings', back.servings, 1);
// Key order follows ingredients.json (stable URLs), so compare order-insensitively.
const sortedQty = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
eq('qty round-trips', sortedQty(back.qty), sortedQty(recipe.qty));
eq('totals match', SB.fmtKcal(SB.computeTotals(back, list).total.kcal), 449);
eq('URL order is ingredients.json order', qs, 'n=Morning+Shake&whey-isolate=2&milk-2pct=1&banana=1');

const frac = { name: '', servings: 2.5, qty: { 'milk-2pct': 0.25, oats: 0.75 } };
const fracBack = SB.decodeRecipe(SB.encodeRecipe(frac, list), byId);
eq('fractional qty', JSON.stringify(fracBack.qty), JSON.stringify(frac.qty));
eq('fractional servings', fracBack.servings, 2.5);
eq('no float drift in URL', SB.encodeRecipe(frac, list).includes('0.25'), true);

console.log('\n--- 4. ingredient lines (what Cronometer receives) ---');
SB.ingredientLines(t).forEach(l => console.log('     ' + l));
const lineFor = id => SB.ingredientLines(t)[t.lines.findIndex(l => l.ingredient.id === id)];
eq('grams-first, plural unit', lineFor('whey-isolate'), '60 g Whey Protein Isolate Powder (2 scoops)');
eq('singular unit', lineFor('banana'), '118 g Bananas, Raw (1 medium)');
eq('fractional unit', SB.ingredientLines(SB.computeTotals(frac, list))[0], '61 g Milk, 2% Milkfat (0.25 cups)');

console.log('\n--- 5. edge cases (should degrade, not throw) ---');
const empty = SB.decodeRecipe('', byId);
eq('empty -> 0 kcal', SB.fmtKcal(SB.computeTotals(empty, list).total.kcal), 0);
eq('empty -> no lines', SB.computeTotals(empty, list).lines.length, 0);

const bad = SB.decodeRecipe('?banana=-3&whey-isolate=abc&nope=2&s=0', byId);
eq('negative qty dropped', bad.qty.banana, undefined);
eq('NaN qty dropped', bad.qty['whey-isolate'], undefined);
eq('unknown id captured', JSON.stringify(bad.unknown), JSON.stringify(['nope']));
eq('s=0 falls back to 1', bad.servings, 1);
eq('s=0 no divide-by-zero', SB.fmtKcal(SB.computeTotals(bad, list).perServing.kcal), 0);

console.log('\n--- 6. ingredients.json integrity ---');
eq('unique ids', new Set(list.map(i => i.id)).size, list.length);
eq('no reserved-key collision', list.filter(i => ['n', 's'].includes(i.id)).length, 0);
eq('all ids well-formed', list.filter(i => !/^[a-z0-9-]+$/.test(i.id)).length, 0);
eq('all have positive unit.grams', list.filter(i => !(i.unit?.grams > 0)).length, 0);
eq('all have 5 nutrients', list.filter(i =>
  ['kcal', 'carb', 'fiber', 'protein', 'fat'].some(m => typeof i.per100g?.[m] !== 'number')).length, 0);
eq('fiber <= total carb everywhere', list.filter(i => i.per100g.fiber > i.per100g.carb).length, 0);
// Atwater cross-check, for catching typos when you edit your own values.
// Uses NET carbs: fiber carries almost no metabolizable energy, so 4/4/9 on total
// carbs badly overshoots high-fiber foods. Informational — a few foods (cocoa, nuts)
// legitimately sit outside even this because they use food-specific Atwater factors.
console.log('\n--- 7. Atwater cross-check on net carbs (informational) ---');
let warned = 0;
list.forEach(i => {
  const p = i.per100g;
  const est = (p.carb - p.fiber) * 4 + p.protein * 4 + p.fat * 9;
  const drift = p.kcal > 20 ? (est - p.kcal) / p.kcal : 0;
  if (Math.abs(drift) > 0.25) {
    warned++;
    console.log(`     WARN ${i.id}: 4/4/9 on net carbs gives ${est.toFixed(0)} kcal vs ` +
      `stated ${p.kcal} (${drift > 0 ? '+' : ''}${(drift * 100).toFixed(0)}%) — ` +
      'check for a typo unless this food uses specific Atwater factors');
  }
});
if (!warned) console.log('     all ingredients within 25%');

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURE(S)'}`);
process.exit(fails ? 1 : 0);
