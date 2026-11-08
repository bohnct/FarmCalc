import { n, step, fail } from './_h.js';
// Typical rated flow of gas trash pumps by outlet size (US gpm, near zero lift).
// From manufacturer listings: 2" ≈ 140–210, 3" ≈ 225–400, 4" ≈ 500, 6" ≈ 1,000–1,300.
// We use the middle of each range and interpolate; outside 2–6" flow scales ≈ size^1.7.
const PUMP_GPM = [[2, 160], [3, 300], [4, 500], [6, 1100]];
export function pumpGpmFromOutlet(inches) {
  const d = inches, t = PUMP_GPM;
  if (!(d > 0)) return NaN;
  if (d <= t[0][0]) return t[0][1] * Math.pow(d / t[0][0], 1.7);
  if (d >= t[t.length - 1][0]) return t[t.length - 1][1] * Math.pow(d / t[t.length - 1][0], 1.7);
  for (let i = 1; i < t.length; i++) {
    if (d <= t[i][0]) { const [d0, q0] = t[i - 1], [d1, q1] = t[i]; return q0 + (q1 - q0) * (d - d0) / (d1 - d0); }
  }
  return NaN;
}
// Slough shapes: water volume = surface area × deepest depth × factor
//   saucer: gentle slopes, deep only in the middle (a cone, 1/3)
//   bowl:   typical slough (a rounded bowl, 1/2)
//   flat:   steep banks, flat bottom (about 0.8)
const SHAPES = { saucer: 1 / 3, bowl: 0.5, flat: 0.8 };


