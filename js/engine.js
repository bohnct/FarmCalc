// Pure calculator engine: turns form state (text + unit per field) into base
// values, runs the definition's compute(), and builds notebook snapshots.
// No DOM here, so tests can drive it directly.
import { CROPS } from './crops.js';
import { DIMS, toBase, fromBase, defaultUnit, unitLabel, practicalUnits, sideFor } from './units.js';
import { parseNum, fmt, fmtInput, money } from './format.js';

export const fieldType = f => f.type || 'number';

/** ctx used by unit conversions and compute: crop, test weight, currency, system. */
export function makeCtx(def, state, settings) {
  const cropId = def.crop || state.values.crop || settings.crop || 'wheat';
  const crop = CROPS[cropId] || CROPS.wheat;
  let tw = crop.tw;
  const twField = def.fields.find(f => f.name === 'tw');
  if (twField) { const t = parseNum(state.values.tw); if (t > 0) tw = t; }
  // bin ring height (inches) for the "rings" length unit
  let ringIn = 44;
  if (state.values.ringH === 'custom') { const c = parseNum(state.values.ringCustom); if (c > 0) ringIn = c; }
  else if (state.values.ringH) ringIn = Number(state.values.ringH) || 44;
  return { cropId, crop, tw, ringIn, cur: settings.currency || '$', system: settings.system };
}

export function selectOptions(f, v, ctx) {
  if (f.type === 'crop') return Object.entries(CROPS).filter(([id]) => !f.cropIds || f.cropIds.includes(id)).map(([value, c]) => ({ value, label: c.label }));
  return typeof f.options === 'function' ? f.options(v, ctx) : f.options;
}

// show(values, units): a field can depend on other fields' values or on the unit picked for them
export function isShown(f, values, units = {}) { return !f.show || f.show(values, units); }

/** Unit id to show for a number field (dim units or choice list) */
export function initialUnit(f, system) {
  if (f.dim) return defaultUnit(f.dim, system, f.units);
  if (f.choices) return (f.choiceDefault && (f.choiceDefault[system] || (system === 'sk' && f.choiceDefault.us))) || f.choices[0].value;
  return null;
}

/** Units offered in a field's dropdown: practical ones only (see units.js PRACTICAL). */
export function unitChoices(f, system, current) {
  if (f.dim) return practicalUnits(f.dim, f.unitSet, current);
  if (f.choices) {
    // per-hectare choices for metric, per-acre for US (spray product rates)
    // choice lists can be split by system: per-hectare (ha) for metric, Canadian-label units (sk) for Sask
    const split = f.choices.some(c => c.ha || c.sk);
    let list = !split ? f.choices.slice()
      : f.choices.filter(c => (system === 'metric' ? c.ha : system === 'sk' ? c.sk : !c.ha && !c.sk));
    if (current && !list.some(c => c.value === current)) list = [f.choices.find(c => c.value === current), ...list].filter(Boolean);
    return list.map(c => c.value);
  }
  return null;
}

export function fieldUnitLabel(f, unit, cur) {
  if (f.dim) {
    const l = unitLabel(f.dim, unit, cur);
    return f.money ? l.replace(cur, '') : l;
  }
  if (f.choices) return (f.choices.find(c => c.value === unit) || f.choices[0]).label;
  return f.unit || '';
}

const roundNice = x => {
  if (!Number.isFinite(x) || x === 0) return x;
  const p = Math.pow(10, 3 - Math.ceil(Math.log10(Math.abs(x))));
  return Math.round(x * p) / p;
};

/**
 * Build initial state for a calculator.
 * saved: { values, units } from the last visit (text form)
 * prefill: { name: baseValue | string } from a "Use in" link or "Reopen"
 */
