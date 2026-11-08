import { n, m, step, pctStr, fail } from './_h.js';

const crop = { name: 'crop', label: 'Crop', type: 'crop' };
const FUEL_UNITS = [{ value: 'L', label: 'L' }, { value: 'gal', label: 'gal' }];
const FUEL_PRICE = [{ value: 'L', label: '/L' }, { value: 'gal', label: '/gal' }];

export default [
  {
    id: 'grain-drying',
    title: 'Grain Drying',
    category: 'drying',
    desc: 'Water removed, shrink and dry bushels when drying grain down.',
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
      const W = v.wet, tw = ctx.tw, wetBu = W / tw;
      const water = W * (mi - mf) / (100 - mf);
      const lossPct = v.loss || 0;
      const loss = W * lossPct / 100;
      const dry = W - water - loss;
      const dryBu = dry / tw;
      const shrinkPct = (water + loss) / W * 100;
      const perPt = 100 / (100 - mf);
      const work = [
        step('Wet weight', 'W × test wt', `${n(wetBu)} bu × ${n(tw)} lb/bu`, `${n(W)} lb`),
        step('Water removed', 'W × (Mi − Mf) ÷ (100 − Mf)', `${n(W)} × (${n(mi)} − ${n(mf)}) ÷ (100 − ${n(mf)})`, `${n(water)} lb`),
      ];
      if (loss > 0) work.push(step('Handling loss', 'W × L', `${n(W)} × ${n(lossPct)}%`, `${n(loss)} lb`));
      work.push(
        step('Dry weight', loss > 0 ? 'W − water − loss' : 'W − water', loss > 0 ? `${n(W)} − ${n(water)} − ${n(loss)}` : `${n(W)} − ${n(water)}`, `${n(dry)} lb`),
        step('Dry bushels', 'dry wt ÷ test wt', `${n(dry)} ÷ ${n(tw)}`, `${n(dryBu)} bu`, true),
      );
      return {
        results: [
          { label: 'Dry grain', value: dry, dim: 'grain', primary: true },
          { label: 'Water removed', value: water, dim: 'mass' },
          { label: 'Water removed (volume)', value: water / 8.34, dim: 'volume' },
          { label: 'Total shrink', value: shrinkPct, unit: '%' },
          { label: 'Shrink per point', value: perPt, unit: '%', decimals: 3 },
          { label: 'Points removed', value: mi - mf, unit: 'pts' },
        ],
        work,
        notes: [`Water shrink factor at ${n(mf)}% = 100 ÷ (100 − ${n(mf)}) = ${pctStr(perPt, 3)} per point.`],
        links: [{ calc: 'drying-cost', label: 'Drying cost', values: { crop: v.crop, bu: W, mi, mf } }],
      };
    },
  },

  {
    id: 'drying-cost',
    title: 'Drying Cost',
    category: 'drying',
    desc: 'Fuel use and cost per bushel to dry grain, or a custom drying charge.',
    fields: [
      crop,
      { name: 'bu', label: 'Grain dried (wet)', sym: 'B', dim: 'grain', def: 1000 },
      { name: 'mi', label: 'Initial moisture', sym: 'Mi', unit: '%', def: 18, cropDefault: 'harvest' },
      { name: 'mf', label: 'Final moisture', sym: 'Mf', unit: '%', def: 15.5, cropDefault: 'moist' },
      { name: 'method', label: 'Cost method', type: 'select', def: 'fuel', options: [{ value: 'fuel', label: 'Dryer fuel use' }, { value: 'rate', label: 'Custom charge' }] },
      { name: 'use', label: 'Fuel per bu per point', sym: 'F', choices: FUEL_UNITS, choiceDefault: { us: 'gal', metric: 'L', sk: 'L' }, def: 0.02, defs: { gal: 0.02, L: 0.076 }, show: v => v.method === 'fuel', help: 'LP high-temp dryer ≈ 0.076 L (0.02 gal) per bu per point' },
      { name: 'price', label: 'Fuel price', sym: 'P', money: true, choices: FUEL_PRICE, choiceDefault: { us: 'gal', metric: 'L', sk: 'L' }, def: 1.5, defs: { gal: 1.5, L: 0.6 }, show: v => v.method === 'fuel', help: 'Propane price (rough placeholder; type yours)' },
      { name: 'other', label: 'Electric & other per bu', sym: 'E', money: true, unit: '/bu', def: 0.01, optional: true, show: v => v.method === 'fuel' },
      { name: 'rate', label: 'Charge per point per bu', sym: 'C', money: true, unit: '/pt', def: 0.04, show: v => v.method === 'rate' },
    ],
    compute(v, ctx) {
      const pts = v.mi - v.mf;
      if (pts <= 0) return fail('Initial moisture must be higher than final moisture.');
      const bu = v.bu / ctx.tw;
      let total, work;
      const results = [];
      if (v.method === 'rate') {
        total = bu * pts * v.rate;
        work = [
          step('Points removed', 'Mi − Mf', `${n(v.mi)} − ${n(v.mf)}`, `${n(pts)} pts`),
          step('Drying charge', 'B × pts × C', `${n(bu)} × ${n(pts)} × ${m(v.rate, ctx, 3)}`, m(total, ctx), true),
        ];
      } else {
        // fuel in its own unit (L or gal); price converted to that same unit
        const fu = v.useUnit === 'L' ? 'L' : 'gal';
        const L_PER_GAL = 3.785411784;
        const pricePer = v.priceUnit === fu ? v.price : (fu === 'L' ? v.price / L_PER_GAL : v.price * L_PER_GAL);
        const fuel = bu * pts * v.use;
        const fuelCost = fuel * pricePer;
        const other = bu * (v.other || 0);
        total = fuelCost + other;
        work = [
          step('Points removed', 'Mi − Mf', `${n(v.mi)} − ${n(v.mf)}`, `${n(pts)} pts`),
          step('Fuel used', 'B × pts × F', `${n(bu)} × ${n(pts)} × ${n(v.use, 4)}`, `${n(fuel)} ${fu}`),
          step('Fuel cost', 'fuel × P', `${n(fuel)} × ${m(pricePer, ctx, 3)}/${fu}`, m(fuelCost, ctx)),
        ];
        if (other > 0) work.push(step('Electric & other', 'B × E', `${n(bu)} × ${m(v.other, ctx, 3)}`, m(other, ctx)));
        work.push(step('Total cost', other > 0 ? 'fuel cost + other' : 'fuel cost', other > 0 ? `${m(fuelCost, ctx)} + ${m(other, ctx)}` : m(fuelCost, ctx), m(total, ctx), true));
        results.push({ label: 'Fuel used', value: fuel, unit: fu });
      }
      return {
        results: [
          { label: 'Cost per bushel', value: total / bu, money: true, decimals: 3, unit: '/bu', primary: true },
          { label: 'Total drying cost', value: total, money: true },
          { label: 'Cost per point per bu', value: total / bu / pts, money: true, decimals: 4 },
          ...results,
        ],
        work,
      };
    },
  },

  {
    id: 'moisture-shrink',
    summary: ['Shrink', 'Net check'],   // supporting results on a notebook summary card
    title: 'Moisture Shrink & Discount',
    category: 'drying',
    desc: 'Elevator shrink, drying charges and net value for wet grain.',
    fields: [
      crop,
      { name: 'gross', label: 'Delivered (wet)', sym: 'G', dim: 'grain', def: 1000 },
      { name: 'moist', label: 'Moisture', sym: 'M', unit: '%', def: 18, cropDefault: 'harvest' },
      { name: 'base', label: 'Base moisture', sym: 'Mb', unit: '%', def: 15.5, cropDefault: 'moist' },
      { name: 'factor', label: 'Shrink per point', sym: 'S', unit: '%', def: 1.4, help: 'Elevator shrink factor, often 1.3–1.5%' },
      { name: 'charge', label: 'Drying charge per point', sym: 'C', money: true, unit: '/bu', def: 0.04, optional: true },
      { name: 'price', label: 'Cash price', sym: 'P', dim: 'grainPrice', def: 6, cropDefault: 'price', optional: true },
    ],
    compute(v, ctx) {
      const tw = ctx.tw, gBu = v.gross / tw;
      const pts = Math.max(0, v.moist - v.base);
      const shrink = pts * v.factor;
      const netBu = gBu * (1 - shrink / 100);
      const shrinkBu = gBu - netBu;
      const charge = gBu * pts * (v.charge || 0);
      const work = [
        step('Points over base', 'M − Mb', `${n(v.moist)} − ${n(v.base)}`, `${n(pts)} pts`),
        step('Shrink', 'pts × S', `${n(pts)} × ${n(v.factor)}%`, pctStr(shrink, 2)),
        step('Net bushels', 'G × (1 − shrink)', `${n(gBu)} × (1 − ${n(shrink / 100, 4)})`, `${n(netBu)} bu`, !v.price),
      ];
      const results = [
        { label: 'Net (paid) grain', value: netBu * tw, dim: 'grain', primary: true },
        { label: 'Shrink', value: shrinkBu * tw, dim: 'grain' },
        { label: 'Shrink %', value: shrink, unit: '%' },
      ];
      if (charge > 0) {
        work.push(step('Drying charge', 'G × pts × C', `${n(gBu)} × ${n(pts)} × ${m(v.charge, ctx, 3)}`, m(charge, ctx)));
        results.push({ label: 'Drying charge', value: charge, money: true });
      }
      if (v.price) {
        const value = netBu * v.price;
        const net = value - charge;
        work.push(step('Net check', 'net bu × P − charge', `${n(netBu)} × ${m(v.price, ctx)} − ${m(charge, ctx)}`, m(net, ctx), true));
        results.push({ label: 'Grain value', value, money: true }, { label: 'Net check', value: net, money: true }, { label: 'Net price per wet bu', value: net / gBu, money: true, decimals: 3 });
      }
      const water = (v.moist - v.base) / (100 - v.base) * 100;
      return {
        results, work,
        notes: pts > 0 ? [`True water-only shrink would be ${pctStr(water, 2)}; the rest is the elevator's handling margin.`] : ['Grain is at or below base moisture; no shrink.'],
        links: [{ calc: 'grain-drying', label: 'Dry it yourself', values: { crop: v.crop, wet: v.gross, mi: v.moist, mf: v.base } }],
      };
    },
  },
];
