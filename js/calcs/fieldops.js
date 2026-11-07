import { n, step, fail } from './_h.js';
const FIELD_LEN = ['ft', 'yd', 'rod', 'mi', 'm', 'km'];

export default [
  {
    id: 'field-productivity',
    title: 'Field Productivity',
    category: 'fieldops',
    desc: 'Acres per hour from implement width, speed and field efficiency.',
    fields: [
      { name: 'w', label: 'Implement width', sym: 'W', dim: 'length', unitSet: ['ft', 'm'], def: 40, defMetric: 12 },
      { name: 'speed', label: 'Ground speed', sym: 'S', dim: 'speed', def: 6, defMetric: 10 },
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
];
