/* Recipe page: render a plain, scrapable recipe document from the query string. */
(function () {
  'use strict';

  var banner = document.getElementById('banner');

  SB.loadIngredients()
    .then(function (data) {
      var decoded = SB.decodeRecipe(location.search, data.byId);
      if (decoded.unknown.length) {
        show(banner, 'This link references ingredient(s) not in ingredients.json: ' +
          decoded.unknown.join(', ') + '. They are missing from the totals below.');
      }
      render(decoded, SB.computeTotals(decoded, data.list));
    })
    .catch(function (err) {
      show(banner, 'Could not load ingredients.json — ' + err.message +
        '. This page must be served over http, not opened as a file.');
      console.error(err);
    });

  function render(recipe, totals) {
    var name = recipe.name || 'Shake';
    document.title = name + ' — shake recipe';
    document.getElementById('r-name').textContent = name;

    var yieldEl = document.getElementById('r-yield');
    yieldEl.innerHTML = 'Makes <span itemprop="recipeYield">' +
      SB.fmtQty(totals.servings) + '</span> serving' + (totals.servings === 1 ? '' : 's') + '.';

    var lines = SB.ingredientLines(totals);
    var ul = document.getElementById('r-ingredients');
    ul.innerHTML = '';
    if (!lines.length) {
      ul.innerHTML = '<li class="empty">This recipe is empty.</li>';
    }
    lines.forEach(function (text) {
      var li = document.createElement('li');
      // Microdata as well as JSON-LD below: we cannot see which one the importer prefers.
      li.setAttribute('itemprop', 'recipeIngredient');
      li.textContent = text;
      ul.appendChild(li);
    });

    setNum('r-kcal', SB.fmtKcal(totals.perServing.kcal));
    setNum('r-kcal-t', SB.fmtKcal(totals.total.kcal));
    ['netCarb', 'carb', 'fiber', 'protein', 'fat'].forEach(function (m) {
      setNum('r-' + m, SB.fmtMacro(totals.perServing[m]));
      setNum('r-' + m + '-t', SB.fmtMacro(totals.total[m]));
    });

    injectJsonLd(name, lines, totals);

    document.getElementById('edit').href =
      'index.html' + (location.search || '');

    document.getElementById('copy-ingredients').addEventListener('click', function () {
      var btn = this;
      if (!lines.length) return flash(btn, 'Nothing to copy', 'Copy ingredients');
      copy(lines.join('\n'), function () { flash(btn, 'Copied ✓', 'Copy ingredients'); });
    });
  }

  // Nutrition values carry units, per schema.org/NutritionInformation, and are per serving.
  function injectJsonLd(name, lines, totals) {
    var per = totals.perServing;
    var doc = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: name,
      recipeCategory: 'Beverage',
      recipeYield: SB.fmtQty(totals.servings) + ' serving' + (totals.servings === 1 ? '' : 's'),
      recipeIngredient: lines,
      nutrition: {
        '@type': 'NutritionInformation',
        servingSize: '1 serving',
        calories: SB.fmtKcal(per.kcal) + ' kcal',
        // Label semantics: carbohydrateContent is TOTAL carbohydrate, fiber included.
        // Net carbs are ours to display, not a schema.org field, so we publish both
        // components and let the consumer derive it.
        carbohydrateContent: SB.fmtMacro(per.carb) + ' g',
        fiberContent: SB.fmtMacro(per.fiber) + ' g',
        proteinContent: SB.fmtMacro(per.protein) + ' g',
        fatContent: SB.fmtMacro(per.fat) + ' g'
      }
    };

    var el = document.getElementById('ld') || document.createElement('script');
    el.id = 'ld';
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(doc, null, 2);
    if (!el.parentNode) document.head.appendChild(el);
  }

  function setNum(id, value) {
    document.getElementById(id).textContent = value;
  }

  function show(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function copy(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  // http:// on a phone is not a secure context, so the async clipboard API is absent there.
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    try { document.execCommand('copy'); done(); }
    catch (e) { window.prompt('Copy this:', text); }
    document.body.removeChild(ta);
  }

  function flash(btn, msg, restore) {
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = restore; }, 1400);
  }
})();
