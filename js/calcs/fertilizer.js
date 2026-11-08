import { n, m, step, fail } from './_h.js';

const PRICE_CHOICES = [{ value: 'ton', label: '/ton', lb: 2000 }, { value: 't', label: '/t', lb: 2204.6226 }];
const priceField = (name, label, def, show) => ({ name, label, money: true, choices: PRICE_CHOICES, choiceDefault: { us: 'ton', metric: 't' }, def, optional: true, show });
const perLb = (price, unit) => price / (PRICE_CHOICES.find(c => c.value === unit) || PRICE_CHOICES[0]).lb;

const P_SOURCES = { map: { label: 'MAP 11-52-0', n: 11, p: 52 }, dap: { label: 'DAP 18-46-0', n: 18, p: 46 } };
const N_SOURCES = { urea: { label: 'Urea 46-0-0', n: 46, s: 0 }, ams: { label: 'AMS 21-0-0-24S', n: 21, s: 24 } };

export default [
  {
    id: 'fertilizer-blend',
    summary: ['Blend analysis', 'Cost per acre'],   // supporting results on a notebook summary card
    title: 'Fertilizer Blend',
    category: 'fertilizer',
    desc: 'Pounds of urea/AMS, MAP/DAP and potash to hit an N-P-K target.',
    fields: [
      { name: 'N', label: 'Nitrogen (N)', sym: 'N', dim: 'massRate', def: 150, defMetric: 170 },
      { name: 'P', label: 'Phosphate (P₂O₅)', sym: 'P', dim: 'massRate', def: 60, defMetric: 70 },
      { name: 'K', label: 'Potash (K₂O)', sym: 'K', dim: 'massRate', def: 90, defMetric: 100 },
      { name: 'psrc', label: 'Phosphate source', type: 'select', def: 'map', options: Object.entries(P_SOURCES).map(([value, s]) => ({ value, label: s.label })) },
      { name: 'nsrc', label: 'Nitrogen source', type: 'select', def: 'urea', options: Object.entries(N_SOURCES).map(([value, s]) => ({ value, label: s.label })) },
      priceField('nPrice', 'N source price', 550),
      priceField('pPrice', 'Phosphate source price', 750),
      priceField('kPrice', 'Potash price', 450),
      { name: 'acres', label: 'Acres', sym: 'A', dim: 'area', def: 160, defMetric: 65, optional: true },
    ],
    compute(v, ctx) {
      const ps = P_SOURCES[v.psrc], ns = N_SOURCES[v.nsrc];
      const pLb = v.P / (ps.p / 100);
      const nFromP = pLb * ps.n / 100;
      const nNeed = Math.max(0, v.N - nFromP);
      const nLb = nNeed / (ns.n / 100);
      const kLb = v.K / 0.6;
      const total = pLb + nLb + kLb;
      if (!(total > 0)) return fail('Enter at least one nutrient target.');
      const nTot = nFromP + nLb * ns.n / 100;
      const sTot = nLb * ns.s / 100;
      const analysis = [nTot, v.P, v.K].map(x => Math.round(x / total * 100)).join('-') + (sTot ? `-${Math.round(sTot / total * 100)}S` : '');
      const nsName = ns.label.split(' ')[0], psName = ps.label.split(' ')[0];
      const work = [
        step(`${psName} for P`, `P ÷ ${ps.p}%`, `${n(v.P)} ÷ ${ps.p / 100}`, `${n(pLb, 1)} lb`),
        step(`N from ${psName}`, `${psName} × ${ps.n}%`, `${n(pLb, 1)} × ${ps.n / 100}`, `${n(nFromP, 1)} lb N`),
        step(`${nsName} for rest of N`, `(N − ${n(nFromP, 1)}) ÷ ${ns.n}%`, `${n(nNeed, 1)} ÷ ${ns.n / 100}`, `${n(nLb, 1)} lb`),
        step('Potash for K', 'K ÷ 60%', `${n(v.K)} ÷ 0.6`, `${n(kLb, 1)} lb`),
        step('Total blend', 'sum', `${n(pLb, 1)} + ${n(nLb, 1)} + ${n(kLb, 1)}`, `${n(total, 1)} lb/ac`, true),
      ];
      const results = [
        { label: 'Total blend', value: total, dim: 'massRate', primary: true },
        { label: ns.label, value: nLb, dim: 'massRate' },
        { label: ps.label, value: pLb, dim: 'massRate' },
        { label: 'Potash 0-0-60', value: kLb, dim: 'massRate' },
        { label: 'Blend analysis', text: analysis },
      ];
      if (sTot) results.push({ label: 'Sulfur supplied', value: sTot, dim: 'massRate' });
      const warn = [];
      if (nFromP > v.N) warn.push(`The ${psName} alone supplies ${n(nFromP, 1)} lb N, more than the ${n(v.N)} lb target.`);
      if (v.nPrice || v.pPrice || v.kPrice) {
        const cost = nLb * perLb(v.nPrice || 0, v.nPriceUnit) + pLb * perLb(v.pPrice || 0, v.pPriceUnit) + kLb * perLb(v.kPrice || 0, v.kPriceUnit);
        results.push({ label: 'Cost per acre', value: cost, dim: 'moneyArea', money: true });
        if (v.acres) results.push({ label: 'Cost for field', value: cost * v.acres, money: true, decimals: 0 });
        work.push(step('Cost per acre', 'lb × price/lb', [[nLb, v.nPrice, v.nPriceUnit], [pLb, v.pPrice, v.pPriceUnit], [kLb, v.kPrice, v.kPriceUnit]].filter(x => x[1] && x[0]).map(([lb, p, u]) => `${n(lb, 1)} × ${m(perLb(p, u), ctx, 3)}`).join(' + '), m(cost, ctx)));
      }
      if (v.acres) results.push({ label: 'Blend for field', value: total * v.acres, dim: 'mass', units: { us: 'ton', metric: 't' } });
      return { results, work, warn };
    },
  },

  {
    id: 'nitrogen-rate',
    summary: ['Cost per acre'],   // supporting results on a notebook summary card
    title: 'Nitrogen Rate & Cost',
    category: 'fertilizer',
    desc: 'Product rate for a target N rate, cost per pound of N and per acre.',
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
      { name: 'acres', label: 'Acres', sym: 'A', dim: 'area', def: 160, defMetric: 65, optional: true },
    ],
    compute(v, ctx) {
      const PROD = { nh3: [82, 0], urea: [46, 0], uan28: [28, 10.66], uan32: [32, 11.06], ams: [21, 0], custom: [v.pct, 0] };
      const [pct, dens] = PROD[v.prod];
      if (!(pct > 0)) return fail('Nitrogen content must be more than zero.');
      const lbAc = v.N / (pct / 100);
      const work = [step('Product rate', 'N ÷ %N', `${n(v.N)} ÷ ${pct / 100}`, `${n(lbAc, 1)} lb/ac`, !v.price)];
      const results = [{ label: 'Product rate', value: lbAc, dim: 'massRate', primary: true }];
      if (dens) {
        results.push({ label: 'Liquid rate', value: lbAc / dens, dim: 'volRate' }, { label: 'Lb of N per gallon', value: dens * pct / 100, unit: 'lb N/gal' });
        work.push(step('Gallons per acre', `lb ÷ ${dens} lb/gal`, `${n(lbAc, 1)} ÷ ${dens}`, `${n(lbAc / dens, 1)} gal/ac`));
      }
      if (v.price) {
        const pLb = perLb(v.price, v.priceUnit);
        const perN = pLb / (pct / 100);
        const perAc = perN * v.N;
        results.push({ label: 'Cost per lb N', value: perN, money: true, decimals: 3 }, { label: 'Cost per acre', value: perAc, dim: 'moneyArea', money: true });
        work.push(
          step('Cost per lb N', 'price/lb ÷ %N', `${m(pLb, ctx, 4)} ÷ ${pct / 100}`, m(perN, ctx, 3)),
          step('Cost per acre', '$/lb N × N', `${m(perN, ctx, 3)} × ${n(v.N)}`, m(perAc, ctx), true),
        );
        if (v.acres) results.push({ label: 'Cost for field', value: perAc * v.acres, money: true, decimals: 0 });
      }
      if (v.acres) results.push({ label: 'Product for field', value: lbAc * v.acres, dim: 'mass', units: { us: 'ton', metric: 't' } });
      return { results, work };
    },
  },
];
