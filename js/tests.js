// Calculator math tests. Open tests.html in a browser (served over http).
// Expected values are worked out by hand from the published formulas.
import { getCalc, CALCS } from './registry.js';
import { initState, run, snapshot, unitChoices } from './engine.js';
import { fromBase, convert } from './units.js';
import { parseNum } from './format.js';

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
  close('water removed lb', c.get('Water removed', 'lb'), 56000 * 9.5 / 84.5);
  close('shrink per point', c.get('Shrink per point'), 1.18343);
  const c2 = calc('grain-drying', { crop: 'corn', wet: 1000, mi: 25, mf: 15.5, loss: 0.5 });
  close('with 0.5% handling loss', c2.get('Dry grain', 'bu'), (56000 - 56000 * 9.5 / 84.5 - 280) / 56);
});
test('drying-cost', () => {
  const c = calc('drying-cost', { bu: 1000, mi: 25, mf: 15, method: 'fuel', use: 0.02, price: 1.5, other: '' });
  close('cost per bu', c.get('Cost per bushel'), 0.30);
  close('fuel used', c.get('Fuel used'), 200);
  const c2 = calc('drying-cost', { bu: 1000, mi: 20, mf: 15, method: 'rate', rate: 0.04 });
  close('custom rate total', c2.get('Total drying cost'), 200);
});
test('moisture-shrink', () => {
  const c = calc('moisture-shrink', { gross: 1000, moist: 20, base: 15.5, factor: 1.4, charge: 0.04, price: 4.5 });
  close('net bushels', c.get('Net (paid) grain', 'bu'), 937);
  close('drying charge', c.get('Drying charge'), 180);
  close('net check', c.get('Net check'), 937 * 4.5 - 180);
});

// ---------------- storage ----------------
test('bin-capacity', () => {
  const c = calc('bin-capacity', { dia: 30, h: 20, top: 'level', bottom: 'flat', pack: '' });
  const ft3 = Math.PI * 15 * 15 * 20;
  close('level 30×20 bushels', c.get('Capacity', 'bu'), ft3 / 1.244456);
  const p = calc('bin-capacity', { dia: 30, h: 20, top: 'peak', repose: 23, bottom: 'flat', pack: '' });
  const peak = Math.PI * 225 * (15 * Math.tan(23 * Math.PI / 180)) / 3;
  close('peaked adds cone', p.get('Capacity', 'bu'), (ft3 + peak) / 1.244456);
  const f = calc('bin-capacity', { dia: 30, h: 20, top: 'funnel', repose: 23, bottom: 'flat', pack: '' });
  close('inverted cone subtracts the funnel', f.get('Capacity', 'bu'), (ft3 - peak) / 1.244456);
  close('funnel depth', f.get('Funnel depth', 'ft'), 15 * Math.tan(23 * Math.PI / 180));
  const st = initState(getCalc('bin-capacity'), US, null, null);
  Object.assign(st.values, { dia: '30', h: '3', top: 'funnel', repose: '23' });
  log(!!run(getCalc('bin-capacity'), st, US).out.error, 'funnel deeper than the grain is rejected');
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
  close('seeds per lb', c.get('Seeds per lb'), 453592 / 4.5);
  const l = calc('canola-yield', { plants: 6, pods: 60, spp: 18, tsw: 4.5, loss: 10 });
  close('with 10% loss', l.get('Estimated yield', 'buac'), lbAc * 0.9 / 50);
  const m = calc('canola-yield', { plants: 60, pods: 60, spp: 18, tsw: 4.5, loss: '' }, US, { plants: 'pm2' });
  close('plants per m² input', m.get('Plants per ft²'), 60 / 10.7639);
});
test('wheat-yield', () => {
  const c = calc('wheat-yield', { rw: 7.5, len: 3, heads: 110, kph: 25, kpl: 14000 });
  close('bu/ac', c.get('Estimated yield', 'buac'), (110 / 1.875) * 43560 * 25 / 14000 / 60);
});
test('combine-check', () => {
  const c = calc('combine-check', { crop: 'corn', wt: 15000, moist: 18, std: 15.5, method: 'area', area: 2 });
  close('dry bu/ac', c.get('Dry yield', 'buac'), 15000 * 82 / 84.5 / 56 / 2);
  const s = calc('combine-check', { crop: 'corn', wt: 15000, moist: 18, std: 15.5, method: 'strip', len: 1000, w: 30 });
  close('strip area', s.get('Area', 'ac'), 30000 / 43560);
});

