import { n, step, fail } from './_h.js';

// Product rate units: liquid and dry, per acre or per hectare.
// `amt` is the unit the per-tank amount is written in; `ha` marks per-hectare rates.
const RATE_CHOICES = [
  { value: 'flozac', label: 'fl oz/ac', amt: 'fl oz', kind: 'liq' },
  { value: 'ptac', label: 'pt/ac', amt: 'pt', kind: 'liq' },
  { value: 'qtac', label: 'qt/ac', amt: 'qt', kind: 'liq' },
  { value: 'galac', label: 'gal/ac', amt: 'gal', kind: 'liq' },
  { value: 'ozac', label: 'oz/ac (dry)', amt: 'oz', kind: 'dry' },
  { value: 'lbac', label: 'lb/ac', amt: 'lb', kind: 'dry' },
  { value: 'mLha', label: 'mL/ha', amt: 'mL', kind: 'liq', ha: true },
  { value: 'Lha', label: 'L/ha', amt: 'L', kind: 'liq', ha: true },
  { value: 'gha', label: 'g/ha', amt: 'g', kind: 'dry', ha: true },
  { value: 'kgha', label: 'kg/ha', amt: 'kg', kind: 'dry', ha: true },
];
const RATE_DEFAULT = { us: 'flozac', metric: 'Lha' };

// Express an amount in a friendlier larger unit when it gets big
function friendly(x, amt) {
  const up = { 'fl oz': ['gal', 128], pt: ['gal', 8], qt: ['gal', 4], oz: ['lb', 16], mL: ['L', 1000], g: ['kg', 1000] }[amt];
  const main = `${n(x)} ${amt}`;
  if (up && x >= up[1]) return `${main} (${n(x / up[1])} ${up[0]})`;
  return main;
}

const product = (i, def) => ({
  name: `p${i}`, label: `Product ${String.fromCharCode(64 + i)} rate`, sym: String.fromCharCode(64 + i),
  choices: RATE_CHOICES, choiceDefault: RATE_DEFAULT, def, optional: i > 1,
});

