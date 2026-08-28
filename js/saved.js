/* Saved-recipes page: list, rename, delete, and JSON export/import of localStorage entries. */
(function () {
  'use strict';

  var banner = document.getElementById('banner');
  var listEl = document.getElementById('saved-list');
  var countEl = document.getElementById('saved-count');
  var ioEl = document.getElementById('io');
  var ioApplyBtn = document.getElementById('io-apply');
  var exportBtn = document.getElementById('export');
  var importBtn = document.getElementById('import');

  var data = null;   // { list, byId, categories }

  SB.loadIngredients()
    .then(function (loaded) {
      data = loaded;
      bind();
      render();
    })
    .catch(function (err) {
      show(banner, 'Could not load ingredients.json — ' + err.message +
        '. This page must be served over http, not opened as a file.');
      console.error(err);
    });

  function bind() {
    // Delegated so rows can be rebuilt freely.
    listEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var li = btn.closest('li');
      var name = li.dataset.name;
      if (btn.dataset.act === 'rename') onRename(name);
      else if (btn.dataset.act === 'delete') onDelete(name);
    });

    exportBtn.addEventListener('click', onExport);
    importBtn.addEventListener('click', onImportStart);
    ioApplyBtn.addEventListener('click', onImportApply);
  }

  function render() {
    if (!SBStore.available()) {
      show(banner, 'Local storage is unavailable in this browser (private browsing?) — ' +
        'saved recipes cannot be listed here.');
    }
    var entries = SBStore.available() ? SBStore.load() : [];

    countEl.textContent = entries.length === 0 ? 'Nothing saved yet.' :
      entries.length + ' saved recipe' + (entries.length === 1 ? '' : 's') + '.';

    listEl.innerHTML = '';
    if (!entries.length) {
      listEl.innerHTML = '<li class="empty">Nothing saved yet.</li>';
      return;
    }
    entries.forEach(function (entry) {
      listEl.appendChild(row(entry));
    });
  }

  function row(entry) {
    var li = document.createElement('li');
    li.dataset.name = entry.name;

    var a = document.createElement('a');
    a.className = 'saved-link';
    a.href = 'recipe.html?' + entry.query;

    var name = document.createElement('span');
    name.className = 'ing-name';
    name.textContent = entry.name;
    a.appendChild(name);

    var amount = document.createElement('span');
    amount.className = 'ing-amount';
    amount.textContent = summarize(entry);
    a.appendChild(amount);

    li.appendChild(a);

    var renameBtn = document.createElement('button');
    renameBtn.className = 'btn btn-small';
    renameBtn.type = 'button';
    renameBtn.dataset.act = 'rename';
    renameBtn.textContent = 'Rename';
    li.appendChild(renameBtn);

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small';
    deleteBtn.type = 'button';
    deleteBtn.dataset.act = 'delete';
    deleteBtn.textContent = 'Delete';
    li.appendChild(deleteBtn);

    return li;
  }

  // Computed the same way the recipe page does: decode -> computeTotals -> fmt*.
  // No new math, and an entry that references a since-removed ingredient just
  // shows a smaller total rather than throwing.
  function summarize(entry) {
    var decoded = SB.decodeRecipe(entry.query, data.byId);
    var totals = SB.computeTotals(decoded, data.list);
    var parts = [
      SB.fmtKcal(totals.perServing.kcal) + ' kcal',
      SB.fmtMacro(totals.perServing.protein) + ' g protein',
      SB.fmtQty(totals.servings) + ' serving' + (totals.servings === 1 ? '' : 's')
    ];
    // An imported entry can carry a missing or malformed savedAt; drop the clause
    // entirely rather than trailing a bare "saved ".
    var when = fmtDate(entry.savedAt);
    if (when) parts.push('saved ' + when);
    return parts.join(' · ');
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  function onRename(name) {
    var typed = window.prompt('Rename recipe:', name);
    if (typed === null || !typed.trim()) return;
    var result = SBStore.rename(name, typed.trim());
    if (!result.ok) {
      show(banner, result.reason === 'exists' ?
        'A saved recipe named "' + typed.trim() + '" already exists.' :
        'Could not rename that recipe.');
      return;
    }
    hide(banner);
    render();
  }

  function onDelete(name) {
    if (!window.confirm('Delete the saved recipe named "' + name + '"?')) return;
    SBStore.remove(name);
    render();
  }

  function onExport() {
    var json = SBStore.exportJson();
    ioEl.value = json;
    ioEl.hidden = false;
    ioApplyBtn.hidden = true;
    ioEl.focus();
    ioEl.select();
    copy(json, function () { flash(exportBtn, 'Copied ✓', 'Export'); });
  }

  function onImportStart() {
    ioEl.value = '';
    ioEl.hidden = false;
    ioApplyBtn.hidden = false;
    ioEl.focus();
  }

  function onImportApply() {
    var text = ioEl.value.trim();
    if (!text) return show(banner, 'Paste exported JSON first.');

    var dry = SBStore.importJson(text, { dryRun: true });
    if (!dry.ok) return show(banner, dry.error || 'Could not import that JSON.');

    if (dry.conflicts > 0) {
      var proceed = window.confirm(dry.conflicts + ' saved recipe(s) share a name with an ' +
        'imported entry and will be replaced. Continue?');
      if (!proceed) return;
    }

    var result = SBStore.importJson(text);
    if (!result.ok) return show(banner, result.error || 'Could not import that JSON.');

    ioEl.hidden = true;
    ioApplyBtn.hidden = true;
    show(banner, result.added + ' added, ' + result.replaced + ' replaced.');
    render();
  }

  function show(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function hide(el) {
    el.hidden = true;
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
