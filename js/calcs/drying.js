import { n, step, pctStr, fail } from './_h.js';

const crop = { name: 'crop', label: 'Crop', type: 'crop' };

export default [
  {
    id: 'grain-drying',
    title: 'Grain Drying',
    category: 'drying',
    desc: 'Dry bushels left after drying wet grain down.',
    fields: [
      crop,
      { name: 'wet', label: 'Wet grain', sym: 'W', dim: 'grain', def: 1000, help: 'Wet bushels = wet weight ÷ test weight' },
      { name: 'mi', label: 'Initial moisture', sym: 'Mi', unit: '%', def: 18, cropDefault: 'harvest' },
      { name: 'mf', label: 'Final moisture', sym: 'Mf', unit: '%', def: 13.5, cropDefault: 'moist' },
      { name: 'loss', label: 'Handling loss', sym: 'L', unit: '%', def: 0.5, optional: true, help: 'Invisible shrink (fines, dust): 0.5–1%' },
    ],
    compute(v, ctx) {
      const { mi, mf } = v;
      if (mf >= 100 || mi >= 100) return fail('Moisture must be below 100%.');
      if (mi <= mf) return fail('Initial moisture must be higher than final moisture.');
      const wetBu = v.wet / ctx.tw;
      const L = (v.loss || 0) / 100;
      // dry = W × (100 − Mi) ÷ (100 − Mf), less the handling loss (a share of the wet grain)
      const dryBu = wetBu * ((100 - mi) / (100 - mf) - L);
      const work = [L
        ? step('Dry bushels', 'W × [(100 − Mi) ÷ (100 − Mf) − L]', `${n(wetBu)} bu × [(100 − ${n(mi)}) ÷ (100 − ${n(mf)}) − ${n(L * 100)}%]`, `${n(dryBu)} bu`, true)
        : step('Dry bushels', 'W × (100 − Mi) ÷ (100 − Mf)', `${n(wetBu)} bu × (100 − ${n(mi)}) ÷ (100 − ${n(mf)})`, `${n(dryBu)} bu`, true)];
      return {
        results: [{ label: 'Dry grain', value: dryBu * ctx.tw, dim: 'grain', primary: true }],
        work,
        notes: [`Water shrink at ${n(mf)}% = 100 ÷ (100 − ${n(mf)}) = ${pctStr(100 / (100 - mf), 3)} per point.`],
      };
    },
  },

  {
    id: 'moisture-shrink',
    title: 'Moisture Shrink',
    category: 'drying',
    desc: 'Bushels you get paid for after the elevator’s moisture shrink.',
    fields: [
      crop,
      { name: 'gross', label: 'Delivered (wet)', sym: 'G', dim: 'grain', def: 1000 },
      { name: 'moist', label: 'Moisture', sym: 'M', unit: '%', def: 18, cropDefault: 'harvest' },
      { name: 'base', label: 'Base moisture', sym: 'Mb', unit: '%', def: 15.5, cropDefault: 'moist' },
      { name: 'factor', label: 'Shrink per point', sym: 'S', unit: '%', def: 1.4, help: 'Elevator shrink factor, often 1.3–1.5%' },
    ],
    compute(v, ctx) {
      const gBu = v.gross / ctx.tw;
      const pts = Math.max(0, v.moist - v.base);
      const netBu = gBu * (1 - pts * v.factor / 100);
      const work = [pts > 0
        ? step('Net bushels', 'G × [1 − (M − Mb) × S]', `${n(gBu)} × [1 − (${n(v.moist)} − ${n(v.base)}) × ${n(v.factor)}%]`, `${n(netBu)} bu`, true)
        : step('Net bushels', 'G (at or below base moisture)', `${n(gBu)}`, `${n(netBu)} bu`, true)];
      return {
        results: [{ label: 'Net (paid) grain', value: netBu * ctx.tw, dim: 'grain', primary: true }],
        work,
        notes: pts > 0 ? [] : ['Grain is at or below base moisture; no shrink.'],
        links: [{ calc: 'grain-drying', label: 'Dry it yourself', values: { crop: v.crop, wet: v.gross, mi: v.moist, mf: v.base } }],
      };
    },
  },
];
