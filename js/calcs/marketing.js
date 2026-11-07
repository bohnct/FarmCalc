import { n, m, step, fail } from './_h.js';

export default [
  {
    id: 'break-even',
    title: 'Break-even Price',
    category: 'marketing',
    desc: 'Price per bushel to cover costs, and break-even yield at a price.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'cost', label: 'Total cost', sym: 'C', dim: 'moneyArea', money: true, def: 750, defMetric: 1850 },
      { name: 'yield', label: 'Expected yield', sym: 'Y', dim: 'grainYield', def: 200, defMetric: 12.5 },
      { name: 'other', label: 'Other income', sym: 'O', dim: 'moneyArea', money: true, def: 0, optional: true, help: 'Program payments, insurance, straw, etc.' },
      { name: 'price', label: 'Expected price', sym: 'P', dim: 'grainPrice', def: 4.5, optional: true },
    ],
    compute(v, ctx) {
      const yBu = v.yield / ctx.tw;
      if (!(yBu > 0)) return fail('Yield must be more than zero.');
      const net = v.cost - (v.other || 0);
      const be = net / yBu;
      const work = [step('Break-even price', v.other ? '(C − O) ÷ Y' : 'C ÷ Y', v.other ? `(${m(v.cost, ctx)} − ${m(v.other, ctx)}) ÷ ${n(yBu)} bu` : `${m(v.cost, ctx)} ÷ ${n(yBu)} bu`, `${m(be, ctx)}/bu`, !v.price)];
      const results = [{ label: 'Break-even price', value: be, dim: 'grainPrice', money: true, primary: true }];
      if (v.price) {
        const beY = net / v.price;
        const profit = yBu * v.price - net;
        results.push(
          { label: 'Break-even yield', value: beY * ctx.tw, dim: 'grainYield' },
          { label: 'Return over cost', value: profit, dim: 'moneyArea', money: true },
          { label: 'Margin per bushel', value: v.price - be, money: true, unit: '/bu' },
        );
        work.push(
          step('Break-even yield', v.other ? '(C − O) ÷ P' : 'C ÷ P', `${m(net, ctx)} ÷ ${m(v.price, ctx)}`, `${n(beY, 1)} bu/ac`),
          step('Return over cost', 'Y × P − cost', `${n(yBu)} × ${m(v.price, ctx)} − ${m(net, ctx)}`, `${m(profit, ctx)}/ac`, true),
        );
      }
      return { results, work };
    },
  },

  {
    id: 'cost-convert',
    title: 'Cost per Acre ↔ Bushel',
    category: 'marketing',
    desc: 'Turn a cost per acre into a cost per bushel, or the other way.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      { name: 'mode', label: 'Convert', type: 'select', def: 'ac2bu', options: [{ value: 'ac2bu', label: 'Per acre → per bushel' }, { value: 'bu2ac', label: 'Per bushel → per acre' }] },
      { name: 'costAc', label: 'Cost per acre', sym: 'C', dim: 'moneyArea', money: true, def: 120, defMetric: 300, show: v => v.mode === 'ac2bu' },
      { name: 'costBu', label: 'Cost per bushel', sym: 'C', dim: 'grainPrice', def: 0.6, show: v => v.mode === 'bu2ac' },
      { name: 'yield', label: 'Yield', sym: 'Y', dim: 'grainYield', def: 200, defMetric: 12.5 },
      { name: 'acres', label: 'Acres', sym: 'A', dim: 'area', def: 160, defMetric: 65, optional: true },
    ],
    compute(v, ctx) {
      const yBu = v.yield / ctx.tw;
      if (!(yBu > 0)) return fail('Yield must be more than zero.');
      let perAc, perBu, work;
      if (v.mode === 'bu2ac') {
        perBu = v.costBu; perAc = perBu * yBu;
        work = [step('Cost per acre', 'C × Y', `${m(perBu, ctx, 3)} × ${n(yBu)} bu/ac`, `${m(perAc, ctx)}/ac`, !v.acres)];
      } else {
        perAc = v.costAc; perBu = perAc / yBu;
        work = [step('Cost per bushel', 'C ÷ Y', `${m(perAc, ctx)} ÷ ${n(yBu)} bu/ac`, `${m(perBu, ctx, 3)}/bu`, !v.acres)];
      }
      const results = v.mode === 'bu2ac'
        ? [{ label: 'Cost per acre', value: perAc, dim: 'moneyArea', money: true, primary: true }, { label: 'Cost per bushel', value: perBu, dim: 'grainPrice', money: true, decimals: 3 }]
        : [{ label: 'Cost per bushel', value: perBu, dim: 'grainPrice', money: true, decimals: 3, primary: true }, { label: 'Cost per acre', value: perAc, dim: 'moneyArea', money: true }];
      if (v.acres) {
        results.push({ label: 'Total for field', value: perAc * v.acres, money: true, decimals: 0 });
        work.push(step('Total for field', 'cost/ac × A', `${m(perAc, ctx)} × ${n(v.acres)}`, m(perAc * v.acres, ctx, 0), true));
      }
      return { results, work };
    },
  },
];
