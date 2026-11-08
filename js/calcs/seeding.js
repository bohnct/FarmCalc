import { n, m, step, fail } from './_h.js';

export default [
  {
    id: 'seeding-rate',
    summary: ['Seeds to plant', 'Units per acre'],   // supporting results on a notebook summary card
    title: 'Seeding Rate',
    category: 'seeding',
    desc: 'Seeds per acre to lb/ac, bu/ac and seed units, adjusted for germination.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'target', label: 'Target live seeds', sym: 'T', dim: 'countRate', def: 34000, cropDefault: 'target' },
      { name: 'germ', label: 'Germination', sym: 'G', unit: '%', def: 95 },
      { name: 'purity', label: 'Purity', sym: 'P', unit: '%', def: 100, optional: true, help: 'From the seed tag; mostly for small grains & forages' },
      { name: 'seedsLb', label: 'Seeds per lb', sym: 'S', unit: 'seeds/lb', def: 1600, cropDefault: 'seedsLb' },
      { name: 'unitSize', label: 'Seeds per unit/bag', sym: 'U', unit: 'seeds', def: 80000, cropDefault: 'unit', optional: true, help: 'Corn 80,000 · Soybeans 140,000 · blank if sold by weight' },
      { name: 'acres', label: 'Acres to plant', sym: 'A', dim: 'area', def: 160, defMetric: 65, optional: true },
    ],
    compute(v, ctx) {
      const pls = v.germ / 100 * (v.purity || 100) / 100;
      if (pls <= 0) return fail('Germination must be more than zero.');
      const drop = v.target / pls;
      const lbAc = drop / v.seedsLb;
      const buAc = lbAc / ctx.tw;
      const work = [
        step('Pure live seed', v.purity && v.purity !== 100 ? 'G × P' : 'G', v.purity && v.purity !== 100 ? `${n(v.germ)}% × ${n(v.purity)}%` : `${n(v.germ)}%`, `${n(pls * 100, 2)}%`),
        step('Seeds to plant', 'T ÷ PLS', `${n(v.target)} ÷ ${n(pls, 4)}`, `${n(drop)} seeds/ac`),
        step('Pounds per acre', 'seeds ÷ S', `${n(drop)} ÷ ${n(v.seedsLb)}`, `${n(lbAc, 1)} lb/ac`, !v.unitSize),
      ];
      const results = [
        { label: 'Seeding rate', value: lbAc, dim: 'massRate', primary: true },
        { label: 'Seeds to plant', value: drop, dim: 'countRate' },
        { label: 'Bushels per acre', value: buAc, unit: 'bu/ac', decimals: 2 },
      ];
      if (v.unitSize) {
        const uAc = drop / v.unitSize;
        results.push({ label: 'Units per acre', value: uAc, unit: 'units/ac', decimals: 3 });
        work.push(step('Units per acre', 'seeds ÷ U', `${n(drop)} ÷ ${n(v.unitSize)}`, `${n(uAc, 3)} units/ac`, !v.acres));
        if (v.acres) {
          const units = uAc * v.acres;
          results.push({ label: 'Units for field', value: units, unit: 'units', decimals: 1 }, { label: 'Whole units to buy', value: Math.ceil(units), unit: 'units', decimals: 0 });
          work.push(step('Units for field', 'units/ac × A', `${n(uAc, 3)} × ${n(v.acres)}`, `${n(units, 1)} units`, true));
        }
      } else if (v.acres) {
        const lb = lbAc * v.acres;
        results.push({ label: 'Seed for field', value: lb, dim: 'mass' }, { label: 'Bushels for field', value: lb / ctx.tw, unit: 'bu', decimals: 1 });
        work.push(step('Seed for field', 'lb/ac × A', `${n(lbAc, 1)} × ${n(v.acres)}`, `${n(lb)} lb`, true));
      }
      return { results, work, links: [{ calc: 'seed-cost', label: 'Seed cost', values: { crop: v.crop, rate: drop, unitSize: v.unitSize || undefined, acres: v.acres || undefined } }] };
    },
  },

  {
    id: 'plant-population',
    summary: ['% of target'],   // supporting results on a notebook summary card
    title: 'Plant Population',
    category: 'seeding',
    desc: 'Plants per acre from stand counts in a length of row.',
    fields: [
      { name: 'rw', label: 'Row width', sym: 'R', dim: 'length', units: { us: 'in', metric: 'cm' }, unitSet: ['in', 'cm'], def: 30, defMetric: 76 },
      { name: 'len', label: 'Length of row counted', sym: 'L', dim: 'length', unitSet: ['ft', 'in', 'm', 'cm'], def: 17.42, defMetric: 5.3, help: '17 ft 5 in = 1/1000 ac in 30" rows' },
      { name: 'plants', label: 'Plants counted (total)', sym: 'P', unit: 'plants', def: 34, help: 'Tip: type 34+32+35 to add several counts' },
      { name: 'counts', label: 'Number of counts', sym: 'N', unit: '', def: 1 },
      { name: 'target', label: 'Target population', sym: 'T', dim: 'countRate', def: 34000, optional: true },
    ],
    compute(v) {
      const areaFt2 = v.len * v.rw;
      if (!(areaFt2 > 0) || !(v.counts > 0)) return fail('Row width, length and number of counts must be more than zero.');
      const avg = v.plants / v.counts;
      const pop = avg * 43560 / areaFt2;
      const results = [
        { label: 'Population', value: pop, dim: 'countRate', primary: true },
        { label: 'Average per count', value: avg, unit: 'plants', decimals: 1 },
        { label: 'Plant spacing', value: v.len / avg, dim: 'length', units: { us: 'in', metric: 'cm' }, unitSet: ['in', 'cm'] },
      ];
      const work = [
        step('Area per count', 'L × R', `${n(v.len)} ft × ${n(v.rw, 3)} ft`, `${n(areaFt2, 2)} ft²`),
        step('Average count', 'P ÷ N', `${n(v.plants)} ÷ ${n(v.counts)}`, `${n(avg, 1)}`),
        step('Plants per acre', 'avg × 43,560 ÷ area', `${n(avg, 1)} × 43,560 ÷ ${n(areaFt2, 2)}`, `${n(pop)} /ac`, !v.target),
      ];
      if (v.target) {
        const pct = pop / v.target * 100;
        results.push({ label: '% of target', value: pct, unit: '%', decimals: 1 });
        work.push(step('% of target', 'pop ÷ T', `${n(pop)} ÷ ${n(v.target)}`, `${n(pct, 1)}%`, true));
      }
      return { results, work };
    },
  },

  {
    id: 'seed-cost',
    title: 'Seed Cost per Acre',
    category: 'seeding',
    desc: 'Seed cost per acre and per field, by the unit or by the pound.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'mode', label: 'Seed sold by', type: 'select', def: 'lb', cropDefault: c => (c.unit ? 'unit' : 'lb'), options: [{ value: 'unit', label: 'Unit / bag (count)' }, { value: 'lb', label: 'Weight' }] },
      { name: 'price', label: 'Price per unit', sym: 'P', money: true, unit: '/unit', def: 300, cropDefault: c => (c.unit ? c.seedPrice : undefined), show: v => v.mode === 'unit' },
      { name: 'unitSize', label: 'Seeds per unit', sym: 'U', unit: 'seeds', def: 80000, cropDefault: 'unit', show: v => v.mode === 'unit' },
      { name: 'rate', label: 'Seeding rate', sym: 'R', dim: 'countRate', def: 34000, cropDefault: 'target', show: v => v.mode === 'unit' },
      { name: 'priceLb', label: 'Price per lb', sym: 'P', money: true, unit: '/lb', def: 0.3, cropDefault: c => (c.unit ? undefined : c.seedPrice), show: v => v.mode === 'lb' },
      { name: 'lbAc', label: 'Seeding rate', sym: 'R', dim: 'massRate', def: 90, cropDefault: c => c.seedLbAc || undefined, show: v => v.mode === 'lb' },
      { name: 'acres', label: 'Acres', sym: 'A', dim: 'area', def: 160, defMetric: 65, optional: true },
    ],
    compute(v, ctx) {
      let perAc, work;
      if (v.mode === 'lb') {
        perAc = v.lbAc * v.priceLb;
        work = [step('Cost per acre', 'R × P', `${n(v.lbAc)} lb/ac × ${m(v.priceLb, ctx)}`, m(perAc, ctx), !v.acres)];
      } else {
        if (!(v.unitSize > 0)) return fail('Seeds per unit must be more than zero.');
        const uAc = v.rate / v.unitSize;
        perAc = uAc * v.price;
        work = [
          step('Units per acre', 'R ÷ U', `${n(v.rate)} ÷ ${n(v.unitSize)}`, `${n(uAc, 3)} units/ac`),
          step('Cost per acre', 'units/ac × P', `${n(uAc, 3)} × ${m(v.price, ctx)}`, m(perAc, ctx), !v.acres),
        ];
      }
      const results = [{ label: 'Seed cost', value: perAc, dim: 'moneyArea', money: true, primary: true }];
      if (v.acres) {
        results.push({ label: 'Total for field', value: perAc * v.acres, money: true, decimals: 0 });
        work.push(step('Total for field', 'cost/ac × A', `${m(perAc, ctx)} × ${n(v.acres)}`, m(perAc * v.acres, ctx, 0), true));
      }
      return { results, work };
    },
  },
];
