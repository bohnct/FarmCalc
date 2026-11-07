import { n, step, deg, fail, CONST } from './_h.js';

const crop = { name: 'crop', label: 'Crop', type: 'crop' };
const BU_PER_FT3 = CONST.BU_PER_FT3;   // 0.8036
const GAL_PER_FT3 = 7.48051948;

export default [
  {
    id: 'bin-capacity',
    title: 'Bin Volume',
    category: 'storage',
    desc: 'Bushels in a round bin: level, peaked and hopper bottom.',
    fields: [
      crop,
      { name: 'dia', label: 'Bin diameter', sym: 'D', dim: 'length', unitSet: ['ft', 'm'], def: 30, defMetric: 9 },
      { name: 'h', label: 'Grain depth at sidewall', sym: 'H', dim: 'length', unitSet: ['ft', 'm'], def: 20, defMetric: 6 },
      {
        name: 'top', label: 'Top of grain', type: 'select', def: 'level', options: [
          { value: 'level', label: 'Leveled' }, { value: 'peak', label: 'Peaked' }, { value: 'funnel', label: 'Inverted cone' },
        ],
      },
      {
        name: 'repose', label: 'Angle of repose', sym: 'θ', unit: '°', def: 23, cropDefault: 'repose', show: v => v.top !== 'level',
        help: v => (v.top === 'funnel' ? 'Slope of the funnel left after unloading from the center' : 'Slope of the peak when filled from the center'),
      },
      { name: 'bottom', label: 'Bottom', type: 'select', def: 'flat', options: [{ value: 'flat', label: 'Flat floor' }, { value: 'hopper', label: 'Hopper cone' }] },
      { name: 'hopper', label: 'Hopper slope', sym: 'α', unit: '°', def: 45, show: v => v.bottom === 'hopper' },
      { name: 'pack', label: 'Packing', sym: 'k', unit: '%', def: 0, optional: true, help: 'Grain settles ~3–8% in a full bin; 0 = loose fill' },
    ],
    compute(v, ctx) {
      const D = v.dia, H = v.h, r = D / 2;
      if (D <= 0) return fail('Enter a bin diameter.');
      const base = Math.PI * r * r;
      const cyl = base * H;
      let peakH = 0, peak = 0, hopH = 0, hop = 0, funH = 0, funnel = 0;
      const work = [
        step('Floor area', 'π × r²', `3.1416 × ${n(r)}²`, `${n(base)} ft²`),
        step('Cylinder', 'area × H', `${n(base)} × ${n(H)}`, `${n(cyl)} ft³`),
      ];
      if (v.top === 'peak') {
        peakH = r * Math.tan(deg(v.repose));
        peak = base * peakH / 3;
        work.push(step('Peak cone', 'area × (r × tan θ) ÷ 3', `${n(base)} × ${n(peakH)} ÷ 3`, `${n(peak)} ft³`));
      }
      if (v.top === 'funnel') {
        // grain pulled from the center leaves an upside-down cone: subtract it
        funH = r * Math.tan(deg(v.repose));
        if (funH > H) return fail(`The funnel would be ${n(funH)} ft deep, deeper than the ${n(H)} ft of grain at the wall. Check the depth or angle.`);
        funnel = base * funH / 3;
        work.push(step('Funnel (inverted cone)', 'area × (r × tan θ) ÷ 3', `${n(base)} × ${n(funH)} ÷ 3`, `${n(funnel)} ft³`));
      }
      if (v.bottom === 'hopper') {
        hopH = r * Math.tan(deg(v.hopper));
        hop = base * hopH / 3;
        work.push(step('Hopper cone', 'area × (r × tan α) ÷ 3', `${n(base)} × ${n(hopH)} ÷ 3`, `${n(hop)} ft³`));
      }
      const ft3 = cyl + peak + hop - funnel;
      const packF = 1 + (v.pack || 0) / 100;
      const bu = ft3 * BU_PER_FT3 * packF;
      // "cyl + peak + hopper − funnel", written out with whichever parts apply
      const parts = [['cyl', cyl, '+'], ['peak', peak, '+'], ['hopper', hop, '+'], ['funnel', funnel, '−']].filter(p => p[1]);
      if (parts.length > 1) {
        const f = parts.map((p, i) => (i ? ` ${p[2]} ` : '') + p[0]).join('');
        const s = parts.map((p, i) => (i ? ` ${p[2]} ` : '') + n(p[1])).join('');
        work.push(step('Total volume', f, s, `${n(ft3)} ft³`));
      }
      work.push(step('Bushels', packF > 1 ? 'ft³ × 0.8036 × (1 + k)' : 'ft³ × 0.8036', packF > 1 ? `${n(ft3)} × 0.8036 × ${n(packF, 3)}` : `${n(ft3)} × 0.8036`, `${n(bu)} bu`, true));
      return {
        results: [
          { label: 'Capacity', value: bu * ctx.tw, dim: 'grain', primary: true },
          { label: 'Volume', value: ft3 * GAL_PER_FT3, dim: 'volume', units: { us: 'ft3', metric: 'm3' }, unitSet: ['ft3', 'm3'] },
          { label: 'Per foot of depth', value: base * BU_PER_FT3 * packF, unit: 'bu/ft' },
          ...(peak ? [{ label: 'Peak height', value: peakH, dim: 'length', unitSet: ['ft', 'm'] }] : []),
          ...(funnel ? [{ label: 'Funnel depth', value: funH, dim: 'length', unitSet: ['ft', 'm'] }, { label: 'Grain removed by funnel', value: funnel * BU_PER_FT3 * packF * ctx.tw, dim: 'grain' }] : []),
          ...(hop ? [{ label: 'Hopper depth', value: hopH, dim: 'length', unitSet: ['ft', 'm'] }] : []),
          { label: 'Weight', value: bu * ctx.tw, dim: 'mass', units: { us: 'ton', metric: 't' } },
        ],
        work,
        notes: ['1 bushel = 1.2445 ft³, so 1 ft³ = 0.8036 bu.'],
        links: [{ calc: 'grain-drying', label: 'Grain drying', values: { crop: v.crop, wet: bu * ctx.tw } }],
      };
    },
  },

  {
    id: 'grain-pile',
    title: 'Grain Pile Volume',
    category: 'storage',
    desc: 'Bushels in a cone pile or a long ridge pile on the ground.',
    fields: [
      crop,
      { name: 'shape', label: 'Pile shape', type: 'select', def: 'cone', options: [{ value: 'cone', label: 'Cone (round)' }, { value: 'ridge', label: 'Ridge (long)' }] },
      { name: 'dia', label: 'Base diameter', sym: 'D', dim: 'length', unitSet: ['ft', 'm'], def: 60, defMetric: 18, show: v => v.shape === 'cone' },
      { name: 'w', label: 'Base width', sym: 'W', dim: 'length', unitSet: ['ft', 'm'], def: 60, defMetric: 18, show: v => v.shape === 'ridge' },
      { name: 'len', label: 'Total length', sym: 'L', dim: 'length', unitSet: ['ft', 'm'], def: 200, defMetric: 60, show: v => v.shape === 'ridge' },
      { name: 'repose', label: 'Angle of repose', sym: 'θ', unit: '°', def: 23, cropDefault: 'repose' },
    ],
    compute(v, ctx) {
      const t = Math.tan(deg(v.repose));
      let ft3, h, work;
      if (v.shape === 'ridge') {
        const r = v.w / 2;
        if (v.len < v.w) return fail('Length must be at least the width for a ridge pile.');
        h = r * t;
        const mid = (v.w * h / 2) * (v.len - v.w);
        const ends = Math.PI * r * r * h / 3;
        ft3 = mid + ends;
        work = [
          step('Height', '(W ÷ 2) × tan θ', `${n(r)} × tan ${n(v.repose)}°`, `${n(h)} ft`),
          step('Middle (prism)', '(W × h ÷ 2) × (L − W)', `(${n(v.w)} × ${n(h)} ÷ 2) × (${n(v.len)} − ${n(v.w)})`, `${n(mid)} ft³`),
          step('Two half-cone ends', 'π × r² × h ÷ 3', `3.1416 × ${n(r)}² × ${n(h)} ÷ 3`, `${n(ends)} ft³`),
          step('Bushels', '(prism + ends) × 0.8036', `${n(ft3)} × 0.8036`, `${n(ft3 * BU_PER_FT3)} bu`, true),
        ];
      } else {
        const r = v.dia / 2;
        h = r * t;
        ft3 = Math.PI * r * r * h / 3;
        work = [
          step('Height', 'r × tan θ', `${n(r)} × tan ${n(v.repose)}°`, `${n(h)} ft`),
          step('Cone volume', 'π × r² × h ÷ 3', `3.1416 × ${n(r)}² × ${n(h)} ÷ 3`, `${n(ft3)} ft³`),
          step('Bushels', 'ft³ × 0.8036', `${n(ft3)} × 0.8036`, `${n(ft3 * BU_PER_FT3)} bu`, true),
        ];
      }
      const bu = ft3 * BU_PER_FT3;
      return {
        results: [
          { label: 'Pile capacity', value: bu * ctx.tw, dim: 'grain', primary: true },
          { label: 'Pile height', value: h, dim: 'length', unitSet: ['ft', 'm'] },
          { label: 'Volume', value: ft3 * GAL_PER_FT3, dim: 'volume', units: { us: 'ft3', metric: 'm3' }, unitSet: ['ft3', 'm3'] },
          { label: 'Weight', value: bu * ctx.tw, dim: 'mass', units: { us: 'ton', metric: 't' } },
        ],
        work,
      };
    },
  },

  {
    id: 'truck-load',
    title: 'Truck / Wagon Load',
    category: 'storage',
    desc: 'Scale ticket weights to net bushels and tons.',
    fields: [
      crop,
      { name: 'gross', label: 'Gross weight', sym: 'G', dim: 'mass', def: 80000, defMetric: 36000 },
      { name: 'tare', label: 'Tare (empty) weight', sym: 'T', dim: 'mass', def: 30000, defMetric: 13600 },
    ],
    compute(v, ctx) {
      const net = v.gross - v.tare;
      if (net <= 0) return fail('Gross weight must be more than tare weight.');
      const bu = net / ctx.tw;
      return {
        results: [
          { label: 'Net grain', value: net, dim: 'grain', primary: true },
          { label: 'Net weight', value: net, dim: 'mass' },
          { label: 'Net tons', value: net, dim: 'mass', units: { us: 'ton', metric: 't' } },
        ],
        work: [
          step('Net weight', 'G − T', `${n(v.gross)} − ${n(v.tare)}`, `${n(net)} lb`),
          step('Bushels', 'net ÷ test wt', `${n(net)} ÷ ${n(ctx.tw)} lb/bu`, `${n(bu)} bu`, true),
        ],
        links: [{ calc: 'moisture-shrink', label: 'Moisture shrink', values: { crop: v.crop, gross: net } }],
      };
    },
  },
];
