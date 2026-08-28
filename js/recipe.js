/* Recipe page: render the recipe named by the query string. */
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
      render(decoded, SB.computeTotals(decoded, data.list), data);
    })
    .catch(function (err) {
      show(banner, 'Could not load ingredients.json — ' + err.message +
        '. This page must be served over http, not opened as a file.');
      console.error(err);
    });

  function render(recipe, totals, data) {
    var name = recipe.name || 'Shake';
    document.title = name + ' — shake recipe';
    document.getElementById('r-name').textContent = name;

    var yieldEl = document.getElementById('r-yield');
    yieldEl.textContent = 'Makes ' + SB.fmtQty(totals.servings) +
      ' serving' + (totals.servings === 1 ? '' : 's') + '.';

    var lines = SB.ingredientLines(totals);
    var ul = document.getElementById('r-ingredients');
    ul.innerHTML = '';
    if (!lines.length) {
      ul.innerHTML = '<li class="empty">This recipe is empty.</li>';
    }
    // Name first and on its own line: it is the string you search for in Cronometer,
    // so it should be readable without picking it out of a sentence.
    totals.lines.forEach(function (line) {
      var li = document.createElement('li');

      var name = document.createElement('span');
      name.className = 'ing-name';
      name.textContent = line.ingredient.cronometerName || line.ingredient.name;
      li.appendChild(name);

      var amount = document.createElement('span');
      amount.className = 'ing-amount';
      var natural = SB.naturalAmount(line);
      amount.textContent = SB.fmtGrams(line.grams) + ' g' + (natural ? ' · ' + natural : '');
      li.appendChild(amount);

      ul.appendChild(li);
    });

    setNum('r-kcal', SB.fmtKcal(totals.perServing.kcal));
    setNum('r-kcal-t', SB.fmtKcal(totals.total.kcal));
    ['netCarb', 'carb', 'fiber', 'protein', 'fat'].forEach(function (m) {
      setNum('r-' + m, SB.fmtMacro(totals.perServing[m]));
      setNum('r-' + m + '-t', SB.fmtMacro(totals.total[m]));
    });

    document.getElementById('edit').href =
      'index.html' + (location.search || '');

    document.getElementById('copy-ingredients').addEventListener('click', function () {
      var btn = this;
      if (!lines.length) return flash(btn, 'Nothing to copy', 'Copy ingredients');
      copy(lines.join('\n'), function () { flash(btn, 'Copied ✓', 'Copy ingredients'); });
    });

    document.getElementById('save-recipe').addEventListener('click', function () {
      var btn = this;
      if (!SBStore.available()) return flash(btn, 'Storage unavailable', 'Save');
      if (!totals.lines.length) return flash(btn, 'Nothing to save', 'Save');

      var saveName = recipe.name;
      if (!saveName) {
        var typed = window.prompt('Name this recipe:', 'Shake');
        if (typed === null || !typed.trim()) return flash(btn, 'Save cancelled', 'Save');
        saveName = typed.trim();
      }

      if (SBStore.find(saveName) !== -1) {
        if (!window.confirm('Replace the saved recipe named "' + saveName + '"?')) {
          return flash(btn, 'Save cancelled', 'Save');
        }
      }

      // Re-encoding (rather than storing location.search verbatim) keeps the stored
      // query in canonical ingredient order and lets a prompted-for name replace an
      // absent n=. It also drops any unknown ingredient keys, same as builder.js does.
      var query = SB.encodeRecipe({ name: saveName, servings: recipe.servings, qty: recipe.qty }, data.list);
      var result = SBStore.save(saveName, query);
      if (result.ok) adoptName(saveName, query);
      flash(btn, result.ok ? 'Saved ✓' : 'Could not save', 'Save');
    });

    // A name typed into the save prompt becomes the recipe's name for real, so a
    // second Save does not prompt again. The heading, title, edit link and address
    // bar follow it, which also means copying the URL now shares the named recipe.
    function adoptName(newName, query) {
      if (recipe.name === newName) return;
      recipe.name = newName;
      document.title = newName + ' — shake recipe';
      document.getElementById('r-name').textContent = newName;
      document.getElementById('edit').href = 'index.html?' + query;
      history.replaceState(null, '', location.pathname + '?' + query);
    }
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