// ---------------- field ops ----------------
test('field-productivity', () => {
  const c = calc('field-productivity', { w: 40, speed: 6, eff: 75, hours: 10 });
  close('theoretical', c.get('Theoretical capacity', 'ach'), 240 / 8.25);
  close('effective', c.get('Effective capacity', 'ach'), 240 / 8.25 * 0.75);
});
test('field-area', () => {
  close('rectangle ½ × ¼ mile', calc('field-area', { shape: 'rect', l: 2640, w: 1320 }).get('Area', 'ac'), 80);
  close('3-4-5 triangle', calc('field-area', { shape: 'tri', a: 300, b: 400, c: 500 }).get('Area', 'ac'), 60000 / 43560);
  close('trapezoid', calc('field-area', { shape: 'trap', t1: 1320, t2: 900, th: 1320 }).get('Area', 'ac'), 1110 * 1320 / 43560);
  close('full pivot 1300 ft', calc('field-area', { shape: 'pivot', r: 1300, arc: 360 }).get('Area', 'ac'), Math.PI * 1300 * 1300 / 43560);
  close('half pivot', calc('field-area', { shape: 'pivot', r: 1300, arc: 180 }).get('Area', 'ac'), Math.PI * 1300 * 1300 / 43560 / 2);
});
test('time-to-finish', () => {
  const c = calc('time-to-finish', { acres: 640, cap: 22, hpd: 10, machines: '' });
  close('hours', c.get('Time needed'), 640 / 22);
  close('days', c.get('Working days'), 640 / 22 / 10);
  close('two machines', calc('time-to-finish', { acres: 640, cap: 22, hpd: 10, machines: 2 }).get('Time needed'), 320 / 22);
});

// ---------------- seeding ----------------
test('seeding-rate', () => {
  const c = calc('seeding-rate', { crop: 'corn', target: 34000, germ: 95, purity: 100, seedsLb: 1600, unitSize: 80000, acres: 160 });
  close('seeds to plant', c.get('Seeds to plant', 'pac'), 34000 / 0.95);
  close('lb/ac', c.get('Seeding rate', 'lbac'), 34000 / 0.95 / 1600);
  close('units/ac', c.get('Units per acre'), 34000 / 0.95 / 80000);
  eq('whole units', c.get('Whole units to buy'), Math.ceil(34000 / 0.95 / 80000 * 160));
});
test('plant-population', () => {
  const c = calc('plant-population', { rw: 30, len: 17.42, plants: '34+33+35', counts: 3, target: 34000 });
  close('plants/ac', c.get('Population', 'pac'), 34 * 43560 / (17.42 * 2.5));
});
test('seed-cost', () => {
  close('per unit', calc('seed-cost', { mode: 'unit', price: 300, unitSize: 80000, rate: 34000, acres: '' }).get('Seed cost', 'dac'), 127.5);
  close('per lb', calc('seed-cost', { mode: 'lb', priceLb: 0.6, lbAc: 90, acres: '' }).get('Seed cost', 'dac'), 54);
});

// ---------------- spraying ----------------
test('sprayer-calibration', () => {
  close('GPA', calc('sprayer-calibration', { mode: 'gpa', gpm: 0.3, speed: 10, spacing: 20 }).get('Application rate', 'galac'), 0.3 * 5940 / 200);
  close('GPM needed', calc('sprayer-calibration', { mode: 'gpm', gpa: 15, speed: 10, spacing: 20 }).get('Nozzle flow needed', 'gpm'), 15 * 200 / 5940);
});
test('tank-mix', () => {
  const c = calc('tank-mix', { tank: 1000, gpa: 15, p1: 32, p2: '', p3: '', acres: 160 }, US, { p1: 'flozac' });
  close('acres per tank', c.get('Acres per tank', 'ac'), 1000 / 15);
  eq('product A per tank', c.get('Product A per tank'), '2,133 fl oz (16.67 gal)');
  close('tank loads', c.get('Tank loads for field'), 160 / (1000 / 15));
});