export function initState(def, settings, saved, prefill) {
  const sys = settings.system;
  const state = { values: {}, units: {} };
  // selects first (crop affects unit conversions for the number fields)
  for (const f of def.fields) {
    if (fieldType(f) === 'number') continue;
    let val = f.type === 'crop' ? (f.cropIds && !f.cropIds.includes(settings.crop) ? f.cropIds[0] : settings.crop) : f.def;
    // a choice can start from the crop too (e.g. seed sold by bag for corn, by weight for wheat)
    if (f.cropDefault) {
      const crop = CROPS[def.crop || state.values.crop || settings.crop] || CROPS.wheat;
      const cv = typeof f.cropDefault === 'function' ? f.cropDefault(crop) : crop[f.cropDefault];
      if (cv !== undefined) val = cv;
    }
    if (saved?.values?.[f.name] !== undefined) val = saved.values[f.name];
    if (prefill && prefill[f.name] !== undefined) val = prefill[f.name];
    // reopening an entry saved before this field existed: use its `legacy` value
    else if (prefill && f.legacy !== undefined) val = f.legacy;
    state.values[f.name] = val;
  }
  const ctx0 = makeCtx(def, state, settings);
  for (const f of def.fields) {
    if (fieldType(f) !== 'number') continue;
    let unit = initialUnit(f, sys);
    let text = '';
    if (f.def !== null && f.def !== undefined) {
      // crop constants are stored in US units, same as `def`
      // cropDefault: a crop value name ('moist') or a rule (crop => value; undefined = use def)
      const cropVal = !f.cropDefault ? undefined
        : typeof f.cropDefault === 'function' ? f.cropDefault(ctx0.crop) : ctx0.crop[f.cropDefault];
      const fromCrop = cropVal !== undefined;
      const usVal = fromCrop ? cropVal : f.def;
      if (fromCrop && !usVal) text = '';
      // starting value for Sask (any field, with or without a unit)
      else if (sys === 'sk' && f.defSk !== undefined && !fromCrop) text = fmtInput(f.defSk);
      else if (!f.dim) text = fmtInput(usVal);
      // …and defMetric where the quantity is metric
      else if (sideFor(f.dim, sys) === 'metric' && f.defMetric !== undefined && !fromCrop) text = fmtInput(f.defMetric);
      else {
        // `def` is in the field's own US unit; crop values are in the standard US unit
        // for that quantity (seeds/ac, bu/ac, lb/ac…), whatever the field displays
        const usUnit = fromCrop ? defaultUnit(f.dim, 'us') : defaultUnit(f.dim, 'us', f.units);
        const shown = fromBase(f.dim, toBase(f.dim, usVal, usUnit, ctx0), unit, ctx0);
        text = fmtInput(unit === usUnit ? shown : roundNice(shown));
      }
      // fields with a unit list can give a starting value per unit (e.g. 32 fl oz/ac, 0.5 L/ac)
      if (f.choices && f.defs && f.defs[unit] !== undefined) text = fmtInput(f.defs[unit]);
    }
    if (saved?.values?.[f.name] !== undefined) {
      text = saved.values[f.name];
      if (saved.units?.[f.name] && (unitChoices(f, sys) || []).includes(saved.units[f.name])) unit = saved.units[f.name];
    }
    state.values[f.name] = text;
    state.units[f.name] = unit;
  }
  if (prefill) {
    const ctx = makeCtx(def, state, settings);
    for (const f of def.fields) {
      if (fieldType(f) !== 'number' || prefill[f.name] === undefined || prefill[f.name] === null) continue;
      const base = prefill[f.name];
      // restore the unit it was entered in (e.g. rings) when it's still a valid choice
      const pu = prefill[f.name + 'Unit'];
      if (pu && ((f.choices && f.choices.some(c => c.value === pu)) || (f.dim && DIMS[f.dim].units[pu]))) state.units[f.name] = pu;
      state.values[f.name] = typeof base === 'number' ? fmtInput(f.dim ? fromBase(f.dim, base, state.units[f.name], ctx) : base) : String(base);
    }
  }
  fixSelects(def, state, settings);
  return state;
}

