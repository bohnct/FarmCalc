import { n, m, step, fail } from './_h.js';

const PRICE_CHOICES = [{ value: 'ton', label: '/ton', lb: 2000 }, { value: 't', label: '/t', lb: 2204.6226 }];
const priceField = (name, label, def, show) => ({ name, label, money: true, choices: PRICE_CHOICES, choiceDefault: { us: 'ton', metric: 't', sk: 't' }, def, optional: true, show });
const perLb = (price, unit) => price / (PRICE_CHOICES.find(c => c.value === unit) || PRICE_CHOICES[0]).lb;

// Nutrient uptake (whole crop) and removal (grain only), lb per bushel of grain:
//   [N, P2O5, K2O, S]
// survey: "Revising the crop nutrient uptake and removal guidelines for Western Canada"
//   final report (2023), F. Walley & R. Farrell, University of Saskatchewan, with Manitoba
//   Agriculture and Nutrien Ag Solutions; Saskatchewan ADF project 2119018. Means from prairie
//   commercial fields, 2020–2022 (Table 3 removal, Table 5 uptake).
// cfi: 2001 Canadian Fertilizer Institute "Nutrient Uptake and Removal by Field Crops, Western
//   Canada" (middle of the published range), as listed in the same report.
const NUTRIENTS = {
  wheat:    { survey: { up: [1.55, 0.55, 2.00, 0.19], rm: [1.38, 0.49, 0.31, 0.10] }, cfi: { up: [2.11, 0.80, 1.81, 0.23], rm: [1.50, 0.59, 0.44, 0.12] } },
  durum:    { survey: { up: [3.14, 1.07, 3.33, 0.36], rm: [1.64, 0.50, 0.30, 0.10] } },
  barley:   { survey: { up: [1.00, 0.38, 1.57, 0.16], rm: [0.86, 0.36, 0.26, 0.07] }, cfi: { up: [1.39, 0.56, 1.33, 0.165], rm: [0.97, 0.42, 0.32, 0.09] } },
  oats:     { survey: { up: [1.00, 0.30, 1.65, 0.14], rm: [0.65, 0.25, 0.17, 0.05] }, cfi: { up: [1.07, 0.41, 1.46, 0.13], rm: [0.62, 0.26, 0.19, 0.05] } },
  canola:   { survey: { up: [2.38, 0.90, 2.93, 0.86], rm: [1.68, 0.67, 0.35, 0.19] }, cfi: { up: [3.19, 1.47, 2.31, 0.54], rm: [1.93, 1.04, 0.52, 0.32] } },
  flax:     { survey: { up: [2.26, 0.80, 2.92, 0.30], rm: [1.89, 0.63, 0.42, 0.12] }, cfi: { up: [2.89, 0.83, 1.81, 0.56], rm: [2.12, 0.65, 0.61, 0.23] } },
  pea:      { survey: { up: [2.66, 0.70, 2.97, 0.37], rm: [1.75, 0.47, 0.55, 0.10] }, cfi: { up: [3.06, 0.84, 2.73, 0.25], rm: [2.34, 0.69, 0.71, 0.13] } },
  lentil:   { survey: { up: [2.49, 0.66, 2.04, 0.21], rm: [2.44, 0.56, 0.63, 0.12] }, cfi: { up: [3.05, 0.82, 2.55, 0.30], rm: [2.03, 0.62, 1.09, 0.15] } },
  soybeans: { survey: { up: [4.06, 1.05, 3.24, 0.29], rm: [2.99, 0.74, 0.89, 0.17] }, cfi: { up: [5.20, 0.90, 3.40, 0.35], rm: [3.87, 0.84, 1.39, 0.10] } },
  corn:     { survey: { up: [1.21, 0.60, 1.28, 0.12], rm: [0.94, 0.36, 0.23, 0.053] }, cfi: { up: [1.53, 0.63, 1.29, 0.15], rm: [0.97, 0.44, 0.28, 0.07] } },
};
const PULSES = ['pea', 'lentil', 'soybeans'];
const NUT = ['N', 'P₂O₅', 'K₂O', 'S'];

