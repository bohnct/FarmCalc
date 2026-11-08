// Live GPS speedometer for the Speedometer calculator. Uses the phone's GPS
// (needs location permission and https, or localhost), keeps the screen awake
// while it runs, and smooths the reading over the last few seconds.
import { h, icon } from './ui.js';
import { fromBase, defaultUnit, unitLabel } from './units.js';
import { prefs } from './store.js';
import { fmt } from './format.js';

const MPH_PER_MS = 2.2369362921;

/** Distance in metres between two GPS fixes (haversine). */
function metresBetween(a, b) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Build the GPS panel. onReading(mph) is called with each smoothed reading
 * (so the page can offer "use this speed"). Returns { el, stop }.
 */
export function gpsSpeedometer(settings, onReading) {
  // tap the unit (or the number) to step through these; the choice is remembered
  const UNITS = ['kmh', 'mph', 'ms', 'kn'];
  let unit = prefs.get('gpsUnit', null);
  if (!UNITS.includes(unit)) unit = defaultUnit('speed', settings.system);
  let lastMph = null;
  const nextUnit = () => {
    unit = UNITS[(UNITS.indexOf(unit) + 1) % UNITS.length];
    prefs.set('gpsUnit', unit);
    unitEl.textContent = unitLabel('speed', unit);
    if (lastMph !== null) big.textContent = fmt(fromBase('speed', lastMph, unit), 1);
    if (sessionN && watchId === null) summary();
  };
  const big = h('button.gps-speed', { type: 'button', 'aria-label': 'Change speed unit', on: { click: nextUnit } }, '–');
  const unitEl = h('button.gps-unit', { type: 'button', 'aria-label': 'Change speed unit', on: { click: nextUnit } }, unitLabel('speed', unit));
  const sub = h('div.gps-sub', '');
  const status = h('div.gps-status', 'Tap Start, then drive at a steady speed.');
  const btn = h('button.btn.primary', { type: 'button', on: { click: () => (watchId === null ? start() : stop()) } }, icon('fieldops'), 'Start GPS');
  const el = h('div.panel.gps-card',
    h('div.gps-head', h('b', 'GPS speed'), h('span.gps-live')),
    h('div.gps-readout', big, unitEl), sub, status, h('div.actions', btn));

  let watchId = null, last = null, wake = null;
  let samples = [];            // { t, mph } over the last few seconds
  let sessionSum = 0, sessionN = 0, sessionMax = 0;

  async function keepAwake() {
    try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
  }
  function show(mph, accuracy) {
    const now = Date.now();
    samples.push({ t: now, mph });
    samples = samples.filter(s => now - s.t < 4000);              // smooth over ~4 s
    const avg = samples.reduce((a, s) => a + s.mph, 0) / samples.length;
    sessionSum += avg; sessionN++; sessionMax = Math.max(sessionMax, avg);
    lastMph = avg;
    big.textContent = fmt(fromBase('speed', avg, unit), 1);
    sub.textContent = `Run average ${fmt(fromBase('speed', sessionSum / sessionN, unit), 1)} · top ${fmt(fromBase('speed', sessionMax, unit), 1)} ${unitLabel('speed', unit)}`;
    status.textContent = accuracy ? `GPS accuracy ±${Math.round(accuracy)} m${accuracy > 15 ? ' · weak signal, reading may jump' : ''}` : 'Reading…';
    el.classList.add('live');
    if (onReading) onReading(avg);
  }
  function onPos(p) {
    const c = p.coords;
    let mph = null;
    if (typeof c.speed === 'number' && c.speed >= 0 && !Number.isNaN(c.speed)) mph = c.speed * MPH_PER_MS;
    else if (last) {
      // no speed from the GPS chip: work it out from the distance between fixes
      const dt = (p.timestamp - last.timestamp) / 1000;
      if (dt >= 0.8) mph = metresBetween(last.coords, c) / dt * MPH_PER_MS;
    }
    if (!last || (p.timestamp - last.timestamp) >= 800) last = p;
    if (mph !== null) show(mph, c.accuracy);
    else status.textContent = `Waiting for movement… (±${Math.round(c.accuracy || 0)} m)`;
  }
  function onErr(err) {
    status.textContent = err.code === 1
      ? 'Location is off for this app. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites (or Farm Calc) → While Using.'
      : err.code === 3 ? 'Still looking for GPS… move to open sky.' : 'GPS not available right now.';
    if (err.code === 1) stop();
  }
  function start() {
    if (!('geolocation' in navigator)) { status.textContent = 'This device has no GPS access in the browser.'; return; }
    if (!window.isSecureContext) { status.textContent = 'GPS needs the app opened over https.'; return; }
    samples = []; last = null; sessionSum = 0; sessionN = 0; sessionMax = 0;
    status.textContent = 'Finding GPS…';
    watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    keepAwake();
    btn.replaceChildren(icon('close'), 'Stop');
    btn.classList.remove('primary');
  }
  function stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    try { if (wake) wake.release(); } catch { /* already released */ }
    wake = null;
    el.classList.remove('live');
    btn.replaceChildren(icon('fieldops'), 'Start GPS');
    btn.classList.add('primary');
    if (sessionN) summary();
  }
  function summary() {
    status.textContent = `Stopped · run average ${fmt(fromBase('speed', sessionSum / sessionN, unit), 1)} ${unitLabel('speed', unit)}, top ${fmt(fromBase('speed', sessionMax, unit), 1)}`;
  }
  return { el, stop };
}
