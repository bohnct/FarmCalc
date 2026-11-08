import { n, step, fail } from './_h.js';

const rowWidth = def => ({ name: 'rw', label: 'Row width', sym: 'R', dim: 'length', units: { us: 'in', metric: 'cm' }, unitSet: ['in', 'cm'], def, defMetric: Math.round(def * 2.54), defSk: 10 });   // prairie drills ≈ 10"
const FT_M = ['ft', 'm'];

// 1 lb = 453.592 g, so seeds per lb = 453,592 ÷ thousand-seed weight (g)
const G_PER_LB = 453.592;

export default [
  {
    id: 'canola-yield',
    title: 'Canola Yield Estimate',
    category: 'yield',
    crop: 'canola',
    desc: 'Estimate from plant, pod and seed counts and seed size.',
    fields: [
      { name: 'plants', label: 'Plants per area', sym: 'P', dim: 'countRate', units: { us: 'pft2', metric: 'pm2' }, unitSet: ['pft2', 'pm2'], def: 6, defMetric: 65, help: 'Count plants in a 1 ft² square (or a hoop) in several spots' },
      { name: 'pods', label: 'Pods per plant', sym: 'Po', unit: 'pods', def: 60, help: 'Count pods on 10 plants and average' },
      { name: 'spp', label: 'Seeds per pod', sym: 'Sp', unit: 'seeds', def: 18, help: 'Typically 15–25' },
      { name: 'tsw', label: 'Thousand-seed weight', sym: 'TSW', unit: 'g', def: 4.5, help: 'Grams per 1,000 seeds: 3.5 small · 4.5 avg · 5.5+ large' },
      { name: 'loss', label: 'Pod shatter / harvest loss', sym: 'L', unit: '%', def: 0, optional: true },
    ],
    compute(v, ctx) {
      if (!(v.tsw > 0)) return fail('Thousand-seed weight must be more than zero.');
      const pFt2 = v.plants / 43560;               // base is plants per acre
      const L = (v.loss || 0) / 100;
      // lb/ac = seeds per ft² × 43,560 ft² × grams per seed ÷ 453.592 g/lb
      const lbAc = pFt2 * v.pods * v.spp * v.tsw / 1000 * 43560 / G_PER_LB * (1 - L);
      const bu = lbAc / ctx.tw;
      const f = 'P × Po × Sp × TSW × 43,560 ÷ 453,592' + (L ? ' × (1 − L)' : '') + ' ÷ test wt';
      const sub = `${n(pFt2, 2)} × ${n(v.pods)} × ${n(v.spp)} × ${n(v.tsw, 2)} × 43,560 ÷ 453,592` + (L ? ` × (1 − ${n(L * 100)}%)` : '') + ` ÷ ${n(ctx.tw)}`;
      return {
        results: [{ label: 'Estimated yield', value: lbAc, dim: 'grainYield', primary: true }],
        work: [step('Yield', f, sub, `${n(bu, 1)} bu/ac`, true)],
        notes: ['Count several spots and average. Pre-harvest estimates often run high; a 5–15% loss allowance is common.'],
      };
    },
  },

  {
    id: 'wheat-yield',
    title: 'Wheat Yield Estimate',
    category: 'yield',
    crop: 'wheat',
    desc: 'Estimate from head counts and kernels per head.',
    fields: [
      rowWidth(7.5),
      { name: 'len', label: 'Length of row counted', sym: 'L', dim: 'length', unitSet: ['ft', 'in', 'm', 'cm'], def: 3, defMetric: 1 },
      { name: 'heads', label: 'Heads counted', sym: 'H', unit: 'heads', def: 110 },
      { name: 'kph', label: 'Kernels per head', sym: 'Kh', unit: 'kernels', def: 25 },
      { name: 'kpl', label: 'Kernels per lb', sym: 'Kl', unit: 'k/lb', def: 14000, help: '12,000 plump · 14,000 avg · 16,000+ shriveled' },
    ],
    compute(v, ctx) {
      const area = v.len * v.rw;
      if (area <= 0) return fail('Enter a row width and length.');
      const lb = v.heads / area * 43560 * v.kph / v.kpl;
      const bu = lb / ctx.tw;
      return {
        results: [{ label: 'Estimated yield', value: lb, dim: 'grainYield', primary: true }],
        work: [step('Yield', 'H ÷ (L × R) × 43,560 × Kh ÷ Kl ÷ test wt', `${n(v.heads)} ÷ (${n(v.len)} ft × ${n(v.rw, 3)} ft) × 43,560 × ${n(v.kph)} ÷ ${n(v.kpl)} ÷ ${n(ctx.tw)}`, `${n(bu, 1)} bu/ac`, true)],
      };
    },
  },

  {
    id: 'combine-check',
    title: 'Harvest Yield Check',
    category: 'yield',
    desc: 'Scale or cart weight plus moisture to dry bushels per acre.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'wt', label: 'Harvested weight (wet)', sym: 'W', dim: 'mass', def: 15000, defMetric: 6800 },
      { name: 'moist', label: 'Harvest moisture', sym: 'M', unit: '%', def: 18 },
      { name: 'std', label: 'Standard moisture', sym: 'Ms', unit: '%', def: 15.5, cropDefault: 'moist' },
      { name: 'method', label: 'Area from', type: 'select', def: 'area', options: [{ value: 'area', label: 'Acres harvested' }, { value: 'strip', label: 'Strip length × width' }] },
      { name: 'area', label: 'Area harvested', sym: 'A', dim: 'area', def: 2, defMetric: 1, show: v => v.method === 'area' },
      { name: 'len', label: 'Strip length', sym: 'L', dim: 'length', unitSet: ['ft', 'yd', 'm'], def: 1000, defMetric: 300, show: v => v.method === 'strip' },
      { name: 'w', label: 'Header / strip width', sym: 'Wh', dim: 'length', unitSet: FT_M, def: 30, defMetric: 9, show: v => v.method === 'strip' },
    ],
    compute(v, ctx) {
      if (v.std >= 100 || v.moist >= 100) return fail('Moisture must be below 100%.');
      const area = v.method === 'strip' ? v.len * v.w / 43560 : v.area;
      if (!(area > 0)) return fail('Area must be more than zero.');
      const yld = v.wt * (100 - v.moist) / (100 - v.std) / ctx.tw / area;
      const strip = v.method === 'strip';
      const A = strip ? '(L × Wh ÷ 43,560)' : 'A', As = strip ? `(${n(v.len)} × ${n(v.w)} ÷ 43,560)` : `${n(area, 3)} ac`;
      return {
        results: [{ label: 'Dry yield', value: yld * ctx.tw, dim: 'grainYield', primary: true }],
        work: [step('Yield', `W × (100 − M) ÷ (100 − Ms) ÷ test wt ÷ ${A}`, `${n(v.wt)} lb × (100 − ${n(v.moist)}) ÷ (100 − ${n(v.std)}) ÷ ${n(ctx.tw)} ÷ ${As}`, `${n(yld, 1)} bu/ac`, true)],
      };
    },
  },
];
