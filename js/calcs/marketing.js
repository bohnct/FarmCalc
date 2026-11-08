import { n, m, step, fail } from './_h.js';

export default [
  {
    id: 'break-even',
    title: 'Break-even Price',
    category: 'marketing',
    desc: 'Price per bushel you need to cover your costs.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'cost', label: 'Total cost', sym: 'C', dim: 'moneyArea', money: true, def: 300, defMetric: 740 },
      { name: 'yield', label: 'Expected yield', sym: 'Y', dim: 'grainYield', def: 60, cropDefault: 'yld' },
      { name: 'other', label: 'Other income', sym: 'O', dim: 'moneyArea', money: true, def: 0, optional: true, help: 'Program payments, insurance, straw, etc.' },
    ],
    compute(v, ctx) {
      const yBu = v.yield / ctx.tw;
      if (!(yBu > 0)) return fail('Yield must be more than zero.');
      const be = (v.cost - (v.other || 0)) / yBu;
      return {
        results: [{ label: 'Break-even price', value: be, dim: 'grainPrice', money: true, primary: true }],
        work: [step('Break-even price', v.other ? '(C − O) ÷ Y' : 'C ÷ Y', v.other ? `(${m(v.cost, ctx)} − ${m(v.other, ctx)}) ÷ ${n(yBu)} bu` : `${m(v.cost, ctx)} ÷ ${n(yBu)} bu`, `${m(be, ctx)}/bu`, true)],
      };
    },
  },

  {
    id: 'cost-convert',
    title: 'Cost per Acre & Bushel',
    category: 'marketing',
    desc: 'Turn a cost per acre into a cost per bushel, or the other way.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'mode', label: 'Convert', type: 'select', def: 'ac2bu', options: [{ value: 'ac2bu', label: 'Per acre to per bushel' }, { value: 'bu2ac', label: 'Per bushel to per acre' }] },
      { name: 'costAc', label: 'Cost per acre', sym: 'C', dim: 'moneyArea', money: true, def: 120, defMetric: 300, show: v => v.mode === 'ac2bu' },
      { name: 'costBu', label: 'Cost per bushel', sym: 'C', dim: 'grainPrice', def: 0.6, show: v => v.mode === 'bu2ac' },
      { name: 'yield', label: 'Yield', sym: 'Y', dim: 'grainYield', def: 60, cropDefault: 'yld' },
    ],
    compute(v, ctx) {
      const yBu = v.yield / ctx.tw;
      if (!(yBu > 0)) return fail('Yield must be more than zero.');
      if (v.mode === 'bu2ac') {
        const perAc = v.costBu * yBu;
        return {
          results: [{ label: 'Cost per acre', value: perAc, dim: 'moneyArea', money: true, primary: true }],
          work: [step('Cost per acre', 'C × Y', `${m(v.costBu, ctx, 3)} × ${n(yBu)} bu/ac`, `${m(perAc, ctx)}/ac`, true)],
        };
      }
      const perBu = v.costAc / yBu;
      return {
        results: [{ label: 'Cost per bushel', value: perBu, dim: 'grainPrice', money: true, decimals: 3, primary: true }],
        work: [step('Cost per bushel', 'C ÷ Y', `${m(v.costAc, ctx)} ÷ ${n(yBu)} bu/ac`, `${m(perBu, ctx, 3)}/bu`, true)],
      };
    },
  },
];
