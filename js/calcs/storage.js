import { n, step, deg, fail, CONST } from './_h.js';

const crop = { name: 'crop', label: 'Crop', type: 'crop' };
const BU_PER_FT3 = CONST.BU_PER_FT3;   // 0.8036

// How manufacturers rate bin capacity (from their spec sheets):
//   Westeel: grain peaked at 30°, 5% compaction in the cylinder, 1.244 ft³/bu
//   Sukup:   grain peaked at 28°, 6% compaction (ASABE S413.1)
// Check: Westeel 2406 Wide-Corr (24 ft, 6 × 44" rings) is listed at 9,220 bu; this gives 9,240.
const RATING = {
  westeel: { angle: 30, pack: 5, name: 'Westeel rating' },
  sukup: { angle: 28, pack: 6, name: 'Sukup rating' },
};

export default [
  {
    id: 'bin-capacity',
    title: 'Bin Volume',
    category: 'storage',
    desc: 'Bushels in a round bin: level, peaked and hopper bottom.',
    fields: [
      crop,
      { name: 'dia', label: 'Bin diameter', sym: 'D', dim: 'length', unitSet: ['ft', 'm'], def: 30, defMetric: 9 },
      {
        name: 'h', label: 'Grain depth at sidewall', sym: 'H', dim: 'length', unitSet: ['ft', 'ring', 'm'], def: 20, defMetric: 6,
        help: 'Tap the unit to count sidewall rings instead',
      },
      // Sidewall sheet ("ring") height. Westeel Wide-Corr and Sukup use 44" sheets; older bins 32" or 30".
      {
        name: 'ringH', label: 'Ring height', type: 'select', def: '44', show: (v, u) => u.h === 'ring', options: [
          { value: '44', label: '44″ (Westeel Wide-Corr, Sukup, most current bins)', short: '44″' },
          { value: '32', label: '32″ (older narrow-corrugation bins, e.g. older GSI)', short: '32″' },
          { value: '30', label: '30″ (older Westeel, e.g. Westeel-Rosco 1406)', short: '30″' },
          { value: 'custom', label: 'Custom…' },
        ],
      },
      { name: 'ringCustom', label: 'Custom ring height', sym: 'Rh', unit: 'in', def: 39, show: (v, u) => u.h === 'ring' && v.ringH === 'custom' },
      // Rated capacity (like the manufacturer's spec sheet) or the grain as it actually sits.
      // Entries made before this option existed reopen "as measured" so their numbers don't change.
      {
        name: 'basis', label: 'Capacity basis', type: 'select', def: 'westeel', legacy: 'measured', options: [
          { value: 'westeel', label: 'Westeel rating (peaked 30°, 5% packed)', short: 'Westeel rating' },
          { value: 'sukup', label: 'Sukup rating (peaked 28°, 6% packed)', short: 'Sukup rating' },
          { value: 'measured', label: 'As measured (your own top & packing)', short: 'As measured' },
        ],
      },
      {
        name: 'top', label: 'Top of grain', type: 'select', def: 'level', show: v => v.basis === 'measured', options: [
          { value: 'level', label: 'Leveled' }, { value: 'peak', label: 'Peaked' }, { value: 'funnel', label: 'Inverted cone' },
        ],
      },
      {
        name: 'repose', label: 'Angle of repose', sym: 'θ', unit: '°', def: 23, cropDefault: 'repose', show: v => v.basis === 'measured' && v.top !== 'level',
        help: v => (v.top === 'funnel' ? 'Slope of the funnel left after unloading from the center' : 'Slope of the peak when filled from the center'),
      },
      { name: 'bottom', label: 'Bottom', type: 'select', def: 'flat', options: [{ value: 'flat', label: 'Flat floor' }, { value: 'hopper', label: 'Hopper cone' }] },
      { name: 'hopper', label: 'Hopper slope', sym: 'α', unit: '°', def: 45, show: v => v.bottom === 'hopper' },
      { name: 'pack', label: 'Packing', sym: 'k', unit: '%', def: 0, optional: true, show: v => v.basis === 'measured', help: 'Grain settles ~3–8% in a full bin (applied to the walls); 0 = loose fill' },
    ],
    compute(v, ctx) {
      const D = v.dia, H = v.h, r = D / 2;
      if (D <= 0) return fail('Enter a bin diameter.');
      // a manufacturer rating fixes the peak angle and packing; "as measured" uses yours
      const R = RATING[v.basis];
      const top = R ? 'peak' : v.top;
      const theta = R ? R.angle : v.repose;
      const packPct = R ? R.pack : (v.pack || 0);
      const base = Math.PI * r * r;
      const packF = 1 + packPct / 100;
      const ring = v.hUnit === 'ring';
      const ringFt = ctx.ringIn / 12, rings = H / ringFt;
      const tan = a => r * Math.tan(deg(a));
      const peakH = top === 'peak' ? tan(theta) : 0;
      const funH = top === 'funnel' ? tan(theta) : 0;
      const hopH = v.bottom === 'hopper' ? tan(v.hopper) : 0;
      if (funH > H) return fail(`The funnel would be ${n(funH)} ft deep, deeper than the ${n(H)} ft of grain at the wall. Check the depth or angle.`);
      // bushels = π r² × (wall height × packing + peak ÷ 3 + hopper ÷ 3 − funnel ÷ 3) × 0.8036
      const depth = H * packF + peakH / 3 + hopH / 3 - funH / 3;
      const bu = base * depth * BU_PER_FT3;
      const terms = [[(ring ? 'rings × Rh' : 'H') + (packF > 1 ? ' × k' : ''), (ring ? `${n(rings)} × ${n(ringFt, 3)}` : n(H)) + (packF > 1 ? ` × ${n(packF, 3)}` : ''), '+']];
      if (peakH) terms.push(['hp ÷ 3', `${n(peakH)} ÷ 3`, '+']);
      if (hopH) terms.push(['hh ÷ 3', `${n(hopH)} ÷ 3`, '+']);
      if (funH) terms.push(['hf ÷ 3', `${n(funH)} ÷ 3`, '−']);
      const join = k => terms.map((t, i) => (i ? ` ${t[2]} ` : '') + t[k]).join('');
      const wrap = x => (terms.length > 1 ? `(${x})` : x);
      const work = [step('Bushels', `π × r² × ${wrap(join(0))} × 0.8036`, `π × ${n(r)}² × ${wrap(join(1))} × 0.8036`, `${n(bu)} bu`, true)];
      const notes = [];
      if (ring) notes.push(`Rh = ${n(ctx.ringIn)}″ ring = ${n(ringFt, 3)} ft.`);
      if (packF > 1) notes.push(`k = ${n(packPct)}% packing in the walls.`);
      if (peakH) notes.push(`hp = peak height = r × tan ${n(theta)}° = ${n(peakH)} ft.`);
      if (hopH) notes.push(`hh = hopper depth = r × tan ${n(v.hopper)}° = ${n(hopH)} ft.`);
      if (funH) notes.push(`hf = funnel depth = r × tan ${n(theta)}° = ${n(funH)} ft.`);
      notes.push(R ? `${R.name}: grain peaked at ${R.angle}° with ${R.pack}% packing in the walls, as on the spec sheet. Pick “As measured” for what's actually in the bin.` : '1 bushel = 1.2445 ft³, so 1 ft³ = 0.8036 bu.');
      return {
        results: [{ label: 'Capacity', value: bu * ctx.tw, dim: 'grain', primary: true }],
        work,
        notes,
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
      let bu, work, h;
      if (v.shape === 'ridge') {
        const r = v.w / 2;
        if (v.len < v.w) return fail('Length must be at least the width for a ridge pile.');
        h = r * t;
        // a prism in the middle plus two half-cone ends (one whole cone)
        bu = h * (v.w * (v.len - v.w) / 2 + Math.PI * r * r / 3) * BU_PER_FT3;
        work = [step('Bushels', 'h × [W × (L − W) ÷ 2 + π × r² ÷ 3] × 0.8036', `${n(h)} × [${n(v.w)} × (${n(v.len)} − ${n(v.w)}) ÷ 2 + π × ${n(r)}² ÷ 3] × 0.8036`, `${n(bu)} bu`, true)];
      } else {
        const r = v.dia / 2;
        h = r * t;
        bu = Math.PI * r * r * h / 3 * BU_PER_FT3;
        work = [step('Bushels', 'π × r² × h ÷ 3 × 0.8036', `π × ${n(r)}² × ${n(h)} ÷ 3 × 0.8036`, `${n(bu)} bu`, true)];
      }
      return {
        results: [{ label: 'Pile capacity', value: bu * ctx.tw, dim: 'grain', primary: true }],
        work,
        notes: [`h = pile height = ${v.shape === 'ridge' ? 'W ÷ 2' : 'r'} × tan ${n(v.repose)}° = ${n(h)} ft.`],
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
        results: [{ label: 'Net grain', value: net, dim: 'grain', primary: true }],
        work: [step('Bushels', '(G − T) ÷ test wt', `(${n(v.gross)} − ${n(v.tare)}) ÷ ${n(ctx.tw)} lb/bu`, `${n(bu)} bu`, true)],
        links: [{ calc: 'moisture-shrink', label: 'Moisture shrink', values: { crop: v.crop, gross: net } }],
      };
    },
  },
];
