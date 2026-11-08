import { n, step, fail } from './_h.js';
const FIELD_LEN = ['ft', 'yd', 'rod', 'mi', 'm', 'km'];
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
    summary: ['Per day'],   // supporting results on a notebook summary card
    title: 'Field Productivity',
    category: 'fieldops',
    desc: 'Acres per hour from implement width, speed and field efficiency.',
    fields: [
      { name: 'w', label: 'Implement width', sym: 'W', dim: 'length', unitSet: ['ft', 'm'], def: 40, defMetric: 12 },
      { name: 'speed', label: 'Ground speed', sym: 'S', dim: 'speed', def: 6, defMetric: 10, defSk: 9 },
      { name: 'eff', label: 'Field efficiency', sym: 'E', unit: '%', def: 75, help: 'Tillage 80–90% · Planting 60–75% · Spraying 55–70% · Combine 65–80%' },
      { name: 'hours', label: 'Hours per day', sym: 'h', unit: 'hr', def: 10, optional: true },
    ],
    compute(v) {
      if (v.eff <= 0 || v.eff > 100) return fail('Efficiency should be between 1 and 100%.');
      const theo = v.w * v.speed / 8.25;
      const eff = theo * v.eff / 100;
      const results = [
        { label: 'Effective capacity', value: eff, dim: 'areaRate', primary: true },
        { label: 'Theoretical capacity', value: theo, dim: 'areaRate' },
      ];
      const work = [
        step('Theoretical', 'W × S ÷ 8.25', `${n(v.w)} ft × ${n(v.speed)} mph ÷ 8.25`, `${n(theo)} ac/hr`),
        step('Effective', 'theoretical × E', `${n(theo)} × ${n(v.eff)}%`, `${n(eff)} ac/hr`, !v.hours),
      ];
      if (v.hours) {
        results.push({ label: 'Per day', value: eff * v.hours, dim: 'area' });
        work.push(step('Per day', 'effective × h', `${n(eff)} × ${n(v.hours)} hr`, `${n(eff * v.hours)} ac`, true));
      }
      return {
        results, work,
        notes: ['8.25 = 43,560 ft²/ac ÷ 5,280 ft/mi.'],
        links: [{ calc: 'time-to-finish', label: 'Time to finish', values: { cap: eff, hpd: v.hours || 10 } }],
      };
    },
  },

  {
    id: 'field-area',
    title: 'Field Area',
    category: 'fieldops',
    desc: 'Acres for rectangles, triangles, trapezoids and center pivots.',
    fields: [
      {
        name: 'shape', label: 'Shape', type: 'select', def: 'rect', options: [
          { value: 'rect', label: 'Rectangle' }, { value: 'tri', label: 'Triangle (3 sides)' },
          { value: 'trap', label: 'Trapezoid' }, { value: 'pivot', label: 'Center pivot / circle' },
        ],
      },
      { name: 'l', label: 'Length', sym: 'L', dim: 'length', unitSet: FIELD_LEN, def: 2640, defMetric: 800, show: v => v.shape === 'rect' },
      { name: 'w', label: 'Width', sym: 'W', dim: 'length', unitSet: FIELD_LEN, def: 1320, defMetric: 400, show: v => v.shape === 'rect' },
      { name: 'a', label: 'Side a', sym: 'a', dim: 'length', unitSet: FIELD_LEN, def: 1320, defMetric: 400, show: v => v.shape === 'tri' },
      { name: 'b', label: 'Side b', sym: 'b', dim: 'length', unitSet: FIELD_LEN, def: 1320, defMetric: 400, show: v => v.shape === 'tri' },
      { name: 'c', label: 'Side c', sym: 'c', dim: 'length', unitSet: FIELD_LEN, def: 1867, defMetric: 566, show: v => v.shape === 'tri' },
      { name: 't1', label: 'Parallel side 1', sym: 'a', dim: 'length', unitSet: FIELD_LEN, def: 1320, defMetric: 400, show: v => v.shape === 'trap' },
      { name: 't2', label: 'Parallel side 2', sym: 'b', dim: 'length', unitSet: FIELD_LEN, def: 900, defMetric: 270, show: v => v.shape === 'trap' },
      { name: 'th', label: 'Distance between', sym: 'h', dim: 'length', unitSet: FIELD_LEN, def: 1320, defMetric: 400, show: v => v.shape === 'trap' },
      { name: 'r', label: 'Radius (pivot length)', sym: 'r', dim: 'length', unitSet: FIELD_LEN, def: 1300, defMetric: 400, show: v => v.shape === 'pivot' },
      { name: 'arc', label: 'Sweep', sym: '∠', unit: '°', def: 360, show: v => v.shape === 'pivot', help: '360° full circle, 180° half pivot' },
    ],
    compute(v) {
      let ft2, work;
      if (v.shape === 'rect') {
        ft2 = v.l * v.w;
        work = [step('Area', 'L × W', `${n(v.l)} × ${n(v.w)}`, `${n(ft2)} ft²`)];
      } else if (v.shape === 'tri') {
        const s = (v.a + v.b + v.c) / 2;
        const q = s * (s - v.a) * (s - v.b) * (s - v.c);
        if (q <= 0) return fail('Those three sides can’t form a triangle.');
        ft2 = Math.sqrt(q);
        work = [
          step('Half perimeter', '(a + b + c) ÷ 2', `(${n(v.a)} + ${n(v.b)} + ${n(v.c)}) ÷ 2`, `${n(s)}`),
          step('Area (Heron)', '√(s(s−a)(s−b)(s−c))', `√(${n(s)} × ${n(s - v.a)} × ${n(s - v.b)} × ${n(s - v.c)})`, `${n(ft2)} ft²`),
        ];
      } else if (v.shape === 'trap') {
        ft2 = (v.t1 + v.t2) / 2 * v.th;
        work = [step('Area', '(a + b) ÷ 2 × h', `(${n(v.t1)} + ${n(v.t2)}) ÷ 2 × ${n(v.th)}`, `${n(ft2)} ft²`)];
      } else {
        const frac = Math.min(360, Math.max(0, v.arc)) / 360;
        ft2 = Math.PI * v.r * v.r * frac;
        work = [step('Area', frac < 1 ? 'π × r² × (∠ ÷ 360)' : 'π × r²', frac < 1 ? `3.1416 × ${n(v.r)}² × ${n(frac, 3)}` : `3.1416 × ${n(v.r)}²`, `${n(ft2)} ft²`)];
      }
      const ac = ft2 / 43560;
      work.push(step('Acres', 'ft² ÷ 43,560', `${n(ft2)} ÷ 43,560`, `${n(ac)} ac`, true));
      const results = [
        { label: 'Area', value: ac, dim: 'area', primary: true },
        { label: 'Square feet', value: ac, dim: 'area', units: { us: 'ft2', metric: 'm2' }, unitSet: ['ft2', 'm2'] },
      ];
      if (v.shape === 'pivot' && v.arc >= 360) {
        const square = (2 * v.r) ** 2 / 43560;
        results.push({ label: 'Corners (square − circle)', value: square - ac, dim: 'area' });
      }
      return { results, work };
    },
  },

  {
    id: 'time-to-finish',
    summary: ['As hours & minutes', 'Working days'],   // supporting results on a notebook summary card
    title: 'Time to Finish',
    category: 'fieldops',
    desc: 'Hours and days left to cover the remaining acres.',
    fields: [
      { name: 'acres', label: 'Acres remaining', sym: 'A', dim: 'area', def: 640, defMetric: 250 },
      { name: 'cap', label: 'Effective capacity', sym: 'C', dim: 'areaRate', def: 22, defMetric: 9 },
      { name: 'hpd', label: 'Hours per day', sym: 'h', unit: 'hr', def: 10 },
      { name: 'machines', label: 'Machines running', sym: 'N', unit: '', def: 1, optional: true },
    ],
    compute(v) {
      const N = v.machines || 1;
      if (!(v.cap > 0)) return fail('Capacity must be more than zero.');
      const hours = v.acres / (v.cap * N);
      const days = hours / v.hpd;
      const hh = Math.floor(hours), mm = Math.round((hours - hh) * 60);
      return {
        results: [
          { label: 'Time needed', value: hours, unit: 'hr', primary: true },
          { label: 'As hours & minutes', text: `${hh} h ${mm} m` },
          { label: 'Working days', value: days, unit: 'days', decimals: 1 },
        ],
        work: [
          step('Hours', N > 1 ? 'A ÷ (C × N)' : 'A ÷ C', N > 1 ? `${n(v.acres)} ÷ (${n(v.cap)} × ${N})` : `${n(v.acres)} ÷ ${n(v.cap)}`, `${n(hours)} hr`),
          step('Days', 'hours ÷ h', `${n(hours)} ÷ ${n(v.hpd)}`, `${n(days, 1)} days`, true),
        ],
      };
    },
  },
  {
    id: 'slough-pumping',
    summary: ['Water volume', 'Pump rate'],   // supporting results on a notebook summary card
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
      { name: 'hpd', label: 'Hours pumping per day', sym: 'h', unit: 'hr', def: null, optional: true },
    ],
    compute(v) {
      const factor = SHAPES[v.shape] || 0.5;
      const ft2 = v.mode === 'area' ? v.area * 43560 : Math.PI / 4 * v.len * v.wid;
      if (!(ft2 > 0) || !(v.depth > 0)) return fail('Enter the slough size and depth.');
      const ft3 = ft2 * v.depth * factor;
      const gal = ft3 * 7.48051948;
      const ratedGpm = v.rated || pumpGpmFromOutlet(v.outlet);
      if (!(ratedGpm > 0)) return fail('Enter the pump outlet size or its rated flow.');
      if (!(v.eff > 0)) return fail('Real-world flow must be more than 0%.');
      const gph = ratedGpm * 60 * v.eff / 100;
      const hours = gal / gph;
      const hh = Math.floor(hours), mm = Math.round((hours - hh) * 60);
      const work = [];
      if (v.mode === 'area') work.push(step('Surface area', 'acres × 43,560', `${n(v.area, 2)} × 43,560`, `${n(ft2)} ft²`));
      else work.push(step('Surface area (oval)', 'π ÷ 4 × L × W', `0.7854 × ${n(v.len)} × ${n(v.wid)}`, `${n(ft2)} ft²`));
      work.push(
        step('Water volume', `area × D × ${v.shape === 'saucer' ? '⅓' : v.shape === 'flat' ? '0.8' : '½'} (${v.shape === 'flat' ? 'flat bottom' : v.shape})`, `${n(ft2)} × ${n(v.depth, 2)} × ${n(factor, 3)}`, `${n(ft3)} ft³`),
        step('In gallons', 'ft³ × 7.48', `${n(ft3)} × 7.48`, `${n(gal)} gal`),
        step('Pump rate', v.rated ? 'Q × 60 × E' : `${n(v.outlet)}″ pump ≈ ${n(ratedGpm, 0)} gpm × 60 × E`, `${n(ratedGpm, 0)} × 60 × ${n(v.eff)}%`, `${n(gph)} gph`),
        step('Time to pump', 'gal ÷ gph', `${n(gal)} ÷ ${n(gph)}`, `${n(hours, 1)} hr`, !v.hpd),
      );
      const results = [
        { label: 'Time to pump', value: hours, unit: 'hr', decimals: 1, primary: true },
        { label: 'As hours & minutes', text: `${hh} h ${mm} m` },
        { label: 'Water volume', value: gal, dim: 'volume', units: { us: 'gal', metric: 'L', sk: 'gal' }, unitSet: ['gal', 'L', 'm3', 'acft'] },
        { label: 'Pump rate', value: gph / 60, dim: 'flow', units: { us: 'gph', metric: 'lph', sk: 'gph' }, unitSet: ['gph', 'gpm', 'lph', 'lpm'] },
        { label: 'Surface area', value: ft2 / 43560, dim: 'area', decimals: 2 },
      ];
      if (v.hpd) {
        results.push({ label: 'Days', value: hours / v.hpd, unit: 'days', decimals: 1 });
        work.push(step('Days', 'hours ÷ h', `${n(hours, 1)} ÷ ${n(v.hpd)}`, `${n(hours / v.hpd, 1)} days`, true));
      }
      return {
        results, work,
        notes: ['Gallons are US gallons, the same as pump ratings. Real flow drops with more lift and longer hose.'],
      };
    },
  },
];
