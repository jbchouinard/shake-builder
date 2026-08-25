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

console.log('--- 1. macro math: 1 scoop ON whey + 1 banana + 1 cup 1% milk ---');
const recipe = { name: 'Morning Shake', servings: 1,
                 qty: { 'on-whey-chocolate': 1, banana: 1, 'nutrilait-milk-1': 1 } };
const t = SB.computeTotals(recipe, list);
// Straight off the labels: 32g whey (120/3/0.5/24/2), 118g banana, 250g milk (110/12/0/9/2.5)
eq('kcal',     SB.fmtKcal(t.total.kcal),     335);   // 120 + 105.02 + 110
eq('carb',     SB.fmtMacro(t.total.carb),    41.9);  // 3 + 26.904 + 12
eq('fiber',    SB.fmtMacro(t.total.fiber),   3.6);   // 0.5 + 3.068 + 0
eq('net carb', SB.fmtMacro(t.total.netCarb), 38.3);  // 41.904 - 3.568
eq('protein',  SB.fmtMacro(t.total.protein), 34.3);  // 24 + 1.298 + 9
eq('fat',      SB.fmtMacro(t.total.fat),     4.9);   // 2 + 0.354 + 2.5
eq('grams (whey scoop)', SB.fmtGrams(t.lines[0].grams), 32);
eq('net carb never exceeds carb',
   list.every(i => i.per100g.fiber <= i.per100g.carb), true);

// Every labelled entry should reproduce its printed serving values.
console.log('\n--- 1b. per100g reproduces label servings ---');
const labelCheck = [
  ['zammex-hydro-pea', 34, { kcal: 120, carb: 1, fiber: 1, protein: 26, fat: 1 }],
  ['naked-pb', 15, { kcal: 60, carb: 4, fiber: 2, protein: 9, fat: 2 }],
  ['oikos-pro-plain', 115, { kcal: 70, carb: 4, fiber: 0, protein: 13, fat: 0 }],
  ['natura-soy-unsweetened', 250, { kcal: 80, carb: 3, fiber: 1, protein: 8, fat: 3.5 }],
  ['dextrose', 5, { kcal: 20, carb: 5, fiber: 0, protein: 0, fat: 0 }],
  ['quaker-instant-oats', 30, { kcal: 110, carb: 20, fiber: 3, protein: 4, fat: 2 }],
  ['yupik-sweet-potato-powder', 30, { kcal: 100, carb: 25, fiber: 1, protein: 1, fat: 0.3 }],
  ['ed-smith-pumpkin', 83, { kcal: 30, carb: 7, fiber: 2, protein: 1, fat: 0 }],
  ['frys-cocoa', 5, { kcal: 20, carb: 2, fiber: 2, protein: 1, fat: 0.5 }],
  ['prana-chia-black', 15, { kcal: 70, carb: 6, fiber: 5, protein: 2, fat: 4.5 }],
];
for (const [id, servingG, want] of labelCheck) {
  const p = byId[id].per100g;
  const got = Object.fromEntries(Object.keys(want).map(k =>
    [k, Math.round(p[k] * servingG / 100 * 10) / 10]));
  const ok = Object.keys(want).every(k => Math.abs(got[k] - want[k]) <= 0.15);
  eq(`${id} @ ${servingG}g`, ok ? 'matches label' : JSON.stringify(got), 'matches label');
}

console.log('\n--- 2. servings divide the totals ---');
const t2 = SB.computeTotals({ ...recipe, servings: 2 }, list);
eq('per-serving kcal', SB.fmtKcal(t2.perServing.kcal), 168);  // 335.02 / 2 = 167.51
eq('total kcal unchanged', SB.fmtKcal(t2.total.kcal), 335);

console.log('\n--- 3. URL round-trip ---');
const qs = SB.encodeRecipe(recipe, list);
console.log('     ' + qs);
const back = SB.decodeRecipe(qs, byId);
eq('name', back.name, 'Morning Shake');
eq('servings', back.servings, 1);
// Key order follows ingredients.json (stable URLs), so compare order-insensitively.
const sortedQty = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
eq('qty round-trips', sortedQty(back.qty), sortedQty(recipe.qty));
eq('totals match', SB.fmtKcal(SB.computeTotals(back, list).total.kcal), 335);
eq('URL order is ingredients.json order', qs,
   'n=Morning+Shake&on-whey-chocolate=1&nutrilait-milk-1=1&banana=1');

const frac = { name: '', servings: 2.5, qty: { 'nutrilait-milk-1': 0.25, 'quaker-instant-oats': 0.75 } };
const fracBack = SB.decodeRecipe(SB.encodeRecipe(frac, list), byId);
eq('fractional qty', JSON.stringify(fracBack.qty), JSON.stringify(frac.qty));
eq('fractional servings', fracBack.servings, 2.5);
eq('no float drift in URL', SB.encodeRecipe(frac, list).includes('0.25'), true);

console.log('\n--- 4. ingredient lines (what Cronometer receives) ---');
SB.ingredientLines(t).forEach(l => console.log('     ' + l));
const lineFor = id => SB.ingredientLines(t)[t.lines.findIndex(l => l.ingredient.id === id)];
// Quantity then food name, nothing else: anything trailing lands in the search
// string Cronometer matches on, which is what broke ingredient matching.
eq('line is quantity + name only', lineFor('on-whey-chocolate'),
   '32 g Optimum Nutrition, Gold Standard, 100% Whey, Extreme Milk Chocolate, Canada');