/** Make sure dependent selects hold a valid option (e.g. converter units after the type changes). */
export function fixSelects(def, state, settings) {
  const ctx = makeCtx(def, state, settings);
  for (const f of def.fields) {
    if (fieldType(f) !== 'select') continue;
    const opts = selectOptions(f, state.values, ctx) || [];
    if (!opts.some(o => o.value === state.values[f.name])) {
      const picked = f.pick ? f.pick(state.values, settings.system) : null;
      state.values[f.name] = opts.some(o => o.value === picked) ? picked : opts[0]?.value;
    }
  }
}

/** When the crop changes, refresh fields that default from crop constants. */
export function applyCropDefaults(def, state, settings) {
  const ctx = makeCtx(def, state, settings);
  for (const f of def.fields) {
    if (!f.cropDefault) continue;
    const val = typeof f.cropDefault === 'function' ? f.cropDefault(ctx.crop) : ctx.crop[f.cropDefault];
    if (val === undefined) continue;
    if (fieldType(f) !== 'number') { state.values[f.name] = val; continue; }
    if (!val) { state.values[f.name] = ''; continue; }
    const usUnit = f.dim ? defaultUnit(f.dim, 'us') : null;   // crop values are in the standard US unit (seeds/ac, bu/ac…)
    state.values[f.name] = fmtInput(f.dim ? roundNice(fromBase(f.dim, toBase(f.dim, val, usUnit, ctx), state.units[f.name], ctx)) : val);
  }
}

/** Parse the state into base-unit values. Returns { v, ctx, missing, bad } */
export function parseState(def, state, settings) {
  const ctx = makeCtx(def, state, settings);
  const v = {};
  const missing = [], bad = [];
  for (const f of def.fields) {
    const t = fieldType(f);
    if (t !== 'number') { v[f.name] = state.values[f.name]; continue; }
  }
  for (const f of def.fields) {
    if (fieldType(f) !== 'number') continue;
    const shown = isShown(f, state.values, state.units);
    const text = state.values[f.name];
    const num = parseNum(text);
    if (!shown) { v[f.name] = null; continue; }
    if (!Number.isFinite(num)) {
      if (String(text ?? '').trim()) bad.push(f.name);
      else if (!f.optional) missing.push(f.name);
      v[f.name] = null;
      continue;
    }
    if (f.dim) v[f.name] = toBase(f.dim, num, state.units[f.name], ctx);
    else v[f.name] = num;
    if (f.choices || f.dim) v[f.name + 'Unit'] = state.units[f.name];
  }
  return { v, ctx, missing, bad };
}

export function run(def, state, settings) {
  const { v, ctx, missing, bad } = parseState(def, state, settings);
  if (missing.length || bad.length) return { v, ctx, missing, bad, out: null };
  let out;
  try { out = def.compute(v, ctx); } catch (e) { out = { error: 'Could not calculate: ' + e.message }; }
  if (out && !out.error) {
    const allFinite = out.results.every(r => r.text !== undefined || Number.isFinite(r.value));
    if (!allFinite) out = { error: 'Check the inputs — a value came out undefined (division by zero?).' };
  }
  return { v, ctx, missing, bad, out };
}

/** Display a result: { valueText, unitText, unitId } */
export function formatResult(r, ctx, unitOverride) {
  if (r.text !== undefined) return { valueText: r.text, unitText: '' };
  if (r.dim) {
    const unit = unitOverride || defaultUnit(r.dim, ctx.system, r.units);
    const val = fromBase(r.dim, r.value, unit, ctx);
    const ul = unitLabel(r.dim, unit, ctx.cur);
    if (r.money) return { valueText: money(val, ctx.cur, r.decimals ?? 2), unitText: ul.replace(ctx.cur, ''), unitId: unit };
    return { valueText: fmt(val, r.decimals), unitText: ul, unitId: unit };
  }
  if (r.money) return { valueText: money(r.value, ctx.cur, r.decimals ?? 2), unitText: r.unit || '' };
  return { valueText: fmt(r.value, r.decimals), unitText: r.unit || '' };
}

