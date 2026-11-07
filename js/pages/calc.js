import { h, icon, toast, openSheet, promptSheet } from '../ui.js';
import { getCalc } from '../registry.js';
import { settings, prefs, pushRecentCalc, notebook, addCardToPage, addPage } from '../store.js';
import {
  fieldType, initState, run, selectOptions, isShown, unitChoices, fieldUnitLabel,
  applyCropDefaults, fixSelects, formatResult, snapshot,
} from '../engine.js';
import { renderSteps } from '../steps.js';
import { practicalUnits, unitLabel } from '../units.js';

/** A unit chip: each tap moves to the next unit in its (short, practical) list. */
function unitToggle(cls, options, current, onChange, aria) {
  const i = Math.max(0, options.findIndex(o => o.value === current));
  const next = options[(i + 1) % options.length];
  return h('button.' + cls.trim().split(/\s+/).join('.'), {
    type: 'button', 'aria-label': `${aria}: ${options[i].label}. Tap for ${next.label}`, title: `Tap for ${next.label}`,
    on: { click: () => onChange(next.value) },
  }, options[i].label);
}

/**
 * A choice field in the app's own style: a segmented toggle when there are
 * two or three short options, otherwise a button that opens a picker sheet.
 */
function choiceControl(id, label, opts, current, onChange) {
  const cur = opts.find(o => o.value === current) || opts[0];
  if (opts.length <= 3 && opts.every(o => o.label.length <= 14)) {
    return h('div.seg.choice-seg', { id, role: 'radiogroup', 'aria-label': label },
      opts.map(o => h('button' + (o.value === cur?.value ? '.on' : ''), {
        type: 'button', role: 'radio', 'aria-checked': String(o.value === cur?.value),
        on: { click: () => { if (o.value !== cur?.value) onChange(o.value); } },
      }, o.label)));
  }
  return h('button.pick-btn', {
    id, type: 'button', 'aria-label': `${label}: ${cur?.label || ''}`,
    on: {
      click: () => openSheet(close => [
        h('h3', label),
        ...opts.map(o => h('button.list-item' + (o.value === cur?.value ? '.on' : ''), {
          on: { click: () => { close(); if (o.value !== cur?.value) onChange(o.value); } },
        }, h('div.li-main', h('div.li-title', o.label)), o.value === cur?.value ? icon('check') : null)),
      ]),
    },
  }, h('span.pick-label', cur?.label || ''), icon('chev'));
}

export function renderCalc(view, id, query) {
  const def = getCalc(id);
  if (!def) { view.append(h('div.empty', 'Calculator not found.'), h('a.btn', { href: '#/' }, 'Back to calculators')); return; }
  pushRecentCalc(id);

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
  const addBtn = h('button.btn.primary', { on: { click: () => addToNotebook() } }, icon('bookAdd'), 'Add to Notebook');

  const save = () => prefs.set(saveKey, { values: state.values, units: state.units, system: settings.system });

  // ---------- inputs ----------
  function drawFields() {
    fieldsEl.replaceChildren();
    const parsed = run(def, state, settings);
    for (const f of def.fields) {
      if (!isShown(f, state.values)) continue;
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
    if (!r.out) {
      resultsEl.append(h('div.placeholder', r.bad.length ? 'Check the highlighted value.' : 'Enter the values above to calculate.'));
      return;
    }
    if (r.out.error) { resultsEl.append(h('div.placeholder', r.out.error)); return; }
    addBtn.disabled = false;
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
    (r.out.notes || []).forEach(nt => resultsEl.append(h('div.result-note', nt)));

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
    if (work.length === 1) { choosePage([0]); return; }
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
        h('p.sheet-note', snap.subtitle ? `${def.title}: ${snap.subtitle}` : `${def.title}: whole calculation`),
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

  function reset() {
    const fresh = initState(def, settings, null, null);
    Object.assign(state.values, fresh.values); Object.assign(state.units, fresh.units);
    for (const k of Object.keys(resUnits)) delete resUnits[k];
    prefs.set('resunits.' + id, {});
    save(); drawFields(); update();
    toast('Reset to defaults');
  }

  view.append(
    h('header.topbar',
      h('a.icon-btn.plain', { href: '#/', 'aria-label': 'Back' }, icon('back')),
      h('h1', def.title),
      h('button.icon-btn.plain', { 'aria-label': 'Reset to defaults', title: 'Reset', on: { click: reset } }, icon('reset'))),
    h('p.calc-desc', def.desc),
    fieldsEl,
    resultsEl,
    h('div.actions', addBtn),
    workEl,
    linksEl,
  );
  drawFields();
  update();
  if (prefill) save();
}
