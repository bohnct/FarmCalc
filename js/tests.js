// Calculator math tests. Open tests.html in a browser (served over http).
// Expected values are worked out by hand from the published formulas.
import { getCalc, CALCS } from './registry.js';
import { pumpGpmFromOutlet } from './calcs/fieldops.js';
import { initState, run, snapshot, unitChoices, applyCropDefaults, formatResult } from './engine.js';
import { fromBase, convert, findUnitByLabel, needsTestWeight } from './units.js';
import { words } from './steps.js';
import { parseNum, parseQty } from './format.js';

const out = document.getElementById('out');
let pass = 0, failCount = 0;
const log = (ok, msg) => {
  const d = document.createElement('div');
  d.className = ok ? 'pass' : 'fail';
  d.textContent = (ok ? '✓ ' : '✗ ') + msg;
  out.append(d);
  ok ? pass++ : failCount++;
};

const US = { system: 'us', crop: 'corn', currency: '$', decimals: 'auto' };
const METRIC = { ...US, system: 'metric' };
const SK = { ...US, system: 'sk', crop: 'wheat' };

/** Run a calculator with text inputs (in the default US units). */
function calc(id, values = {}, settings = US, units = {}) {
  const def = getCalc(id);
  if (!def) throw new Error('No calculator ' + id);
  const state = initState(def, settings, null, null);
  for (const [k, v] of Object.entries(values)) state.values[k] = typeof v === 'number' ? String(v) : v;
  Object.assign(state.units, units);
  const r = run(def, state, settings);
  if (!r.out) throw new Error(`${id}: missing ${r.missing} bad ${r.bad}`);
  if (r.out.error) throw new Error(`${id}: ${r.out.error}`);
  const get = (label, unit) => {
    const x = r.out.results.find(q => q.label === label);
    if (!x) throw new Error(`${id}: no result "${label}"`);
    if (x.text !== undefined) return x.text;
    return unit ? fromBase(x.dim, x.value, unit, r.ctx) : x.value;
  };
  return { get, r, def, state, settings };
}

