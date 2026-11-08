import { n, step, fail } from './_h.js';

export default [
  {
    id: 'seeding-rate',
    title: 'Seeding Rate',
    category: 'seeding',
    desc: 'Target seeds (per ft², acre or m²) to lb/ac, adjusted for germination and purity.',
    fields: [
      { name: 'crop', label: 'Crop', type: 'crop' },
      // seeds/ft² is how small-grain rates are usually given on the prairies; tap the unit for /ac, /m², /ha
      { name: 'target', label: 'Target live seeds', sym: 'T', dim: 'countRate', units: { us: 'pft2', metric: 'pm2' }, unitSet: ['pft2', 'pac', 'pm2', 'pha'], def: 30, cropDefault: 'target' },
      { name: 'germ', label: 'Germination', sym: 'G', unit: '%', def: 95 },
      { name: 'purity', label: 'Purity', sym: 'P', unit: '%', def: 100, optional: true, help: 'Pure seed % from the seed analysis/tag. The rest is chaff, weed seed or other crops. Certified seed is usually 98–99.9%' },
      { name: 'seedsLb', label: 'Seeds per lb', sym: 'S', unit: 'seeds/lb', def: 1600, cropDefault: 'seedsLb' },
    ],
    compute(v) {
      const pur = v.purity && v.purity !== 100 ? v.purity : 0;
      const pls = v.germ / 100 * (pur || 100) / 100;
      if (pls <= 0) return fail('Germination must be more than zero.');
      if (!(v.seedsLb > 0)) return fail('Seeds per lb must be more than zero.');
      const lbAc = v.target / pls / v.seedsLb;     // target arrives per acre
      // the target is written the way it was entered, then put on a per-acre basis
      const per = { pft2: [' × 43,560', v.target / 43560], pm2: [' × 4,046.9', v.target / 4046.8564224], pha: [' ÷ 2.471', v.target * 2.4710538147] }[v.targetUnit] || ['', v.target];
      const div = pur ? '(G × P)' : 'G';
      const divS = pur ? `(${n(v.germ)}% × ${n(pur)}%)` : `${n(v.germ)}%`;
      return {
        results: [{ label: 'Seeding rate', value: lbAc, dim: 'massRate', primary: true }],
        work: [step('Seeding rate', `T${per[0]} ÷ ${div} ÷ S`, `${n(per[1], 2)}${per[0]} ÷ ${divS} ÷ ${n(v.seedsLb)}`, `${n(lbAc, 1)} lb/ac`, true)],
      };
    },
  },

  {
    id: 'plant-population',
    title: 'Plant Population',
    category: 'seeding',
    desc: 'Plants per area from stand counts in a length of row.',
    fields: [
      { name: 'rw', label: 'Row width', sym: 'R', dim: 'length', units: { us: 'in', metric: 'cm' }, unitSet: ['in', 'cm'], def: 30, defMetric: 76, defSk: 10 },
      { name: 'len', label: 'Length of row counted', sym: 'L', dim: 'length', unitSet: ['ft', 'in', 'm', 'cm'], def: 17.42, defMetric: 5.3, defSk: 3, help: 'e.g. 3 ft of row; in 10" rows that is 2.5 ft²' },
      { name: 'plants', label: 'Plants counted (total)', sym: 'P', unit: 'plants', def: 34, defSk: 62, help: 'Tip: type 34+32+35 to add several counts' },
      { name: 'counts', label: 'Number of counts', sym: 'N', unit: '', def: 1 },
    ],
    compute(v, ctx) {
      const areaFt2 = v.len * v.rw;
      if (!(areaFt2 > 0) || !(v.counts > 0)) return fail('Row width, length and number of counts must be more than zero.');
      const perFt2 = v.plants / v.counts / areaFt2;
      const P = v.counts > 1 ? 'P ÷ N' : 'P';
      const Ps = v.counts > 1 ? `${n(v.plants)} ÷ ${n(v.counts)}` : n(v.plants);
      const area = `(${n(v.len)} ft × ${n(v.rw, 3)} ft)`;
      // Sask: plants per ft²; elsewhere plants per acre
      const work = [ctx.system === 'sk'
        ? step('Plants per ft²', `${P} ÷ (L × R)`, `${Ps} ÷ ${area}`, `${n(perFt2, 1)} /ft²`, true)
        : step('Plants per acre', `${P} ÷ (L × R) × 43,560`, `${Ps} ÷ ${area} × 43,560`, `${n(perFt2 * 43560)} /ac`, true)];
      return {
        results: [{ label: 'Population', value: perFt2 * 43560, dim: 'countRate', units: { us: 'pac', metric: 'pm2', sk: 'pft2' }, unitSet: ['pft2', 'pac', 'pm2', 'pha'], primary: true }],
        work,
      };
    },
  },
];