eq('no parenthetical (fruit)', lineFor('banana'), '118 g Banana, Fresh');
// Half grams are kept: rounding 62.5 to 63 discards precision the fractional
// steps exist to give you.
eq('no parenthetical (fractional)', SB.ingredientLines(SB.computeTotals(frac, list))[0],
   '62.5 g Saputo, Nutrilait, Partly Skimmed Milk, 1% M.F.');
eq('whole grams stay whole', SB.fmtGrams(118), '118');
eq('half grams survive', SB.fmtGrams(22.5), '22.5');

// Sweet potato powder is dosed by tbsp so it can be dialled in ~6.25 g carb steps;
// by the quarter-cup its smallest step was 25 g of carbs.
console.log('\n--- 4b. sweet potato powder granularity ---');
const sp = byId['yupik-sweet-potato-powder'];
eq('unit is tbsp', sp.unit.label, 'tbsp');
eq('1 tbsp = 7.5 g (one sixteenth of a 120 g cup)', sp.unit.grams, 7.5);
eq('4 tbsp reconciles with the 1/4 cup label serving', sp.unit.grams * 4, 30);
const spCarbStep = sp.unit.grams * sp.per100g.carb / 100;
eq('carb per tbsp', Math.round(spCarbStep * 100) / 100, 6.25);
eq('line at 3 tbsp',
   SB.ingredientLines(SB.computeTotals({ servings: 1, qty: { 'yupik-sweet-potato-powder': 3 } }, list))[0],
   '22.5 g Yupik, Organic Sweet Potato Powder');
eq('gram-dosed ingredient',
   SB.ingredientLines(SB.computeTotals({ servings: 1, qty: { dextrose: 25 } }, list))[0],
   '25 g Texturestar, Dextrose Powder');
eq('no line contains a parenthetical',
   SB.ingredientLines(t).filter(l => /[()]/.test(l)).length, 0);

// The natural amount still exists, just separately from the parsed line.
const lineObj = id => t.lines.find(l => l.ingredient.id === id);
eq('natural amount, plural', SB.naturalAmount(lineObj('on-whey-chocolate')), '1 scoop');
eq('natural amount, fruit', SB.naturalAmount(lineObj('banana')), '1 medium');
eq('natural amount empty for gram-dosed',
   SB.naturalAmount(SB.computeTotals({ servings: 1, qty: { dextrose: 25 } }, list).lines[0]), '');

console.log('\n--- 5. edge cases (should degrade, not throw) ---');
const empty = SB.decodeRecipe('', byId);
eq('empty -> 0 kcal', SB.fmtKcal(SB.computeTotals(empty, list).total.kcal), 0);
eq('empty -> no lines', SB.computeTotals(empty, list).lines.length, 0);

const bad = SB.decodeRecipe('?banana=-3&on-whey-chocolate=abc&nope=2&s=0', byId);
eq('negative qty dropped', bad.qty.banana, undefined);
eq('NaN qty dropped', bad.qty['on-whey-chocolate'], undefined);
eq('unknown id captured', JSON.stringify(bad.unknown), JSON.stringify(['nope']));
eq('s=0 falls back to 1', bad.servings, 1);
eq('s=0 no divide-by-zero', SB.fmtKcal(SB.computeTotals(bad, list).perServing.kcal), 0);

console.log('\n--- 6. ingredients.json integrity ---');
eq('ingredient count', list.length, 15);
eq('unique ids', new Set(list.map(i => i.id)).size, list.length);
eq('no reserved-key collision', list.filter(i => ['n', 's'].includes(i.id)).length, 0);
eq('all ids well-formed', list.filter(i => !/^[a-z0-9-]+$/.test(i.id)).length, 0);
eq('all have positive unit.grams', list.filter(i => !(i.unit?.grams > 0)).length, 0);
eq('all have 5 nutrients', list.filter(i =>
  ['kcal', 'carb', 'fiber', 'protein', 'fat'].some(m => typeof i.per100g?.[m] !== 'number')).length, 0);
eq('fiber <= total carb everywhere', list.filter(i => i.per100g.fiber > i.per100g.carb).length, 0);

console.log('\n--- 6b. categories ---');
const cats = data.categories;
eq('declared categories', JSON.stringify(cats), JSON.stringify(['Protein', 'Base', 'Carbs', 'Other']));
eq('every ingredient has a declared category',
   list.filter(i => !cats.includes(i.category)).length, 0);
eq('no empty category', cats.filter(c => !list.some(i => i.category === c)).join(',') || 'none', 'none');
cats.forEach(c => console.log(`     ${c}: ` + list.filter(i => i.category === c).map(i => i.id).join(', ')));
// Grouped in ingredients.json so the URL and the catalog stay in category order.
eq('ingredients grouped by category',
   JSON.stringify(list.map(i => cats.indexOf(i.category))),
   JSON.stringify([...list.map(i => cats.indexOf(i.category))].sort((a, b) => a - b)));
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