export default [
  {
    id: 'sprayer-calibration',
    title: 'Sprayer Calibration',
    category: 'spraying',
    desc: 'Gallons per acre from nozzle flow, or the nozzle flow you need.',
    fields: [
      { name: 'mode', label: 'Solve for', type: 'select', def: 'gpa', options: [{ value: 'gpa', label: 'Application rate (GPA)' }, { value: 'gpm', label: 'Nozzle flow needed' }] },
      { name: 'gpm', label: 'Nozzle flow', sym: 'Q', dim: 'flow', def: 0.3, defMetric: 1.2, show: v => v.mode === 'gpa', help: 'Catch for 1 minute: fl oz ÷ 128 = gal/min' },
      { name: 'gpa', label: 'Target rate', sym: 'GPA', dim: 'volRate', def: 15, defMetric: 140, show: v => v.mode === 'gpm' },
      { name: 'speed', label: 'Ground speed', sym: 'S', dim: 'speed', def: 10, defMetric: 16 },
      { name: 'spacing', label: 'Nozzle spacing', sym: 'W', dim: 'length', units: { us: 'in', metric: 'cm' }, unitSet: ['in', 'cm'], def: 20, defMetric: 50 },
    ],
    compute(v) {
      const W = v.spacing * 12;   // base is ft; formula wants inches
      if (!(v.speed > 0) || !(W > 0)) return fail('Speed and spacing must be more than zero.');
      if (v.mode === 'gpm') {
        const gpm = v.gpa * v.speed * W / 5940;
        return {
          results: [
            { label: 'Nozzle flow needed', value: gpm, dim: 'flow', decimals: 3, primary: true },
            { label: 'Catch per nozzle in 1 min', value: gpm * 128, unit: 'fl oz', decimals: 1 },
          ],
          work: [step('Nozzle flow', 'GPA × S × W ÷ 5,940', `${n(v.gpa)} × ${n(v.speed)} × ${n(W)} ÷ 5,940`, `${n(gpm, 3)} gal/min`, true)],
          notes: ['Pick a nozzle size that gives this flow in the middle of its pressure range.'],
        };
      }
      const gpa = v.gpm * 5940 / (v.speed * W);
      return {
        results: [
          { label: 'Application rate', value: gpa, dim: 'volRate', primary: true },
          { label: 'Catch per nozzle in 1 min', value: v.gpm * 128, unit: 'fl oz', decimals: 1 },
        ],
        work: [step('Rate', 'Q × 5,940 ÷ (S × W)', `${n(v.gpm, 3)} × 5,940 ÷ (${n(v.speed)} × ${n(W)})`, `${n(gpa)} gal/ac`, true)],
        notes: ['5,940 converts gal/min, mph and inches to gal/ac. Flow changes with √pressure: doubling flow takes 4× the pressure.'],
        links: [{ calc: 'tank-mix', label: 'Tank mix', values: { gpa } }],
      };
    },
  },

  {
    id: 'tank-mix',
    summary: ['Product A per tank'],   // supporting results on a notebook summary card
    title: 'Tank Mix',
    category: 'spraying',
    desc: 'Acres per tank and how much of each product goes in the tank.',
    fields: [
      { name: 'tank', label: 'Tank size', sym: 'T', dim: 'volume', unitSet: ['gal', 'L'], def: 1000, defMetric: 4000 },
      { name: 'gpa', label: 'Carrier rate', sym: 'GPA', dim: 'volRate', def: 15, defMetric: 140 },
      product(1, 32), product(2, null), product(3, null),
      { name: 'acres', label: 'Field size', sym: 'F', dim: 'area', def: 160, defMetric: 65, optional: true },
    ],
    compute(v) {
      if (!(v.gpa > 0)) return fail('Carrier rate must be more than zero.');
      const acTank = v.tank / v.gpa;
      const haTank = acTank / 2.4710538147;
      const work = [step('Acres per tank', 'T ÷ GPA', `${n(v.tank)} gal ÷ ${n(v.gpa)} gal/ac`, `${n(acTank)} ac`)];
      const results = [{ label: 'Acres per tank', value: acTank, dim: 'area', primary: true }];
      const tanks = v.acres ? v.acres / acTank : 0;
      [1, 2, 3].forEach(i => {
        const rate = v[`p${i}`];
        if (!rate) return;
        const ch = RATE_CHOICES.find(c => c.value === v[`p${i}Unit`]) || RATE_CHOICES[0];
        const L = String.fromCharCode(64 + i);
        const per = ch.ha ? haTank : acTank;
        const amt = rate * per;
        results.push({ label: `Product ${L} per tank`, text: friendly(amt, ch.amt) });
        work.push(step(`Product ${L} per tank`, `${L} × ${ch.ha ? 'ha' : 'ac'}/tank`, `${n(rate)} ${ch.label} × ${n(per)}`, friendly(amt, ch.amt), !v.acres && i === 1));
        if (v.acres) {
          const fieldAmt = rate * (ch.ha ? v.acres / 2.4710538147 : v.acres);
          results.push({ label: `Product ${L} for field`, text: friendly(fieldAmt, ch.amt) });
        }
      });
      if (v.acres) {
        const full = Math.floor(tanks + 1e-9);
        const partAc = v.acres - full * acTank;
        results.push({ label: 'Tank loads for field', value: tanks, unit: 'tanks', decimals: 2 });
        if (partAc > 0.01) results.push({ label: 'Last partial load', value: partAc * v.gpa, dim: 'volume' });
        work.push(step('Loads', 'F ÷ ac/tank', `${n(v.acres)} ÷ ${n(acTank)}`, `${n(tanks, 2)} tanks`, true));
      }
      return { results, work, notes: ['Fill the tank half full with water before adding products, in label order.'] };
    },
  },
];