function close(name, actual, expected, tol = 0.002) {
  const ok = Math.abs(actual - expected) <= Math.abs(expected) * tol + 1e-9;
  log(ok, `${name}: got ${typeof actual === 'number' ? +actual.toFixed(5) : actual}, expected ${expected}`);
}
function eq(name, actual, expected) { log(actual === expected, `${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
function test(name, fn) {
  try { fn(); } catch (e) { log(false, `${name} threw: ${e.message}`); }
}

// ---------------- units & parsing ----------------
test('units', () => {
  close('1 ha → ac', convert('area', 1, 'ha', 'ac'), 2.471054);
  close('1 L/ha → gal/ac', convert('volRate', 1, 'Lha', 'galac'), 0.106907);
  close('100 kg/ha → lb/ac', convert('massRate', 100, 'kgha', 'lbac'), 89.218);
  close('100 °C → °F', convert('temperature', 100, 'C', 'F'), 212);
  close('32 °F → K', convert('temperature', 32, 'F', 'K'), 273.15);
  close('1 bu dry → ft³', convert('volume', 1, 'bu', 'ft3'), 1.244456);
  close('200 bu/ac corn → t/ha', convert('grainYield', 200, 'buac', 'tha', { tw: 56 }), 12.553);
  close('$4.50/bu corn → $/t', convert('grainPrice', 4.5, 'dbu', 'dt', { tw: 56 }), 177.15);
  close('10 mph → km/h', convert('speed', 10, 'mph', 'kmh'), 16.0934);
});
test('parseNum', () => {
  eq('plain', parseNum('1,250.5'), 1250.5);
  eq('sum', parseNum('34+32+35'), 101);
  eq('mixed', parseNum('(30+28)/2'), 29);
  eq('times x', parseNum('2x40'), 80);
  eq('percent sign ignored', parseNum('25%'), 25);
  eq('negative', parseNum('-3'), -3);
  log(Number.isNaN(parseNum('abc')), 'letters rejected');
  log(Number.isNaN(parseNum('')), 'empty is NaN');
});

// ---------------- grain drying ----------------
test('grain-drying', () => {
  const c = calc('grain-drying', { crop: 'corn', wet: 1000, mi: 25, mf: 15.5, loss: '' });
  close('dry bushels', c.get('Dry grain', 'bu'), 56000 * (1 - 9.5 / 84.5) / 56);
  eq('one answer, one step', `${c.r.out.results.length} ${c.r.out.work.length}`, '1 1');
  const c2 = calc('grain-drying', { crop: 'corn', wet: 1000, mi: 25, mf: 15.5, loss: 0.5 });
  close('with 0.5% handling loss', c2.get('Dry grain', 'bu'), (56000 - 56000 * 9.5 / 84.5 - 280) / 56);
});
test('moisture-shrink', () => {
  const c = calc('moisture-shrink', { gross: 1000, moist: 20, base: 15.5, factor: 1.4 });
  close('net bushels', c.get('Net (paid) grain', 'bu'), 937);
  eq('one answer, one step', `${c.r.out.results.length} ${c.r.out.work.length}`, '1 1');
});

// ---------------- storage ----------------
test('bin-capacity', () => {
  const c = calc('bin-capacity', { basis: 'measured', dia: 30, h: 20, top: 'level', bottom: 'flat', pack: '' });
  const ft3 = Math.PI * 15 * 15 * 20;
  close('level 30×20 bushels', c.get('Capacity', 'bu'), ft3 / 1.244456);
  const p = calc('bin-capacity', { basis: 'measured', dia: 30, h: 20, top: 'peak', repose: 23, bottom: 'flat', pack: '' });
  const peak = Math.PI * 225 * (15 * Math.tan(23 * Math.PI / 180)) / 3;
  close('peaked adds cone', p.get('Capacity', 'bu'), (ft3 + peak) / 1.244456);
  const f = calc('bin-capacity', { basis: 'measured', dia: 30, h: 20, top: 'funnel', repose: 23, bottom: 'flat', pack: '' });
  close('inverted cone subtracts the funnel', f.get('Capacity', 'bu'), (ft3 - peak) / 1.244456);
  log(f.r.out.notes.some(t => t.startsWith('hf = funnel depth')), 'funnel depth explained in a note');
  eq('one answer, one step', `${f.r.out.results.length} ${f.r.out.work.length}`, '1 1');
  // depth given in 44" rings: 6 rings = 22 ft
  const rg = calc('bin-capacity', { basis: 'measured', dia: 30, h: 6, top: 'level', bottom: 'flat', pack: '', ringH: '44' }, US, { h: 'ring' });
  close('6 × 44″ rings = 22 ft of grain', rg.get('Capacity', 'bu'), Math.PI * 225 * 22 / 1.244456);
  log(rg.r.out.work[0].f.includes('rings × Rh'), 'work shows rings × ring height');
  const rc = calc('bin-capacity', { basis: 'measured', dia: 30, h: 6, top: 'level', bottom: 'flat', pack: '', ringH: 'custom', ringCustom: 39 }, US, { h: 'ring' });
  close('custom 39″ rings', rc.get('Capacity', 'bu'), Math.PI * 225 * (6 * 39 / 12) / 1.244456);
  const st = initState(getCalc('bin-capacity'), US, null, null);
  Object.assign(st.values, { basis: 'measured', dia: '30', h: '3', top: 'funnel', repose: '23' });
  log(!!run(getCalc('bin-capacity'), st, US).out.error, 'funnel deeper than the grain is rejected');
});
test('bin capacity matches manufacturer ratings', () => {
  const rated = (basis, dia, rings, ringH, extra = {}) =>
    calc('bin-capacity', { basis, dia, h: rings, ringH, bottom: 'flat', ...extra }, US, { h: 'ring' }).get('Capacity', 'bu');
  // Westeel 2406 Wide-Corr: 24 ft, 6 rings of 44" — listed at 9,220 bu (UFA)
  close('Westeel 2406 Wide-Corr ≈ 9,220 bu', rated('westeel', 24, 6, '44'), 9220, 0.005);
  // 2405 vs 2406 hopper bins are listed 8,870 vs 10,270 bu: one 24 ft ring ≈ 1,400 bu
  close('one 44″ ring on a 24 ft bin ≈ 1,400 bu', rated('westeel', 24, 6, '44') - rated('westeel', 24, 5, '44'), 1400, 0.01);
  // Old Westeel-Rosco 1406: 14 ft, 6 rings of 30" — listings say about 2,000–2,200 bu
  const w1406 = rated('westeel', 14, 6, '30');
  log(w1406 >= 2000 && w1406 <= 2200, `old Westeel 1406 (30″ rings) = ${Math.round(w1406)} bu, within the 2,000–2,200 listed`);
  // Westeel's method: cylinder × 1.05 + 30° peak, at 1.244 ft³/bu
  const r = 12, H = 22, A = Math.PI * r * r;
  close('Westeel method by hand', rated('westeel', 24, 6, '44'), (A * H * 1.05 + A * r * Math.tan(Math.PI / 6) / 3) / 1.244456);
  // Sukup's method: cylinder × 1.06 + 28° peak
  close('Sukup method by hand', rated('sukup', 24, 6, '44'), (A * H * 1.06 + A * r * Math.tan(28 * Math.PI / 180) / 3) / 1.244456);
  // entries saved before the rating option reopen "as measured", so their numbers don't change
  const st = initState(getCalc('bin-capacity'), US, null, { crop: 'wheat', dia: 30, h: 20, top: 'level', bottom: 'flat' });
  eq('old entries reopen as measured', st.values.basis, 'measured');
  eq('new calculations default to the Westeel rating', initState(getCalc('bin-capacity'), US, null, null).values.basis, 'westeel');
});
test('grain-pile', () => {
  const c = calc('grain-pile', { shape: 'cone', dia: 60, repose: 23 });
  const h = 30 * Math.tan(23 * Math.PI / 180);
  close('cone bushels', c.get('Pile capacity', 'bu'), Math.PI * 900 * h / 3 / 1.244456);
  const r = calc('grain-pile', { shape: 'ridge', w: 60, len: 200, repose: 23 });
  close('ridge bushels', r.get('Pile capacity', 'bu'), ((60 * h / 2) * 140 + Math.PI * 900 * h / 3) / 1.244456);
});
test('truck-load', () => {
  const c = calc('truck-load', { gross: 80000, tare: 30000 });
  close('net bushels corn', c.get('Net grain', 'bu'), 50000 / 56);
});

// ---------------- yield ----------------
test('canola-yield', () => {
  // 6 plants/ft² × 60 pods × 18 seeds = 6,480 seeds/ft²; TSW 4.5 g → 453,592 ÷ 4.5 = 100,798 seeds/lb
  const lbAc = 6 * 60 * 18 * 43560 / (453592 / 4.5);
  const c = calc('canola-yield', { plants: 6, pods: 60, spp: 18, tsw: 4.5, loss: '' });
  close('bu/ac (50 lb/bu)', c.get('Estimated yield', 'buac'), lbAc / 50);
  const l = calc('canola-yield', { plants: 6, pods: 60, spp: 18, tsw: 4.5, loss: 10 });
  close('with 10% loss', l.get('Estimated yield', 'buac'), lbAc * 0.9 / 50);
  const m = calc('canola-yield', { plants: 60, pods: 60, spp: 18, tsw: 4.5, loss: '' }, US, { plants: 'pm2' });
  close('plants per m² input', m.get('Estimated yield', 'buac'), lbAc / 6 * (60 / 10.7639) / 50);
});
test('wheat-yield', () => {
  const c = calc('wheat-yield', { rw: 7.5, len: 3, heads: 110, kph: 25, kpl: 14000 });
  close('bu/ac', c.get('Estimated yield', 'buac'), (110 / 1.875) * 43560 * 25 / 14000 / 60);
});
test('combine-check', () => {
  const c = calc('combine-check', { crop: 'corn', wt: 15000, moist: 18, std: 15.5, method: 'area', area: 2 });
  close('dry bu/ac', c.get('Dry yield', 'buac'), 15000 * 82 / 84.5 / 56 / 2);
  const s = calc('combine-check', { crop: 'corn', wt: 15000, moist: 18, std: 15.5, method: 'strip', len: 1000, w: 30 });
  close('strip area', s.get('Dry yield', 'buac'), 15000 * 82 / 84.5 / 56 / (30000 / 43560));
});

// ---------------- field ops ----------------
test('field-productivity', () => {
  const c = calc('field-productivity', { w: 40, speed: 6, eff: 75 });
  close('productivity', c.get('Productivity', 'ach'), 240 / 8.25 * 0.75);
  eq('one result only', c.r.out.results.length, 1);
  eq('one working step', c.r.out.work.length, 1);
});
test('speedometer', () => {
  const d = getCalc('speedometer');
  eq('GPS only: no inputs', d.fields.length, 0);
  eq('opens as a live tool', d.toolOnly, true);
});
test('crop nutrient needs (Western Canada data)', () => {
  // 60 bu wheat, 2023 survey: uptake 1.55 N, 0.55 P2O5, 2.00 K2O, 0.19 S per bu
  const w = calc('crop-nutrients', { crop: 'wheat', yield: 60, source: 'survey' });
  eq('wheat uptake N-P-K-S', w.get('Crop uptake, lb/ac (N-P₂O₅-K₂O-S)'), '93-33-120-11');
  eq('wheat removal N-P-K-S', w.get('Removed with grain, lb/ac'), '83-29-19-6');
  // 2001 CFI values for comparison: 2.11 N/bu uptake
  eq('wheat uptake (CFI 2001)', calc('crop-nutrients', { crop: 'wheat', yield: 60, source: 'cfi' }).get('Crop uptake, lb/ac (N-P₂O₅-K₂O-S)'), '127-48-109-14');
  // 45 bu canola: 2.38 N, 0.90 P, 2.93 K, 0.86 S per bu uptake
  eq('canola uptake', calc('crop-nutrients', { crop: 'canola', yield: 45, source: 'survey' }).get('Crop uptake, lb/ac (N-P₂O₅-K₂O-S)'), '107-41-132-39');
  // durum has no 2001 CFI values: falls back to the survey and says so
  const d = calc('crop-nutrients', { crop: 'durum', yield: 50, source: 'cfi' });
  eq('durum falls back to survey', d.get('Crop uptake, lb/ac (N-P₂O₅-K₂O-S)').split('-')[0], '157');
  log(d.r.out.notes[0].includes('no values'), 'says the 2001 guide has no durum values');
  log(calc('crop-nutrients', { crop: 'pea', yield: 50, source: 'survey' }).r.out.notes[0].includes('fix'), 'pulse note');
  eq('only crops with data offered', getCalc('crop-nutrients').fields[0].cropIds.includes('rye'), false);
  eq('two lines of working', w.r.out.work.length, 2);
});
test('slough pumping', () => {
  // 300 × 150 ft oval, 3 ft deep, bowl shape; 3" pump ≈ 300 gpm at 65%
  const area = Math.PI / 4 * 300 * 150, gal = area * 3 * 0.5 * 7.48051948, gph = 300 * 60 * 0.65;
  const c = calc('slough-pumping', { mode: 'dims', len: 300, wid: 150, depth: 3, shape: 'bowl', outlet: 3, rated: '', eff: 65 });
  close('hours to pump', c.get('Time to pump'), gal / gph);
  eq('one answer, one step', `${c.r.out.results.length} ${c.r.out.work.length}`, '1 1');
  // a known rating overrides the outlet estimate: 1 acre saucer 4 ft deep, 500 gpm at 70%
  const k = calc('slough-pumping', { mode: 'area', area: 1, depth: 4, shape: 'saucer', outlet: 3, rated: 500, eff: 70 });
  close('rated flow used', k.get('Time to pump'), 43560 * 4 / 3 * 7.48051948 / (500 * 60 * 0.7));
  // outlet size table: 2"/3"/4"/6" ratings and in-between sizes
  close('2″ ≈ 160 gpm', pumpGpmFromOutlet(2), 160);
  close('4″ ≈ 500 gpm', pumpGpmFromOutlet(4), 500);
  close('5″ between 4″ and 6″', pumpGpmFromOutlet(5), 800);
});

// ---------------- seeding ----------------
test('seeding-rate', () => {
  const c = calc('seeding-rate', { crop: 'corn', target: 34000, germ: 95, purity: 100, seedsLb: 1600 }, US, { target: 'pac' });
  close('lb/ac', c.get('Seeding rate', 'lbac'), 34000 / 0.95 / 1600);
  eq('one answer, one step', `${c.r.out.results.length} ${c.r.out.work.length}`, '1 1');
});
test('seeding rate in seeds/ft² and seeds/m²', () => {
  const W = { ...US, crop: 'wheat' };
  eq('wheat target starts at 30 seeds/ft²', initState(getCalc('seeding-rate'), W, null, null).values.target, '30');
  eq('…shown per ft² by default', initState(getCalc('seeding-rate'), W, null, null).units.target, 'pft2');
  // 30 seeds/ft² = 1,306,800/ac; PLS 95% × 98%; 14,000 seeds/lb
  const c = calc('seeding-rate', { crop: 'wheat', target: 30, germ: 95, purity: 98, seedsLb: 14000 }, W);
  close('lb/ac from seeds/ft²', c.get('Seeding rate', 'lbac'), 30 * 43560 / (0.95 * 0.98) / 14000);
  const m = calc('seeding-rate', { crop: 'wheat', target: 300, germ: 95, purity: 100, seedsLb: 14000 }, W, { target: 'pm2' });
  close('lb/ac from seeds/m²', m.get('Seeding rate', 'lbac'), 300 * 4046.8564224 / 0.95 / 14000);
  eq('work starts from seeds/ft²', c.r.out.work[0].s.startsWith('30 × 43,560'), true);
});
test('plant-population', () => {
  const c = calc('plant-population', { rw: 30, len: 17.42, plants: '34+33+35', counts: 3 });
  close('plants/ac', c.get('Population', 'pac'), 34 * 43560 / (17.42 * 2.5));
});

// ---------------- spraying ----------------
test('sprayer-calibration', () => {
  close('GPA', calc('sprayer-calibration', { mode: 'gpa', gpm: 0.3, speed: 10, spacing: 20 }).get('Application rate', 'galac'), 0.3 * 5940 / 200);
  close('GPM needed', calc('sprayer-calibration', { mode: 'gpm', gpa: 15, speed: 10, spacing: 20 }).get('Nozzle flow needed', 'gpm'), 15 * 200 / 5940);
});
test('tank-mix', () => {
  const c = calc('tank-mix', { tank: 1000, gpa: 15, p1: 32, p2: '', p3: '' }, US, { p1: 'flozac' });
  close('acres per tank', c.get('Acres per tank', 'ac'), 1000 / 15);
  eq('product A per tank', c.get('Product A per tank'), '2,133 fl oz (16.67 gal)');
  eq('acres and product A only', c.r.out.results.length, 2);
});

// ---------------- fertilizer ----------------
test('fertilizer-blend', () => {
  const c = calc('fertilizer-blend', { N: 150, P: 60, K: 90, psrc: 'map', nsrc: 'urea' });
  const map = 60 / 0.52, urea = (150 - map * 0.11) / 0.46, pot = 150;
  close('MAP lb', c.get('MAP 11-52-0', 'lbac'), map);
  close('urea lb', c.get('Urea 46-0-0', 'lbac'), urea);
  close('total', c.get('Total blend', 'lbac'), map + urea + pot);
});
test('nitrogen-rate', () => {
  const c = calc('nitrogen-rate', { prod: 'nh3', N: 160, price: 800 });
  close('NH3 lb/ac', c.get('Product rate', 'lbac'), 160 / 0.82);
  close('$/ac', c.get('Cost per acre', 'dac'), 0.4 / 0.82 * 160);
  eq('rate only when unpriced', calc('nitrogen-rate', { prod: 'urea', N: 100, price: '' }).r.out.results.length, 1);
});

// ---------------- marketing ----------------
test('break-even', () => {
  const c = calc('break-even', { crop: 'corn', cost: 750, yield: 200, other: '' });
  close('BE price', c.get('Break-even price', 'dbu'), 3.75);
  eq('one answer', c.r.out.results.length, 1);
});
test('cost-convert', () => {
  close('ac → bu', calc('cost-convert', { mode: 'ac2bu', costAc: 120, yield: 200 }).get('Cost per bushel', 'dbu'), 0.6);
  close('bu → ac', calc('cost-convert', { mode: 'bu2ac', costBu: 0.6, yield: 200 }).get('Cost per acre', 'dac'), 120);
});

// ---------------- convert ----------------
test('unit-converter', () => {
  const c = calc('unit-converter', { dim: 'mass', value: 1, from: 'lb', to: 'kg' });
  close('1 lb → kg', c.r.out.results[0].value, 0.45359237);
  const t = calc('unit-converter', { dim: 'temperature', value: 100, from: 'C', to: 'F' });
  close('100 °C → °F', t.r.out.results[0].value, 212);
});
test('bushel-weight', () => {
  const c = calc('bushel-weight', { crop: 'soybeans', tw: 60, mode: 'grain', value: 1000, from: 'bu' });
  eq('first row is lb', c.r.out.results[0].unit, 'lb');
  close('1000 bu soy → lb', c.r.out.results[0].value, 60000);
  close('1000 bu soy → t', c.get('t'), 60000 / 2204.6226);
});

// ---------------- engine behaviour ----------------
test('metric defaults', () => {
  const def = getCalc('bin-capacity');
  const st = initState(def, METRIC, null, null);
  eq('bin diameter default unit', st.units.dia, 'm');
  eq('bin diameter default value', st.values.dia, '9');
  const r = run(def, st, METRIC);
  log(!r.out.error && r.out.results[0].value > 0, 'metric bin computes');
});
test('crop defaults & prefill round trip', () => {
  const c = calc('grain-drying', { crop: 'soybeans', wet: 500, mi: 18, mf: 13 });
  const snap = snapshot(c.def, c.state, US, c.r);
  const st2 = initState(c.def, US, null, snap.prefill);
  eq('prefill restores wet bushels', st2.values.wet, '500');
  eq('prefill restores crop', st2.values.crop, 'soybeans');
  log(snap.steps.length === 1 && snap.given.length >= 4, 'snapshot has given + steps');
});
test('adding one step to the notebook', () => {
  const c = calc('crop-nutrients', { crop: 'wheat', yield: 60, source: 'survey' });
  const last = c.r.out.work.length - 1;
  const snap = snapshot(c.def, c.state, US, c.r, {}, [last]);
  eq('only the chosen step', snap.steps.length, 1);
  eq('heading is the calculator', snap.title, 'Crop Nutrient Needs');
  eq('subtitle names the step', snap.subtitle, 'Removed with grain');
  log(snap.steps[0].final, 'chosen step drawn as the final answer');
  const whole = snapshot(c.def, c.state, US, c.r, {}, null);
  eq('whole calculation keeps every step', whole.steps.length, c.r.out.work.length);
  const d = calc('tank-mix', { tank: 1000, gpa: 15, p1: 32, p2: '', p3: '' }, US, { p1: 'flozac' });
  const acres = snapshot(d.def, d.state, US, d.r, {}, [0]);   // "T ÷ GPA"
  const syms = acres.given.map(g => g.sym).filter(Boolean).sort().join(',');
  eq('only inputs the step uses', syms, 'GPA,T');
});
test('reading numbers back out of entries (for equations)', () => {
  const q = t => JSON.stringify(parseQty(t));
  eq('bushels', q('11,360 bu'), JSON.stringify({ value: 11360, unit: 'bu' }));
  eq('rate', q('56.01 bu/ac'), JSON.stringify({ value: 56.01, unit: 'bu/ac' }));
  eq('money per bu', q('$0.300/bu'), JSON.stringify({ value: 0.3, unit: '$/bu' }));
  eq('negative money', q('−$12.50'), JSON.stringify({ value: -12.5, unit: '$' }));
  eq('extra note dropped', q('2,133 fl oz (16.67 gal)'), JSON.stringify({ value: 2133, unit: 'fl oz' }));
  eq('percent', q('11.74 %'), JSON.stringify({ value: 11.74, unit: '%' }));
  eq('analysis is not a quantity', parseQty('11-52-0'), null);
  eq('h m is not a quantity', parseQty('7 h 18 m'), null);
});
test('Sask units', () => {
  const st = id => initState(getCalc(id), SK, null, null);
  const u = (id, f) => st(id).units[f] + ' ' + st(id).values[f];
  eq('sprayer speed in km/h', u('sprayer-calibration', 'speed'), 'kmh 20');
  eq('carrier in L/ac', u('tank-mix', 'gpa'), 'Lac 40');
  eq('tank in litres', u('tank-mix', 'tank'), 'L 4500');
  eq('label rate in L/ac', u('tank-mix', 'p1'), 'Lac 0.5');
  eq('scale ticket in kg', u('truck-load', 'gross'), 'kg 36000');
  eq('bin diameter in ft', u('bin-capacity', 'dia'), 'ft 30');
  eq('fertilizer rate in lb/ac', u('fertilizer-blend', 'N'), 'lbac 150');
  eq('fertilizer price per tonne', st('nitrogen-rate').units.price, 't');
  eq('seed target per ft²', u('seeding-rate', 'target'), 'pft2 30');
  eq('drill row spacing 10″', u('plant-population', 'rw'), 'in 10');
  eq('plant count starts at a wheat count', st('plant-population').values.plants, '62');
  eq('yield in bu/ac', st('break-even').units.yield, 'buac');
  eq('working speed in km/h', u('field-productivity', 'speed'), 'kmh 9');
  // results: bin capacity in bushels
  const b = run(getCalc('bin-capacity'), st('bin-capacity'), SK);
  eq('capacity in bu', formatResult(b.out.results.find(r => r.label === 'Capacity'), b.ctx).unitText, 'bu');
  // sprayer: 0.3 gpm nozzles at 20 km/h, 20″ spacing → L/ac
  const sp = calc('sprayer-calibration', { mode: 'gpa', gpm: 0.3, speed: 20, spacing: 20 }, SK);
  close('GPA from km/h', sp.get('Application rate', 'galac'), 0.3 * 5940 / (20 * 0.621371192 * 20));
});
test('wheat is the standard crop', () => {
  const W = { ...US, crop: 'wheat' };
  const vals = id => initState(getCalc(id), W, null, null).values;
  eq('drying starts at wheat harvest moisture', vals('grain-drying').mi, '18');
  eq('…dried to wheat market moisture', vals('grain-drying').mf, '13.5');
  eq('shrink starts at 18%', vals('moisture-shrink').moist, '18');
  eq('break-even yield', vals('break-even').yield, '60');
  eq('wheat seeding target 30 seeds/ft²', vals('seeding-rate').target, '30');
  eq('bushels to weight uses 60 lb/bu', vals('bushel-weight').tw, '60');
  // switching a calculator to corn swaps the crop-based values
  const def = getCalc('seeding-rate'); const st = initState(def, W, null, null);
  const wheatSeeds = st.values.seedsLb;
  st.values.crop = 'corn'; applyCropDefaults(def, st, W);
  log(st.values.seedsLb !== wheatSeeds, 'switching to corn changes seeds per lb');
  const dr = calc('grain-drying', { crop: 'wheat', wet: 1000, mi: 18, mf: 13.5, loss: '' }, W);
  close('1,000 bu wheat 18 → 13.5%', dr.get('Dry grain', 'bu'), 60000 * (1 - 4.5 / 86.5) / 60);
});
test('converting a number from the notebook', () => {
  const u = l => JSON.stringify(findUnitByLabel(l));
  eq('bu is grain (uses test weight)', u('bu'), JSON.stringify({ dim: 'grain', unit: 'bu' }));
  eq('t is grain tonnes', u('t'), JSON.stringify({ dim: 'grain', unit: 't' }));
  eq('ton (short) label', u('ton'), JSON.stringify({ dim: 'grain', unit: 'ton' }));
  eq('yield', u('bu/ac'), JSON.stringify({ dim: 'grainYield', unit: 'buac' }));
  eq('price', u('$/bu'), JSON.stringify({ dim: 'grainPrice', unit: 'dbu' }));
  eq('acres', u('ac'), JSON.stringify({ dim: 'area', unit: 'ac' }));
  eq('cubic feet', u('ft³'), JSON.stringify({ dim: 'volume', unit: 'ft3' }));
  eq('unknown unit', findUnitByLabel('pods'), null);
  log(needsTestWeight('grain', 'bu', 't'), 'bu → t needs test weight');
  log(!needsTestWeight('grain', 'lb', 't'), 'lb → t does not');
  // 27,555 bu of corn at 56 lb/bu = 1,543,080 lb = 699.9 t
  close('27,555 bu corn → t', convert('grain', 27555, 'bu', 't', { tw: 56 }), 27555 * 56 / 2204.62262);
  close('…at a measured 54 lb/bu', convert('grain', 27555, 'bu', 't', { tw: 54 }), 27555 * 54 / 2204.62262);
});
test('handwritten text has no arrow glyphs', () => {
  eq('old title tidied', words('Bushels ↔ Weight'), 'Bushels & Weight');
  eq('arrow as "to"', words('Per acre → per bushel'), 'Per acre to per bushel');
  log(!CALCS.some(c => /[↔→]/.test(c.title)), 'no calculator title uses an arrow glyph');
});
test('edit inputs keeps how the entry was made', () => {
  const b = calc('bin-capacity', { basis: 'measured', dia: 30, h: 6, top: 'level', bottom: 'flat', pack: '', ringH: '44' }, US, { h: 'ring' });
  const s1 = snapshot(b.def, b.state, US, b.r, {}, 'summary');
  eq('summary remembered', s1.pick, 'summary');
  eq('depth unit saved', s1.prefill.hUnit, 'ring');
  const st = initState(b.def, US, null, s1.prefill);
  eq('reopens in rings', st.units.h, 'ring');
  eq('reopens with 6 rings', st.values.h, '6');
  const n2 = calc('crop-nutrients', { crop: 'wheat', yield: 60, source: 'survey' });
  const s2 = snapshot(n2.def, n2.state, US, n2.r, {}, [1]);
  eq('step pick remembered', JSON.stringify(s2.pick), '[1]');
});
test('summary card snapshot', () => {
  const c = calc('canola-yield', { plants: 6, pods: 60, spp: 18, tsw: 4.5, loss: '' });
  const snap = snapshot(c.def, c.state, US, c.r, {}, 'summary');
  eq('style', snap.style, 'summary');
  eq('inputs in plain words', snap.given.map(g => g.label).join(' | '), 'Plants per area | Pods per plant | Seeds per pod | Thousand-seed weight');
  eq('values with units as entered', snap.given[3].text, '4.5 g');
  eq('main answer', snap.results.find(r => r.primary).text, '56.01 bu/ac');
  log(!snap.results.some(r => r.sum), 'canola shows no extra results');
  log(snap.steps.length === c.r.out.work.length, 'full working kept for "show working"');
  const b = calc('bin-capacity', { basis: 'measured', dia: 30, h: 6, top: 'level', bottom: 'flat', pack: '', ringH: '44' }, US, { h: 'ring' });
  const bs = snapshot(b.def, b.state, US, b.r, {}, 'summary');
  eq('bin shows just its capacity', bs.results.filter(r => r.sum).length, 0);
  log(bs.given.some(g => g.text === '6 rings'), 'rings shown as entered');
  eq('blank optional inputs left out', snap.given.some(g => g.label === 'Pod shatter / harvest loss'), false);
});
test('unit dropdowns only offer practical units', () => {
  const bin = getCalc('bin-capacity').fields.find(f => f.name === 'dia');
  eq('bin diameter', unitChoices(bin, 'us', 'ft').join(','), 'ft,m');
  const rw = getCalc('wheat-yield').fields.find(f => f.name === 'rw');
  eq('row width', unitChoices(rw, 'us', 'in').join(','), 'in,cm');
  const tank = getCalc('tank-mix').fields.find(f => f.name === 'tank');
  eq('tank size', unitChoices(tank, 'us', 'gal').join(','), 'gal,L');
  const p = getCalc('tank-mix').fields.find(f => f.name === 'p1');
  eq('product rate (US)', unitChoices(p, 'us', 'flozac').join(','), 'flozac,ptac,qtac,galac,ozac,lbac');
  eq('product rate (metric)', unitChoices(p, 'metric', 'Lha').join(','), 'mLha,Lha,gha,kgha');
  eq('product rate (Sask labels)', unitChoices(p, 'sk', 'Lac').join(','), 'mLac,Lac,gac,kgac');
  for (const def of CALCS) for (const f of def.fields) {
    const list = unitChoices(f, 'us', null);
    if (list && list.length > 6) log(false, `${def.id}.${f.name} offers ${list.length} units`);
  }
});
test('every calculator runs on defaults (US + metric)', () => {
  for (const def of CALCS.filter(d => !d.toolOnly)) {
    for (const s of [US, METRIC, SK]) {
      const st = initState(def, s, null, null);
      const r = run(def, st, s);
      const ok = r.out && !r.out.error && r.out.results.length > 0 && r.out.work.length > 0;
      log(ok, `${def.id} (${s.system}) ${ok ? 'ok' : (r.out?.error || `missing ${r.missing} bad ${r.bad}`)}`);
    }
  }
});

document.getElementById('summary').textContent = failCount ? `${failCount} failed, ${pass} passed` : `All ${pass} tests passed`;
document.getElementById('summary').className = failCount ? 'fail' : 'pass';
window.__testResult = { pass, fail: failCount };