const P_SOURCES = { map: { label: 'MAP 11-52-0', n: 11, p: 52 }, dap: { label: 'DAP 18-46-0', n: 18, p: 46 } };
const N_SOURCES = { urea: { label: 'Urea 46-0-0', n: 46, s: 0 }, ams: { label: 'AMS 21-0-0-24S', n: 21, s: 24 } };

export default [
  {
    id: 'fertilizer-blend',
    title: 'Fertilizer Blend',
    category: 'fertilizer',
    desc: 'Pounds of urea/AMS, MAP/DAP and potash to hit an N-P-K target.',
    fields: [
      { name: 'N', label: 'Nitrogen (N)', sym: 'N', dim: 'massRate', def: 150, defMetric: 170 },
      { name: 'P', label: 'Phosphate (P₂O₅)', sym: 'P', dim: 'massRate', def: 60, defMetric: 70 },
      { name: 'K', label: 'Potash (K₂O)', sym: 'K', dim: 'massRate', def: 90, defMetric: 100 },
      { name: 'psrc', label: 'Phosphate source', type: 'select', def: 'map', options: Object.entries(P_SOURCES).map(([value, s]) => ({ value, label: s.label })) },
      { name: 'nsrc', label: 'Nitrogen source', type: 'select', def: 'urea', options: Object.entries(N_SOURCES).map(([value, s]) => ({ value, label: s.label })) },
    ],
    compute(v) {
      const ps = P_SOURCES[v.psrc], ns = N_SOURCES[v.nsrc];
      const pLb = v.P / (ps.p / 100);
      const nFromP = pLb * ps.n / 100;
      const nNeed = Math.max(0, v.N - nFromP);
      const nLb = nNeed / (ns.n / 100);
      const kLb = v.K / 0.6;
      const total = pLb + nLb + kLb;
      if (!(total > 0)) return fail('Enter at least one nutrient target.');
      const nsName = ns.label.split(' ')[0], psName = ps.label.split(' ')[0];
      const work = [
        step(psName, `P ÷ ${ps.p}%`, `${n(v.P)} ÷ ${ps.p}%`, `${n(pLb, 1)} lb`),
        step(nsName, `(N − ${psName} × ${ps.n}%) ÷ ${ns.n}%`, `(${n(v.N)} − ${n(pLb, 1)} × ${ps.n}%) ÷ ${ns.n}%`, `${n(nLb, 1)} lb`),
        step('Potash', 'K ÷ 60%', `${n(v.K)} ÷ 60%`, `${n(kLb, 1)} lb`),
        step('Total blend', `${psName} + ${nsName} + potash`, `${n(pLb, 1)} + ${n(nLb, 1)} + ${n(kLb, 1)}`, `${n(total, 1)} lb/ac`, true),
      ];
      const results = [
        { label: 'Total blend', value: total, dim: 'massRate', primary: true },
        { label: ns.label, value: nLb, dim: 'massRate' },
        { label: ps.label, value: pLb, dim: 'massRate' },
        { label: 'Potash 0-0-60', value: kLb, dim: 'massRate' },
      ];
      const warn = [];
      if (nFromP > v.N) warn.push(`The ${psName} alone supplies ${n(nFromP, 1)} lb N, more than the ${n(v.N)} lb target.`);
      return { results, work, warn };
    },
  },

  {
    id: 'nitrogen-rate',
    summary: ['Cost per acre'],   // supporting results on a notebook summary card
    title: 'Nitrogen Rate & Cost',
    category: 'fertilizer',
    desc: 'Product rate for a target N rate, and cost per acre.',
    fields: [
      {
        name: 'prod', label: 'Product', type: 'select', def: 'nh3', options: [
          { value: 'nh3', label: 'Anhydrous 82-0-0' }, { value: 'urea', label: 'Urea 46-0-0' },
          { value: 'uan28', label: 'UAN 28%' }, { value: 'uan32', label: 'UAN 32%' },
          { value: 'ams', label: 'AMS 21-0-0-24S' }, { value: 'custom', label: 'Custom %N' },
        ],
      },
      { name: 'pct', label: 'Nitrogen content', sym: '%N', unit: '%', def: 30, show: v => v.prod === 'custom' },
      { name: 'N', label: 'Target N rate', sym: 'N', dim: 'massRate', def: 160, defMetric: 180 },
      priceField('price', 'Product price', 800),
    ],
    compute(v, ctx) {
      const PROD = { nh3: [82, 0], urea: [46, 0], uan28: [28, 10.66], uan32: [32, 11.06], ams: [21, 0], custom: [v.pct, 0] };
      const [pct] = PROD[v.prod];
      if (!(pct > 0)) return fail('Nitrogen content must be more than zero.');
      const lbAc = v.N / (pct / 100);
      const work = [step('Product rate', 'N ÷ %N', `${n(v.N)} ÷ ${pct}%`, `${n(lbAc, 1)} lb/ac`, !v.price)];
      const results = [{ label: 'Product rate', value: lbAc, dim: 'massRate', primary: true }];
      if (v.price) {
        const pLb = perLb(v.price, v.priceUnit);
        const perAc = lbAc * pLb;
        const tonLb = v.priceUnit === 't' ? '2,204.6' : '2,000';
        results.push({ label: 'Cost per acre', value: perAc, dim: 'moneyArea', money: true });
        work.push(step('Cost per acre', `rate × price ÷ ${tonLb}`, `${n(lbAc, 1)} × ${m(v.price, ctx)} ÷ ${tonLb}`, m(perAc, ctx), true));
      }
      return { results, work };
    },
  },
  {
    id: 'crop-nutrients',
    title: 'Crop Nutrient Needs',
    category: 'fertilizer',
    desc: 'N, P₂O₅, K₂O and S a crop takes up and removes for a target yield (Western Canada data).',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop', cropIds: Object.keys(NUTRIENTS) },
      { name: 'yield', label: 'Target yield', sym: 'Y', unit: 'bu/ac', def: 60, cropDefault: 'yld' },
      {
        name: 'source', label: 'Data', type: 'select', def: 'survey',
        options: [{ value: 'survey', label: '2023 survey' }, { value: 'cfi', label: '2001 CFI' }],
        help: 'The 2023 survey (U of S, Sask ADF) updates the 2001 Canadian Fertilizer Institute values',
      },
    ],
    compute(v) {
      const data = NUTRIENTS[v.crop];
      if (!data) return fail('No Western Canada data for this crop.');
      if (!(v.yield > 0)) return fail('Enter a target yield.');
      const usedCfi = v.source === 'cfi' && data.cfi;
      const d = usedCfi ? data.cfi : data.survey;
      const Y = v.yield;
      const up = d.up.map(k => k * Y), rm = d.rm.map(k => k * Y);
      const r0 = x => Math.round(x);
      const nkps = a => a.map(r0).join('-');
      const per = a => `(${a.map(k => n(k, 3)).join(', ')})`;
      const work = [
        step('Crop uptake', 'Y × lb per bu (N, P₂O₅, K₂O, S)', `${n(Y)} × ${per(d.up)}`, `${nkps(up)} lb/ac`, true),
        step('Removed with grain', 'Y × lb per bu (N, P₂O₅, K₂O, S)', `${n(Y)} × ${per(d.rm)}`, `${nkps(rm)} lb/ac`, true),
      ];
      const results = [
        { label: 'Crop uptake, lb/ac (N-P₂O₅-K₂O-S)', text: nkps(up), primary: true },
        { label: 'Removed with grain, lb/ac', text: nkps(rm) },
      ];
      const notes = [
        usedCfi ? 'Source: 2001 Canadian Fertilizer Institute guide (Western Canada).' : 'Source: 2023 Western Canada survey (U of S, Saskatchewan ADF 2119018), prairie fields 2020–2022.',
        'Uptake is what the whole crop needs; removal is what leaves with the grain (replace it to hold soil P, K and S steady). Guidance only. Pair it with a soil test.',
      ];
      if (v.source === 'cfi' && !data.cfi) notes.unshift('The 2001 guide has no values for this crop, so the 2023 survey is shown.');
      if (PULSES.includes(v.crop)) notes.unshift('Pulses fix most of their own N when inoculated, so they rarely need much fertilizer N.');
      return { results, work, notes };
    },
  },
];
