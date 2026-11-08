import { h, icon, toast, openSheet, promptSheet, choiceControl } from '../ui.js';
import { getCalc } from '../registry.js';
import { settings, prefs, pushRecentCalc, notebook, addCardToPage, addPage, saveNotebook } from '../store.js';
import {
  fieldType, initState, run, selectOptions, isShown, unitChoices, fieldUnitLabel,
  applyCropDefaults, fixSelects, formatResult, snapshot,
} from '../engine.js';
import { renderSteps } from '../steps.js';
import { practicalUnits, unitLabel } from '../units.js';
import { gpsSpeedometer } from '../speedo.js';

/** A unit chip: each tap moves to the next unit in its (short, practical) list. */
function unitToggle(cls, options, current, onChange, aria) {
  const i = Math.max(0, options.findIndex(o => o.value === current));
  const next = options[(i + 1) % options.length];
  return h('button.' + cls.trim().split(/\s+/).join('.'), {
    type: 'button', 'aria-label': `${aria}: ${options[i].label}. Tap for ${next.label}`, title: `Tap for ${next.label}`,
    on: { click: () => onChange(next.value) },
  }, options[i].label);
}


export function renderCalc(view, id, query) {
  const def = getCalc(id);
  if (!def) { view.append(h('div.empty', 'Calculator not found.'), h('a.btn', { href: '#/' }, 'Back to calculators')); return; }
  pushRecentCalc(id);
  // a live tool with no inputs (Speedometer): just the tool itself
  if (def.toolOnly) {
    const tool = gpsSpeedometer(settings);
    view.append(
      h('header.topbar',
        h('a.icon-btn.plain', { href: '#/', 'aria-label': 'Back' }, icon('back')),
        h('h1', def.title),
        h('span.icon-btn.plain', { 'aria-hidden': 'true' })),
      h('p.calc-desc', def.desc),
      tool.el);
    return () => tool.stop();
  }

  let prefill = null;
  if (query.get('p')) { try { prefill = JSON.parse(query.get('p')); } catch { prefill = null; } }
  const saveKey = 'inputs.' + id;
  // last inputs are only reused when the unit system hasn't changed since
  const saved = prefs.get(saveKey, null);
  const state = initState(def, settings, prefill || saved?.system !== settings.system ? null : saved, prefill);
  const resUnits = prefs.get('resunits.' + id, {});   // result unit chosen by tapping
  let last = null;

  const fieldsEl = h('div.panel');
  const resultsEl = h('div.panel.results');
  const workEl = h('details.work', { open: prefs.get('workOpen', true) });
  workEl.addEventListener('toggle', () => prefs.set('workOpen', workEl.open));
  const linksEl = h('div.links');
  // live tools shown above the inputs (Speedometer: GPS)
  const gps = def.widget === 'gps' ? gpsSpeedometer(settings) : null;
  // optional reference card (e.g. Tank Mix: mixing order); open unless folded away before
  let infoEl = null;
  if (def.info) {
    const I = def.info;
    infoEl = h('details.info-card', { open: prefs.get('info.' + id, true) },
      h('summary', icon('note'), h('span', I.title), icon('chevR', 'ic-chev')),
      I.intro ? h('p.info-intro', I.intro) : null,
      h('ol.info-steps', I.steps.map(([key, head, detail]) => h('li',
        h('span.info-key', key), h('div', h('b', head), detail ? h('small', detail) : null)))),
      I.outro ? h('p.info-outro', I.outro) : null);
    infoEl.addEventListener('toggle', () => prefs.set('info.' + id, infoEl.open));
  }
  // Opened from a notebook entry's "Edit inputs" (?edit=<pageId>~<cardId>):
  // the main button rewrites that entry instead of adding a new one.
  const [editPageId, editCardId] = (query.get('edit') || '').split('~');
  const editing = !!editCardId;
  const addBtn = h('button.btn.primary', { on: { click: () => (editing ? updateEntry() : addToNotebook()) } },
    icon(editing ? 'check' : 'bookAdd'), editing ? 'Update notebook entry' : 'Add to Notebook');
  const addNewBtn = editing ? h('button.btn', { on: { click: () => addToNotebook() } }, icon('bookAdd'), 'Add as new') : null;

  const save = () => prefs.set(saveKey, { values: state.values, units: state.units, system: settings.system });

  // ---------- inputs ----------
  function drawFields() {
    fieldsEl.replaceChildren();
    const parsed = run(def, state, settings);
    for (const f of def.fields) {
      if (!isShown(f, state.values, state.units)) continue;
      const t = fieldType(f);
      const help = typeof f.help === 'function' ? f.help(parsed.v) : f.help;
      const label = h('label', { for: 'f-' + f.name }, f.label, f.sym ? h('span.sym', f.sym) : null, help ? h('small', help) : null);
      let control;
      if (t === 'number') {
        const input = h('input', {
          id: 'f-' + f.name, type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
          value: state.values[f.name] ?? '', placeholder: f.optional ? 'optional' : '',
          on: {
            input: e => { state.values[f.name] = e.target.value; save(); update(); },
            focus: e => e.target.select(),
          },
        });
        const choices = unitChoices(f, settings.system, state.units[f.name]);
        const ulabel = fieldUnitLabel(f, state.units[f.name], settings.currency);
        let unitEl = null;
        if (choices && choices.length > 1) {
          unitEl = unitToggle('unit-btn',
            choices.map(u => ({ value: u, label: fieldUnitLabel(f, u, settings.currency) })),
            state.units[f.name],
            u => { state.units[f.name] = u; save(); drawFields(); update(); },
            `${f.label} unit`);
        } else if (ulabel) unitEl = h('span.unit-static', ulabel);
        const prefix = f.money ? h('span.unit-static', { style: { borderLeft: 0, borderRight: '1px solid var(--line-2)' } }, settings.currency) : null;
        control = h('div.input-wrap', prefix, input, unitEl);
      } else {
        const opts = selectOptions(f, state.values, parsed.ctx) || [];
        control = choiceControl('f-' + f.name, f.label, opts, state.values[f.name], val => {
          state.values[f.name] = val;
          if (f.type === 'crop') applyCropDefaults(def, state, settings);
          fixSelects(def, state, settings);
          save(); drawFields(); update();
        });
      }
      // segmented toggles get the full row width under their label
      const row = h('div.field' + (control.classList.contains('choice-seg') ? '.stack' : ''), label, control);
      if (parsed.bad.includes(f.name)) row.classList.add('invalid');
      fieldsEl.append(row);
    }
  }

  // ---------- results ----------
  function update() {
    const r = run(def, state, settings);
    last = r;
    // keep invalid highlighting in sync without redrawing inputs (keeps focus)
    for (const f of def.fields) {
      const row = fieldsEl.querySelector('#f-' + f.name)?.closest('.field');
      if (row) row.classList.toggle('invalid', r.bad.includes(f.name));
    }
    // refresh dynamic help text (e.g. 1/1000 acre length depends on row width)
    for (const f of def.fields) {
      if (typeof f.help !== 'function') continue;
      const small = fieldsEl.querySelector(`label[for="f-${f.name}"] small`);
      if (small) small.textContent = f.help(r.v);
    }
    resultsEl.replaceChildren();
    workEl.replaceChildren();
    linksEl.replaceChildren();
    addBtn.disabled = true;
    if (addNewBtn) addNewBtn.disabled = true;
    if (!r.out) {
      resultsEl.append(h('div.placeholder', r.bad.length ? 'Check the highlighted value.' : 'Enter the values above to calculate.'));
      return;
    }
    if (r.out.error) { resultsEl.append(h('div.placeholder', r.out.error)); return; }
    addBtn.disabled = false;
    if (addNewBtn) addNewBtn.disabled = false;
    const res = r.out.results;
    const primary = res.find(x => x.primary) || res[0];
    const unitButton = (x, fr, cls) => {
      if (!x.dim || !fr.unitText) return fr.unitText ? h('span' + cls, fr.unitText) : null;
      const ids = practicalUnits(x.dim, x.unitSet, fr.unitId);
      if (ids.length < 2) return h('span' + cls, fr.unitText);
      const lab = u => { const l = unitLabel(x.dim, u, r.ctx.cur); return x.money ? l.replace(r.ctx.cur, '') : l; };
      return unitToggle('r-unit-btn' + cls.replace('.', ' '), ids.map(u => ({ value: u, label: lab(u) })), fr.unitId,
        u => { resUnits[x.label] = u; prefs.set('resunits.' + id, resUnits); update(); }, `${x.label} unit`);
    };
    const pf = formatResult(primary, r.ctx, resUnits[primary.label]);
    resultsEl.append(h('div.result-primary',
      h('span.r-label', primary.label),
      h('div', h('span.r-value', pf.valueText), unitButton(primary, pf, '.r-unit'))));
    for (const x of res) {
      if (x === primary) continue;
      const fr = formatResult(x, r.ctx, resUnits[x.label]);
      resultsEl.append(h('div.result-row', h('span.r-label', x.label), h('span.r-value', fr.valueText, fr.unitText ? ' ' : '', unitButton(x, fr, ''))));
    }
    (r.out.warn || []).forEach(w => resultsEl.append(h('div.result-warn', '⚠ ' + w)));
    // extra info (spec-sheet basis, constants, sources) folds away under a small toggle
    const notes = r.out.notes || [];
    if (notes.length) {
      const more = h('details.result-more', { open: prefs.get('notesOpen', false) },
        h('summary', icon('chevR'), 'Details'),
        notes.map(nt => h('div.result-note', nt)));
      more.addEventListener('toggle', () => prefs.set('notesOpen', more.open));
      resultsEl.append(more);
    }

    const stepsEl = renderSteps({ steps: r.out.work }, { given: false });
    // a "+" on each step adds just that calculation to the notebook
    stepsEl.querySelectorAll('.step').forEach((el, i) => el.append(h('button.step-add', {
      type: 'button', 'aria-label': `Add “${r.out.work[i].label}” to notebook`, title: 'Add this step to the notebook',
      on: { click: () => choosePage([i]) },
    }, icon('plus'))));
    workEl.append(h('summary', icon('chevR'), 'Show work', h('span.work-hint', 'tap + to add one step')), stepsEl);
    for (const l of r.out.links || []) {
      const target = getCalc(l.calc);
      if (!target) continue;
      const vals = Object.fromEntries(Object.entries(l.values).filter(([, x]) => x !== undefined && x !== null));
      linksEl.append(h('a.chip', { href: `#/calc/${l.calc}?p=${encodeURIComponent(JSON.stringify(vals))}` }, 'Use in → ', target.title));
    }
  }

  // ---------- notebook ----------
  // Step 1: choose which calculation(s) to add. The final answer is pre-selected.
  function addToNotebook() {
    if (!last?.out || last.out.error) return;
    const work = last.out.work;
    const picked = new Set([work.length - 1]);
    openSheet(close => {
      const list = h('div');
      const nextBtn = h('button.btn.primary', { on: { click: () => { close(); choosePage([...picked].sort((a, b) => a - b)); } } });
      const draw = () => {
        list.replaceChildren(...work.map((s, i) => h('button.list-item.pick' + (picked.has(i) ? '.on' : ''), {
          'aria-pressed': String(picked.has(i)),
          on: { click: () => { if (picked.has(i)) picked.delete(i); else picked.add(i); draw(); } },
        },
        h('span.checkbox', picked.has(i) ? icon('check') : null),
        h('div.li-main', h('div.li-title', s.label), h('div.li-sub.hand-line', `${s.f ? s.f + ' = ' : ''}${s.r}`)))));
        nextBtn.disabled = !picked.size;
        nextBtn.textContent = picked.size === work.length ? 'Add whole calculation' : `Add ${picked.size} step${picked.size === 1 ? '' : 's'}`;
      };
      draw();
      return [
        h('h3', `${def.title}: what to add?`),
        // Summary card: your inputs written out, then the answer (the working stays in the calculator)
        h('button.list-item.summary-opt', { type: 'button', on: { click: () => { close(); choosePage('summary'); } } },
          icon('note'),
          h('div.li-main', h('div.li-title', 'Summary'), h('div.li-sub', 'Your inputs, then the answer · open the calculator to see the working')),
          icon('chevR')),
        h('div.sheet-divider', 'or the working, step by step'),
        list,
        h('div.row',
          h('button.btn', { on: { click: () => { work.forEach((_, i) => picked.add(i)); draw(); } } }, 'Select all'),
          nextBtn),
      ];
    });
  }

  // Step 2: choose the notebook page
  function choosePage(pick) {
    if (!last?.out || last.out.error) return;
    const snap = snapshot(def, state, settings, last, resUnits, pick);
    openSheet(close => {
      const items = notebook.pages.map(p => h('button.list-item' + (p.id === notebook.lastPageId ? '.on' : ''), {
        on: { click: () => { close(); place(p.id); } },
      }, icon('book'), h('div.li-main', h('div.li-title', p.name), h('div.li-sub', `${p.cards.length} calculation${p.cards.length === 1 ? '' : 's'}`)), p.id === notebook.lastPageId ? icon('check') : null));
      return [
        h('h3', 'Add to notebook page'),
        h('p.sheet-note', snap.style === 'summary' ? `${def.title}: summary` : snap.subtitle ? `${def.title}: ${snap.subtitle}` : `${def.title}: whole calculation`),
        ...items,
        h('button.list-item', {
          on: {
            click: async () => {
              close();
              const name = await promptSheet('New notebook page', '', 'Create');
              if (name) place(addPage(name).id);
            },
          },
        }, icon('plus'), h('div.li-main', h('div.li-title', 'New page…'))),
      ];
    });
    function place(pageId) {
      const card = addCardToPage(pageId, snap);
      const page = notebook.pages.find(p => p.id === pageId);
      toast(`Added to “${page.name}”`, { label: 'View', fn: () => { location.hash = `#/notebook?page=${pageId}&card=${card.id}`; } });
    }
  }

  // Rewrite the notebook entry this page was opened from, keeping its place on the page,
  // its note and any marks drawn on it. Equations that use it recalculate on their own.
  async function updateEntry() {
    if (!last?.out || last.out.error) return;
    await notebook.ready;
    const page = notebook.pages.find(p => p.id === editPageId);
    const card = page && page.cards.find(c => c.id === editCardId);
    if (!card) { toast('That notebook entry was deleted. Add it as new instead.'); return; }
    // rebuild it the way it was made: summary, whole working, or the same steps (matched by name)
    let pick = card.pick !== undefined ? card.pick : (card.style === 'summary' ? 'summary' : null);
    if (pick !== 'summary' && card.subtitle) {
      const names = (card.steps || []).map(s => s.label);
      const idx = last.out.work.map((s, i) => (names.includes(s.label) ? i : -1)).filter(i => i >= 0);
      pick = idx.length ? idx : null;
    }
    const snap = snapshot(def, state, settings, last, resUnits, pick);
    const keep = { id: card.id, x: card.x, y: card.y, date: card.date, collapsed: card.collapsed, note: card.note, showWork: card.showWork, auto: false };
    for (const k of Object.keys(card)) delete card[k];
    Object.assign(card, snap, keep, { edited: Date.now() });
    saveNotebook(true);
    location.hash = `#/notebook?page=${page.id}&card=${card.id}`;
    toast('Notebook entry updated');
  }

  function reset() {
    const fresh = initState(def, settings, null, null);
    Object.assign(state.values, fresh.values); Object.assign(state.units, fresh.units);
    for (const k of Object.keys(resUnits)) delete resUnits[k];
    prefs.set('resunits.' + id, {});
    save(); drawFields(); update();
    toast('Reset to defaults');
  }

  view.append(...[
    h('header.topbar',
      h('a.icon-btn.plain', { href: editing ? '#/notebook' : '#/', 'aria-label': 'Back' }, icon('back')),
      h('h1', def.title),
      h('button.icon-btn.plain', { 'aria-label': 'Reset to defaults', title: 'Reset', on: { click: reset } }, icon('reset'))),
    h('p.calc-desc', def.desc),
    gps ? gps.el : null,
    editing ? h('div.edit-banner', icon('edit'), h('span', 'Editing a notebook entry. Change any value, then tap ', h('b', 'Update'), '.')) : null,
    fieldsEl,
    resultsEl,
    h('div.actions', addBtn, addNewBtn),
    infoEl,
    workEl,
    linksEl,
  ].filter(Boolean));
  drawFields();
  update();
  if (prefill) save();
  // stop live tools (GPS) when you leave the page
  return () => { if (gps) gps.stop(); };
}
