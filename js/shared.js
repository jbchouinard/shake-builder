/* Shared data loading, URL codec and macro math for both pages. */
(function (global) {
  'use strict';

  var RESERVED_KEYS = ['n', 's'];
  // carb is TOTAL carbohydrate and includes fiber; netCarb is derived, never stored.
  var MACROS = ['kcal', 'carb', 'fiber', 'protein', 'fat'];
  var ID_RE = /^[a-z0-9-]+$/;

  /* ---------- loading ---------- */

  function loadIngredients(url) {
    return fetch(url || 'ingredients.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('ingredients.json: HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = (data && data.ingredients) || [];
        var categories = (data && data.categories) || [];
        validate(list, categories);
        return { list: list, byId: index(list), categories: categories };
      });
  }

  // Bad ids silently produce wrong recipes, so complain loudly instead.
  function validate(list, categories) {
    var seen = Object.create(null);
    list.forEach(function (ing, i) {
      var where = 'ingredients[' + i + ']';
      if (!ID_RE.test(ing.id || '')) {
        console.error(where + ': id "' + ing.id + '" must match ' + ID_RE);
      }
      if (RESERVED_KEYS.indexOf(ing.id) !== -1) {
        console.error(where + ': id "' + ing.id + '" collides with a reserved URL key');
      }
      if (seen[ing.id]) console.error(where + ': duplicate id "' + ing.id + '"');
      seen[ing.id] = true;
      if (!ing.unit || !(ing.unit.grams > 0)) {
        console.error(where + ' (' + ing.id + '): unit.grams must be a positive number');
      }
      MACROS.forEach(function (m) {
        if (typeof (ing.per100g || {})[m] !== 'number') {
          console.error(where + ' (' + ing.id + '): per100g.' + m + ' is missing');
        }
      });
      // An unlisted category would silently vanish from the filter chips.
      if (categories.length && categories.indexOf(ing.category) === -1) {
        console.error(where + ' (' + ing.id + '): category "' + ing.category +
          '" is not in the top-level categories list');
      }
      if (ing.per100g && ing.per100g.fiber > ing.per100g.carb) {
        console.error(where + ' (' + ing.id + '): fiber exceeds total carb, so net carbs ' +
          'would be negative — carb must be TOTAL carbohydrate, fiber included');
      }
    });
  }

  function index(list) {
    var by = Object.create(null);
    list.forEach(function (ing) { by[ing.id] = ing; });
    return by;
  }

  /* ---------- URL codec ---------- */

  // Returns { name, servings, qty: {id: number}, unknown: [key] }
  function decodeRecipe(search, byId) {
    var params = new URLSearchParams(search || '');
    var recipe = { name: '', servings: 1, qty: {}, unknown: [] };

    params.forEach(function (raw, key) {
      if (key === 'n') { recipe.name = raw; return; }
      if (key === 's') {
        var s = parseFloat(raw);
        if (isFinite(s) && s > 0) recipe.servings = s;
        else console.warn('Ignoring invalid servings "' + raw + '"');
        return;
      }
      if (!byId[key]) { recipe.unknown.push(key); return; }
      var q = parseFloat(raw);
      if (!isFinite(q) || q <= 0) {
        console.warn('Ignoring invalid quantity "' + raw + '" for ' + key);
        return;
      }
      recipe.qty[key] = q;
    });

    return recipe;
  }

  // Ingredient order follows the JSON so URLs for the same shake are stable.
  function encodeRecipe(recipe, list) {
    var params = new URLSearchParams();
    if (recipe.name) params.set('n', recipe.name);
    if (recipe.servings && recipe.servings !== 1) params.set('s', trimNum(recipe.servings));
    list.forEach(function (ing) {
      var q = recipe.qty[ing.id];
      if (q > 0) params.set(ing.id, trimNum(q));
    });
    return params.toString();
  }

  /* ---------- macros ---------- */

  // Rounding happens at display time only; the accumulator stays exact.
  function computeTotals(recipe, list) {
    var servings = recipe.servings > 0 ? recipe.servings : 1;
    var total = zero();
    var lines = [];

    list.forEach(function (ing) {
      var qty = recipe.qty[ing.id];
      if (!(qty > 0)) return;
      var grams = qty * ing.unit.grams;
      var macros = {};
      MACROS.forEach(function (m) {
        macros[m] = grams * ing.per100g[m] / 100;
        total[m] += macros[m];
      });
      withNetCarb(macros);
      lines.push({ ingredient: ing, qty: qty, grams: grams, macros: macros });
    });

    var perServing = {};
    MACROS.forEach(function (m) { perServing[m] = total[m] / servings; });

    return {
      lines: lines,
      total: withNetCarb(total),
      perServing: withNetCarb(perServing),
      servings: servings
    };
  }

  function zero() {
    var o = {};
    MACROS.forEach(function (m) { o[m] = 0; });
    return o;
  }

  // Derived at the end so it can never drift from carb/fiber. Clamped at 0: a
  // mis-entered ingredient should read as zero net carbs, not a negative number.
  function withNetCarb(macros) {
    macros.netCarb = Math.max(0, macros.carb - macros.fiber);
    return macros;
  }

  /* ---------- formatting ---------- */

  function trimNum(n) {
    return String(parseFloat(Number(n).toFixed(3)));
  }

  function fmtQty(n) { return trimNum(n); }
  function fmtGrams(n) { return Math.round(n); }
  function fmtMacro(n) { return trimNum(Math.round(n * 10) / 10); }
  function fmtKcal(n) { return String(Math.round(n)); }

  function unitLabel(ing, qty) {
    var u = ing.unit;
    return qty === 1 ? u.label : (u.plural || u.label);
  }

  // "60 g Whey Protein Isolate Powder (2 scoops)" -- grams first, because that is
  // what Cronometer's matcher handles most reliably.
  function ingredientLine(line) {
    var ing = line.ingredient;
    var name = ing.cronometerName || ing.name;
    var text = fmtGrams(line.grams) + ' g ' + name;
    if (ing.unit.label !== 'g') {
      text += ' (' + fmtQty(line.qty) + ' ' + unitLabel(ing, line.qty) + ')';
    }
    return text;
  }

  function ingredientLines(totals) {
    return totals.lines.map(ingredientLine);
  }

  global.SB = {
    MACROS: MACROS,
    withNetCarb: withNetCarb,
    loadIngredients: loadIngredients,
    decodeRecipe: decodeRecipe,
    encodeRecipe: encodeRecipe,
    computeTotals: computeTotals,
    ingredientLine: ingredientLine,
    ingredientLines: ingredientLines,
    unitLabel: unitLabel,
    fmtQty: fmtQty,
    fmtGrams: fmtGrams,
    fmtMacro: fmtMacro,
    fmtKcal: fmtKcal
  };
})(window);