// ---------------- fertilizer ----------------
test('fertilizer-blend', () => {
  const c = calc('fertilizer-blend', { N: 150, P: 60, K: 90, psrc: 'map', nsrc: 'urea', nPrice: '', pPrice: '', kPrice: '', acres: '' });
  const map = 60 / 0.52, urea = (150 - map * 0.11) / 0.46, pot = 150;
  close('MAP lb', c.get('MAP 11-52-0', 'lbac'), map);
  close('urea lb', c.get('Urea 46-0-0', 'lbac'), urea);
  close('total', c.get('Total blend', 'lbac'), map + urea + pot);
});
test('nitrogen-rate', () => {
  const c = calc('nitrogen-rate', { prod: 'nh3', N: 160, price: 800, acres: '' });
  close('NH3 lb/ac', c.get('Product rate', 'lbac'), 160 / 0.82);
  close('$/lb N', c.get('Cost per lb N'), 0.4 / 0.82);
  close('$/ac', c.get('Cost per acre', 'dac'), 0.4 / 0.82 * 160);
  const u = calc('nitrogen-rate', { prod: 'uan28', N: 100, price: '', acres: '' });
  close('UAN28 gal/ac', u.get('Liquid rate', 'galac'), 100 / 0.28 / 10.66);
});

// ---------------- marketing ----------------
test('break-even', () => {
  const c = calc('break-even', { crop: 'corn', cost: 750, yield: 200, other: '', price: 4.5 });
  close('BE price', c.get('Break-even price', 'dbu'), 3.75);
  close('BE yield', c.get('Break-even yield', 'buac'), 750 / 4.5);
  close('return', c.get('Return over cost', 'dac'), 150);
});
test('cost-convert', () => {
  close('ac → bu', calc('cost-convert', { mode: 'ac2bu', costAc: 120, yield: 200, acres: '' }).get('Cost per bushel', 'dbu'), 0.6);
  close('bu → ac', calc('cost-convert', { mode: 'bu2ac', costBu: 0.6, yield: 200, acres: '' }).get('Cost per acre', 'dac'), 120);
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
  log(snap.steps.length >= 3 && snap.given.length >= 4, 'snapshot has given + steps');
});
test('adding one step to the notebook', () => {
  const c = calc('bin-capacity', { dia: 30, h: 20, top: 'level', bottom: 'flat', pack: '' });
  const last = c.r.out.work.length - 1;
  const snap = snapshot(c.def, c.state, US, c.r, {}, [last]);
  eq('only the chosen step', snap.steps.length, 1);
  eq('heading is the calculator', snap.title, 'Bin Volume');
  eq('subtitle names the step', snap.subtitle, 'Bushels');
  log(snap.steps[0].final, 'chosen step drawn as the final answer');
  const whole = snapshot(c.def, c.state, US, c.r, {}, null);
  eq('whole calculation keeps every step', whole.steps.length, c.r.out.work.length);
  const d = calc('grain-drying', { crop: 'corn', wet: 1000, mi: 25, mf: 15.5, loss: 0.5 });
  const water = snapshot(d.def, d.state, US, d.r, {}, [1]);   // "W × (Mi − Mf) ÷ (100 − Mf)"
  const syms = water.given.map(g => g.sym).filter(Boolean).sort().join(',');
  eq('only inputs the step uses', syms, 'Mf,Mi,W');
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
  for (const def of CALCS) for (const f of def.fields) {
    const list = unitChoices(f, 'us', null);
    if (list && list.length > 6) log(false, `${def.id}.${f.name} offers ${list.length} units`);
  }
});
test('every calculator runs on defaults (US + metric)', () => {
  for (const def of CALCS) {
    for (const s of [US, METRIC]) {
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
