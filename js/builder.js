/* Builder page: pick quantities, watch macros update, hand off to the recipe page. */
(function () {
  'use strict';

  var els = {
    banner: document.getElementById('banner'),
    name: document.getElementById('name'),
    servings: document.getElementById('servings'),
    filter: document.getElementById('filter'),
    categories: document.getElementById('categories'),
    shake: document.getElementById('shake'),
    all: document.getElementById('all'),
    viewRecipe: document.getElementById('view-recipe'),
    copyLink: document.getElementById('copy-link'),
    copyIngredients: document.getElementById('copy-ingredients'),
    reset: document.getElementById('reset')
  };

  var data = null;                                   // { list, byId, categories }
  var recipe = { name: '', servings: 1, qty: {} };
  var activeCategory = null;                         // null = show all

  SB.loadIngredients()
    .then(function (loaded) {
      data = loaded;
      var decoded = SB.decodeRecipe(location.search, data.byId);
      recipe = { name: decoded.name, servings: decoded.servings, qty: decoded.qty };
      if (decoded.unknown.length) {
        banner('Ignored unknown ingredient(s) in the link: ' + decoded.unknown.join(', '));
      }
      els.name.value = recipe.name;
      els.servings.value = SB.fmtQty(recipe.servings);
      bind();
      renderChips();
      renderAll();
    })
    .catch(function (err) {
      banner('Could not load ingredients.json — ' + err.message +
             '. This page must be served over http, not opened as a file.');
      console.error(err);
    });

  function banner(msg) {
    els.banner.textContent = msg;
    els.banner.hidden = false;
  }

  /* ---------- events ---------- */

  function bind() {
    // Name and servings never re-render the lists, so typing is never interrupted.
    els.name.addEventListener('input', function () {
      recipe.name = els.name.value.trim();
      renderTotals();
    });

    els.servings.addEventListener('input', function () {
      var s = parseFloat(els.servings.value);
      recipe.servings = isFinite(s) && s > 0 ? s : 1;
      renderTotals();
    });

    els.filter.addEventListener('input', renderCatalog);

    els.categories.addEventListener('click', function (ev) {
      var chip = ev.target.closest('[data-category]');
      if (!chip) return;
      var picked = chip.dataset.category || null;
      // Tapping the active chip clears it, so "All" is never a dead end.
      activeCategory = (picked === activeCategory) ? null : picked;
      renderChips();
      renderCatalog();
    });

    // Delegated so rows can be rebuilt freely.
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-step]');
      if (!btn) return;
      bump(btn.dataset.id, parseFloat(btn.dataset.step));
    });

    els.copyLink.addEventListener('click', function () {
      copy(recipeUrl('recipe.html', true), els.copyLink, 'Copy link');
    });

    els.copyIngredients.addEventListener('click', function () {
      var lines = SB.ingredientLines(SB.computeTotals(recipe, data.list));
      if (!lines.length) return flash(els.copyIngredients, 'Nothing to copy', 'Copy ingredients');
      copy(lines.join('\n'), els.copyIngredients, 'Copy ingredients');
    });

    els.reset.addEventListener('click', function () {
      recipe = { name: '', servings: 1, qty: {} };
      els.name.value = '';
      els.servings.value = '1';
      els.filter.value = '';
      activeCategory = null;
      history.replaceState(null, '', location.pathname);
      renderChips();
      renderAll();
    });
  }

  function bump(id, delta) {
    var ing = data.byId[id];
    if (!ing) return;
    var next = (recipe.qty[id] || 0) + delta;
    // Steps are fractional (0.25 cup, 0.5 scoop); keep float drift out of the URL.
    next = Math.round(next * 1000) / 1000;
    if (next > 0) recipe.qty[id] = next;
    else delete recipe.qty[id];
    renderAll();
  }

  /* ---------- rendering ---------- */

  function renderAll() {
    renderShake();
    renderCatalog();
    renderTotals();
  }

  function renderShake() {
    var active = data.list.filter(function (ing) { return recipe.qty[ing.id] > 0; });
    els.shake.innerHTML = '';

    if (!active.length) {
      els.shake.innerHTML =
        '<li class="empty">Nothing yet — add ingredients above.</li>';
      return;
    }

    active.forEach(function (ing) {
      els.shake.appendChild(row(ing, true));
    });
  }

  function renderChips() {
    els.categories.innerHTML = '';
    [null].concat(data.categories).forEach(function (cat) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = cat || 'All';
      if (cat) chip.dataset.category = cat;
      else chip.dataset.category = '';
      chip.setAttribute('aria-pressed', String(activeCategory === cat));
      els.categories.appendChild(chip);
    });
  }

  // Category chip and text filter are ANDed.
  function renderCatalog() {
    var q = els.filter.value.trim().toLowerCase();
    var matches = data.list.filter(function (ing) {
      if (activeCategory && ing.category !== activeCategory) return false;
      return !q || ing.name.toLowerCase().indexOf(q) !== -1;
    });

    els.all.innerHTML = '';
    if (!matches.length) {
      els.all.innerHTML = '<li class="empty">Nothing matches' +
        (activeCategory ? ' in ' + escapeHtml(activeCategory) : '') +
        (q ? ' for “' + escapeHtml(els.filter.value) + '”' : '') + '.</li>';
      return;
    }
    matches.forEach(function (ing) {
      els.all.appendChild(row(ing, false));
    });
  }

  // detailed=true is the "your shake" row (grams + macros); otherwise the catalog row.
  function row(ing, detailed) {
    var qty = recipe.qty[ing.id] || 0;
    var li = document.createElement('li');
    var item = document.createElement('div');
    item.className = 'item' + (qty > 0 ? ' on' : '');

    var main = document.createElement('div');
    main.className = 'item-main';

    var name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = ing.name;
    if (!ing.verified) {
      var dot = document.createElement('span');
      dot.className = 'unverified';
      dot.textContent = ' •';
      dot.title = 'Macros not yet checked against packaging';
      name.appendChild(dot);
    }
    main.appendChild(name);

    var sub = document.createElement('span');
    sub.className = 'item-sub';
    if (detailed && qty > 0) {
      var grams = qty * ing.unit.grams;
      var per = function (m) { return grams * ing.per100g[m] / 100; };
      var m = SB.withNetCarb({ carb: per('carb'), fiber: per('fiber') });
      sub.textContent = SB.fmtGrams(grams) + ' g · ' +
        SB.fmtKcal(per('kcal')) + ' kcal · ' +
        'net C ' + SB.fmtMacro(m.netCarb) + ' · ' +
        'P ' + SB.fmtMacro(per('protein')) + ' · ' +
        'F ' + SB.fmtMacro(per('fat')) + ' · ' +
        'fib ' + SB.fmtMacro(m.fiber);
    } else if (ing.unit.label === 'g') {
      sub.textContent = ing.category + ' · measured in grams';
    } else {
      sub.textContent = ing.category + ' · ' +
        SB.fmtGrams(ing.unit.grams) + ' g per ' + ing.unit.label;
    }
    item.appendChild(main);

    // A bare "+" until the ingredient is in the shake, then a full stepper.
    if (qty > 0) {
      item.appendChild(stepper(ing, qty));
    } else {
      var add = document.createElement('button');
      add.className = 'add';
      add.type = 'button';
      add.textContent = '+';
      add.dataset.id = ing.id;
      add.dataset.step = ing.step || 1;
      add.setAttribute('aria-label', 'Add ' + ing.name);
      item.appendChild(add);
    }

    // Appended last so flex-wrap puts it on its own full-width line.
    item.appendChild(sub);

    li.appendChild(item);
    return li;
  }

  function stepper(ing, qty) {
    var step = ing.step || 1;
    var wrap = document.createElement('div');
    wrap.className = 'stepper';

    wrap.appendChild(stepButton('−', ing, -step, 'Less ' + ing.name));

    var val = document.createElement('span');
    val.className = 'qty';
    val.textContent = SB.fmtQty(qty);
    val.title = SB.fmtQty(qty) + ' ' + SB.unitLabel(ing, qty);
    wrap.appendChild(val);

    wrap.appendChild(stepButton('+', ing, step, 'More ' + ing.name));
    return wrap;
  }

  function stepButton(label, ing, delta, aria) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.id = ing.id;
    b.dataset.step = delta;
    b.setAttribute('aria-label', aria);
    return b;
  }

  function renderTotals() {
    var totals = SB.computeTotals(recipe, data.list);
    var per = totals.perServing;
    document.getElementById('t-kcal').textContent = SB.fmtKcal(per.kcal);
    document.getElementById('t-netcarb').textContent = SB.fmtMacro(per.netCarb);
    document.getElementById('t-protein').textContent = SB.fmtMacro(per.protein);
    document.getElementById('t-fat').textContent = SB.fmtMacro(per.fat);
    document.getElementById('t-fiber').textContent = SB.fmtMacro(per.fiber);

    document.getElementById('shake-heading').textContent =
      totals.servings === 1 ? 'Your shake' :
      'Your shake — totals below are per serving (' + SB.fmtQty(totals.servings) + ')';

    els.viewRecipe.href = recipeUrl('recipe.html', false);
    // Keep the address bar shareable without adding a history entry per tap.
    history.replaceState(null, '', recipeUrl(location.pathname, false));
  }

  function recipeUrl(base, absolute) {
    var qs = SB.encodeRecipe(recipe, data.list);
    var rel = base + (qs ? '?' + qs : '');
    return absolute ? new URL(rel, location.href).href : rel;
  }

  /* ---------- clipboard ---------- */

  function copy(text, btn, restore) {
    var done = function () { flash(btn, 'Copied ✓', restore); };
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