export default [
  {
    id: 'field-productivity',
    summary: [],   // the inputs and the one answer are the whole calc
    title: 'Field Productivity',
    category: 'fieldops',
    desc: 'Acres per hour from implement width, speed and field efficiency.',
    fields: [
      { name: 'w', label: 'Implement width', sym: 'W', dim: 'length', unitSet: ['ft', 'm'], def: 40, defMetric: 12 },
      { name: 'speed', label: 'Ground speed', sym: 'S', dim: 'speed', def: 6, defMetric: 10, defSk: 9 },
      { name: 'eff', label: 'Field efficiency', sym: 'E', unit: '%', def: 75, help: 'Tillage 80–90% · Planting 60–75% · Spraying 55–70% · Combine 65–80%' },
    ],
    compute(v) {
      if (v.eff <= 0 || v.eff > 100) return fail('Efficiency should be between 1 and 100%.');
      const eff = v.w * v.speed * (v.eff / 100) / 8.25;
      const results = [{ label: 'Productivity', value: eff, dim: 'areaRate', primary: true }];
      const work = [
        step('Productivity', 'W × S × E ÷ 8.25', `${n(v.w)} ft × ${n(v.speed)} mph × ${n(v.eff)}% ÷ 8.25`, `${n(eff)} ac/hr`, true),
      ];
      return {
        results, work,
        notes: ['8.25 = 43,560 ft²/ac ÷ 5,280 ft/mi.'],
      };
    },
  },

  {
    id: 'speedometer',
    title: 'Speedometer',
    category: 'fieldops',
    desc: 'Your real ground speed from the phone’s GPS. Tap the unit to change it.',
    widget: 'gps',     // the whole page is the live GPS readout (js/speedo.js)
    toolOnly: true,    // no inputs, results or notebook entry
    fields: [],
    compute() { return { results: [], work: [] }; },
  },

  {
    id: 'slough-pumping',
    title: 'Slough Pumping',
    category: 'fieldops',
    desc: 'How much water is in a slough and how many hours your pump needs to drain it.',
    fields: [
      { name: 'mode', label: 'Slough size from', type: 'select', def: 'dims', options: [{ value: 'dims', label: 'Length × width' }, { value: 'area', label: 'Acres' }] },
      { name: 'len', label: 'Length (water edge)', sym: 'L', dim: 'length', unitSet: ['ft', 'yd', 'm'], def: 300, defMetric: 90, show: v => v.mode === 'dims', help: 'Pace it off: 1 long pace ≈ 3 ft' },
      { name: 'wid', label: 'Width (water edge)', sym: 'W', dim: 'length', unitSet: ['ft', 'yd', 'm'], def: 150, defMetric: 45, show: v => v.mode === 'dims' },
      { name: 'area', label: 'Water area', sym: 'A', dim: 'area', def: 1, defMetric: 0.4, show: v => v.mode === 'area', help: 'From a field map or GPS' },
      { name: 'depth', label: 'Depth at deepest point', sym: 'D', dim: 'length', unitSet: ['ft', 'in', 'm'], def: 3, defMetric: 1 },
      {
        name: 'shape', label: 'Shape', type: 'select', def: 'bowl', help: 'Saucer: deep only in the middle · Bowl: most sloughs · Flat: steep banks',
        options: [{ value: 'saucer', label: 'Saucer' }, { value: 'bowl', label: 'Bowl' }, { value: 'flat', label: 'Flat bottom' }],
      },
      { name: 'outlet', label: 'Pump outlet size', sym: 'Ø', unit: 'in', def: 3, help: v => (v.outlet > 0 ? `Typical rating ≈ ${n(pumpGpmFromOutlet(v.outlet), 0)} US gpm (${n(pumpGpmFromOutlet(v.outlet) * 60, 0)} gph)` : 'Discharge size, e.g. 2, 3, 4 or 6') },
      { name: 'rated', label: 'Rated flow (if known)', sym: 'Q', dim: 'flow', unitSet: ['gpm', 'gph', 'lpm'], def: null, optional: true, help: 'From the pump plate or manual; leave blank to estimate from outlet size' },
      { name: 'eff', label: 'Real-world flow', sym: 'E', unit: '%', def: 65, help: 'Lift, hose length and debris cut flow; 50–80% of rating is typical' },
    ],
    compute(v) {
      const factor = SHAPES[v.shape] || 0.5;
      const ft2 = v.mode === 'area' ? v.area * 43560 : Math.PI / 4 * v.len * v.wid;
      if (!(ft2 > 0) || !(v.depth > 0)) return fail('Enter the slough size and depth.');
      const gal = ft2 * v.depth * factor * 7.48051948;
      const ratedGpm = v.rated || pumpGpmFromOutlet(v.outlet);
      if (!(ratedGpm > 0)) return fail('Enter the pump outlet size or its rated flow.');
      if (!(v.eff > 0)) return fail('Real-world flow must be more than 0%.');
      const hours = gal / (ratedGpm * 60 * v.eff / 100);
      const fac = v.shape === 'saucer' ? '⅓' : v.shape === 'flat' ? '0.8' : '½';
      const area = v.mode === 'area' ? ['A × 43,560', `${n(v.area, 2)} × 43,560`] : ['π ÷ 4 × L × W', `π ÷ 4 × ${n(v.len)} × ${n(v.wid)}`];
      return {
        results: [{ label: 'Time to pump', value: hours, unit: 'hr', decimals: 1, primary: true }],
        work: [step('Time to pump', `${area[0]} × D × ${fac} × 7.48 ÷ (Q × 60 × E)`, `${area[1]} × ${n(v.depth, 2)} × ${fac} × 7.48 ÷ (${n(ratedGpm, 0)} × 60 × ${n(v.eff)}%)`, `${n(hours, 1)} hr`, true)],
        notes: [
          `${fac} = ${v.shape === 'flat' ? 'flat bottom' : v.shape} shape; 7.48 US gal per ft³.${v.rated ? '' : ` Q ≈ ${n(ratedGpm, 0)} gpm for a ${n(v.outlet)}″ pump.`}`,
          'Real flow drops with more lift and longer hose.',
        ],
      };
    },
  },
];
