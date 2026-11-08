import { n, step, fail } from './_h.js';
import { DIMS, PREF, convert, toBase, unitLabel } from '../units.js';

const GENERAL = Object.keys(DIMS).filter(d => !DIMS[d].crop);
const unitOpts = (dim, cur) => Object.keys(DIMS[dim].units).map(value => ({ value, label: unitLabel(dim, value, cur) }));

function factorText(dim, from, to, ctx) {
  if (dim === 'temperature') {
    const f = { 'F>C': '(°F − 32) × 5/9', 'C>F': '°C × 9/5 + 32', 'C>K': '°C + 273.15', 'K>C': 'K − 273.15', 'F>K': '(°F − 32) × 5/9 + 273.15', 'K>F': '(K − 273.15) × 9/5 + 32' };
    return f[`${from}>${to}`] || 'same unit';
  }
  return `× ${n(convert(dim, 1, from, to, ctx), 6)}`;
}

function allRows(dim, value, from, ctx) {
  return Object.keys(DIMS[dim].units).filter(u => u !== from).map(u => ({ label: unitLabel(dim, u, ctx.cur), value: convert(dim, value, from, u, ctx), unit: unitLabel(dim, u, ctx.cur) }));
}

export default [
  {
    id: 'unit-converter',
    title: 'Unit Converter',
    category: 'convert',
    desc: 'Length, area, volume, weight, speed, pressure, temperature and rates.',
    fields: [
      { name: 'dim', label: 'Type', type: 'select', def: 'mass', options: GENERAL.map(value => ({ value, label: DIMS[value].label })) },
      { name: 'value', label: 'Value', sym: 'x', unit: '', def: 1 },
      { name: 'from', label: 'From', type: 'select', def: 'lb', options: (v, ctx) => unitOpts(v.dim, ctx.cur), pick: (v, s) => PREF[v.dim]?.[s] || DIMS[v.dim].base },
      { name: 'to', label: 'To', type: 'select', def: 'kg', options: (v, ctx) => unitOpts(v.dim, ctx.cur), pick: (v, s) => PREF[v.dim]?.[s === 'us' ? 'metric' : 'us'] || Object.keys(DIMS[v.dim].units)[1] },
    ],
    compute(v, ctx) {
      const { dim, from, to, value } = v;
      if (!DIMS[dim].units[from] || !DIMS[dim].units[to]) return fail('Pick units.');
      const out = convert(dim, value, from, to, ctx);
      const fl = unitLabel(dim, from, ctx.cur), tl = unitLabel(dim, to, ctx.cur);
      return {
        results: [
          { label: `${n(value)} ${fl} =`, value: out, unit: tl, primary: true, decimals: Math.abs(out) < 1 ? 6 : undefined },
          ...allRows(dim, value, from, ctx).filter(r => r.label !== tl),
        ],
        work: [step(`${fl} to ${tl}`, dim === 'temperature' ? factorText(dim, from, to, ctx) : `x ${factorText(dim, from, to, ctx)}`, dim === 'temperature' ? `x = ${n(value)} ${fl}` : `${n(value)} ${factorText(dim, from, to, ctx)}`, `${n(out, Math.abs(out) < 1 ? 6 : undefined)} ${tl}`, true)],
      };
    },
  },

  {
    id: 'bushel-weight',
    title: 'Bushels to Weight',
    category: 'convert',
    desc: 'Bushels, pounds, tons and tonnes by crop test weight; also yields and prices.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'tw', label: 'Test weight', sym: 'tw', unit: 'lb/bu', def: 56, cropDefault: 'tw', help: 'Standard test weight for the crop; change it to use a measured test weight' },
      { name: 'mode', label: 'Convert', type: 'select', def: 'grain', options: [{ value: 'grain', label: 'Quantity (bu, lb, t)' }, { value: 'grainYield', label: 'Yield (bu/ac, t/ha)' }, { value: 'grainPrice', label: 'Price ($/bu, $/t)' }] },
      { name: 'value', label: 'Value', sym: 'x', unit: '', def: 1000 },
      { name: 'from', label: 'From', type: 'select', def: 'bu', options: (v, ctx) => unitOpts(v.mode, ctx.cur), pick: v => Object.keys(DIMS[v.mode].units)[0] },
    ],
    compute(v, ctx) {
      const dim = v.mode;
      if (!DIMS[dim].units[v.from]) return fail('Pick a unit.');
      if (!(ctx.tw > 0)) return fail('Test weight must be more than zero.');
      const rows = allRows(dim, v.value, v.from, ctx);
      const first = rows[0];
      const base = toBase(dim, v.value, v.from, ctx);
      const fl = unitLabel(dim, v.from, ctx.cur);
      return {
        results: [{ ...first, primary: true, label: `${n(v.value)} ${fl} =` }, ...rows.slice(1)],
        work: [step(`${fl} to ${first.unit}`, `x ${factorText(dim, v.from, Object.keys(DIMS[dim].units).find(u => unitLabel(dim, u, ctx.cur) === first.unit), ctx)}`, `${n(v.value)} ${fl} @ ${n(ctx.tw)} lb/bu`, `${n(first.value)} ${first.unit}`, true)],
        notes: [`Using ${n(ctx.tw)} lb per bushel.`, ...(dim === 'grain' ? [`= ${n(base)} lb`] : [])],
      };
    },
  },
];