/**
 * Snapshot used for notebook cards and history.
 * pick: indexes of the work steps to include (null = the whole calculation).
 */
export function snapshot(def, state, settings, result, resUnits = {}, pick = null) {
  const { v, ctx, out } = result;
  // pick === 'summary': a summary card (inputs → answer) that keeps the full working folded away
  const summary = pick === 'summary';
  if (summary) pick = null;
  const all = !pick || pick.length >= out.work.length;
  const steps = all ? out.work : out.work.filter((_, i) => pick.includes(i));
  // which input symbols do the chosen steps use? (e.g. "W", "Mi" in "W × (Mi − Mf)")
  const used = sym => !sym || all || steps.some(s => new RegExp(`(^|[^A-Za-z])${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`).test(s.f || ''));
  let given = [];
  for (const f of def.fields) {
    if (!isShown(f, state.values, state.units)) continue;
    const t = fieldType(f);
    if (t === 'number') {
      const text = state.values[f.name];
      if (!String(text ?? '').trim()) continue;
      const ul = fieldUnitLabel(f, state.units[f.name], ctx.cur);
      const val = f.money ? `${ctx.cur}${text}` : text;
      given.push({ sym: f.sym || '', label: f.label, text: `${val}${ul ? (ul.startsWith('/') || ul === '%' || ul === '°' ? '' : ' ') + ul : ''}` });
    } else {
      const opt = (selectOptions(f, state.values, ctx) || []).find(o => o.value === state.values[f.name]);
      // `short` (if a choice has one) keeps long descriptions off the notebook card
      given.push({ sym: '', label: f.label, text: opt ? (opt.short || opt.label) : String(state.values[f.name]) });
    }
  }
  // for a partial pick, keep only inputs the chosen steps reference (plus the crop)
  if (!all) given = given.filter(g => (g.sym ? used(g.sym) : g.label === 'Crop'));
  const results = all
    ? out.results.map(r => {
      const fr = formatResult(r, ctx, resUnits[r.label]);
      return { label: r.label, text: `${fr.valueText}${fr.unitText ? (fr.unitText.startsWith('/') || fr.unitText === '%' ? '' : ' ') + fr.unitText : ''}`, primary: !!r.primary };
    })
    : [{ label: steps[steps.length - 1].label, text: steps[steps.length - 1].r, primary: true }];
  const lastStep = { ...steps[steps.length - 1], final: true };
  // prefill (base values) so "Reopen in calculator" restores this exact calculation
  const prefill = {};
  for (const f of def.fields) {
    if (fieldType(f) !== 'number') prefill[f.name] = state.values[f.name];
    else if (v[f.name] !== null && v[f.name] !== undefined) {
      prefill[f.name] = v[f.name];
      if (f.choices || f.dim) prefill[f.name + 'Unit'] = state.units[f.name];
    }
  }
  // Summary cards show the main answer plus a couple of key supporting results:
  // the calculator's own `summary` list of result labels, else the first other result.
  if (summary) {
    const extra = def.summary || out.results.filter(r => !r.primary).slice(0, 1).map(r => r.label);
    for (const r of results) r.sum = !r.primary && extra.includes(r.label);
  }
  return {
    calcId: def.id, title: def.title, category: def.category, date: Date.now(),
    style: summary ? 'summary' : 'steps',
    // how this entry was made, so "Edit inputs" can rebuild it the same way
    pick: summary ? 'summary' : (all ? null : pick),
    subtitle: all ? '' : steps.map(s => s.label).join(' · '),
    given, steps: [...steps.slice(0, -1).map(s => ({ ...s, final: false })), lastStep], results, notes: all ? out.notes || [] : [], prefill,
  };
}
