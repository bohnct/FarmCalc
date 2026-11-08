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
  // Canadian labels (Sask units): metric amounts per acre
  { value: 'mLac', label: 'mL/ac', amt: 'mL', kind: 'liq', sk: true },
  { value: 'Lac', label: 'L/ac', amt: 'L', kind: 'liq', sk: true },
  { value: 'gac', label: 'g/ac', amt: 'g', kind: 'dry', sk: true },
  { value: 'kgac', label: 'kg/ac', amt: 'kg', kind: 'dry', sk: true },
  { value: 'mLha', label: 'mL/ha', amt: 'mL', kind: 'liq', ha: true },
  { value: 'Lha', label: 'L/ha', amt: 'L', kind: 'liq', ha: true },
  { value: 'gha', label: 'g/ha', amt: 'g', kind: 'dry', ha: true },
  { value: 'kgha', label: 'kg/ha', amt: 'kg', kind: 'dry', ha: true },
];
const RATE_DEFAULT = { us: 'flozac', metric: 'Lha', sk: 'Lac' };

// Express an amount in a friendlier larger unit when it gets big
function friendly(x, amt) {
  const up = { 'fl oz': ['gal', 128], pt: ['gal', 8], qt: ['gal', 4], oz: ['lb', 16], mL: ['L', 1000], g: ['kg', 1000] }[amt];
  const main = `${n(x)} ${amt}`;
  if (up && x >= up[1]) return `${main} (${n(x / up[1])} ${up[0]})`;
  return main;
}

const product = (i, def) => ({
  name: `p${i}`, label: `Product ${String.fromCharCode(64 + i)} rate`, sym: String.fromCharCode(64 + i),
  choices: RATE_CHOICES, choiceDefault: RATE_DEFAULT, def, defs: def ? { flozac: def, Lac: 0.5, Lha: 1.2 } : undefined, optional: i > 1,
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
      { name: 'gpa', label: 'Target rate', sym: 'GPA', dim: 'volRate', def: 15, defMetric: 140, defSk: 40, show: v => v.mode === 'gpm' },
      { name: 'speed', label: 'Ground speed', sym: 'S', dim: 'speed', def: 10, defMetric: 16, defSk: 20 },
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
          ],
          work: [step('Nozzle flow', 'GPA × S × W ÷ 5,940', `${n(v.gpa)} × ${n(v.speed)} × ${n(W)} ÷ 5,940`, `${n(gpm, 3)} gal/min`, true)],
          notes: ['Pick a nozzle size that gives this flow in the middle of its pressure range.'],
        };
      }
      const gpa = v.gpm * 5940 / (v.speed * W);
      return {
        results: [
          { label: 'Application rate', value: gpa, dim: 'volRate', primary: true },
        ],
        work: [step('Rate', 'Q × 5,940 ÷ (S × W)', `${n(v.gpm, 3)} × 5,940 ÷ (${n(v.speed)} × ${n(W)})`, `${n(gpa)} gal/ac`, true)],
        notes: ['5,940 converts gal/min, mph and inches to gal/ac. Flow changes with √pressure: doubling flow takes 4× the pressure.'],
        links: [{ calc: 'tank-mix', label: 'Tank mix', values: { gpa } }],
      };
    },
  },

  {
    id: 'tank-mix',
    title: 'Tank Mix',
    category: 'spraying',
    // Reference card shown under the results: the standard W-A-L-E-S mixing order.
    info: {
      title: 'Mixing order (W-A-L-E-S)',
      intro: 'Start with a clean tank. Fill it ½ to ¾ with water and start the agitator. Add a water conditioner (e.g. AMS) first if a label calls for it. Then add products in this order, letting each one mix in before the next:',
      steps: [
        ['W', 'Wettable powders & dry granules', 'WP, WG, WDG, DF. Pre-mix in water first if the label says to.'],
        ['A', 'Agitate', 'Keep agitating until the dry products are fully dispersed, and keep it running for the rest of the fill.'],
        ['L', 'Liquid flowables & suspensions', 'F, SC, CS, SE.'],
        ['E', 'Emulsifiable concentrates', 'EC, EW, ME.'],
        ['S', 'Solutions & surfactants', 'SL, SN and other solutions, then surfactants, oils and other adjuvants last.'],
      ],
      outro: 'Top up with water to the full volume while agitating, and spray soon after mixing. Product labels come first: if a label gives a different order, follow the label. Try a jar test before mixing a new combination.',
    },
    desc: 'Acres per tank and how much of each product goes in the tank.',
    fields: [
      { name: 'tank', label: 'Tank size', sym: 'T', dim: 'volume', unitSet: ['gal', 'L'], def: 1000, defMetric: 4000, defSk: 4500 },
      { name: 'gpa', label: 'Carrier rate', sym: 'GPA', dim: 'volRate', def: 15, defMetric: 140, defSk: 40 },
      product(1, 32), product(2, null), product(3, null),
    ],
    compute(v) {
      if (!(v.gpa > 0)) return fail('Carrier rate must be more than zero.');
      const acTank = v.tank / v.gpa;
      const haTank = acTank / 2.4710538147;
      const work = [step('Acres per tank', 'T ÷ GPA', `${n(v.tank)} gal ÷ ${n(v.gpa)} gal/ac`, `${n(acTank)} ac`, true)];
      const results = [{ label: 'Acres per tank', value: acTank, dim: 'area', primary: true }];
      [1, 2, 3].forEach(i => {
        const rate = v[`p${i}`];
        if (!rate) return;
        const ch = RATE_CHOICES.find(c => c.value === v[`p${i}Unit`]) || RATE_CHOICES[0];
        const L = String.fromCharCode(64 + i);
        const per = ch.ha ? haTank : acTank;
        const amt = rate * per;
        results.push({ label: `Product ${L} per tank`, text: friendly(amt, ch.amt) });
        // product per tank, worked straight from the tank size
        work.push(step(`Product ${L} per tank`, ch.ha ? `${L} × T ÷ GPA ÷ 2.471` : `${L} × T ÷ GPA`, `${n(rate)} ${ch.label} × ${n(v.tank)} gal ÷ ${n(v.gpa)}${ch.ha ? ' ÷ 2.471' : ''}`, friendly(amt, ch.amt), true));
      });
      return { results, work, notes: ['Add products in mixing order. See the card below.'] };
    },
  },
];
