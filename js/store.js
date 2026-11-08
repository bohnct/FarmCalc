// Settings live in localStorage; notebook data (cards + drawings) lives in
// IndexedDB because drawings outgrow localStorage quickly.
import { setDecimals } from './format.js';

// ---------- Settings ----------
const SETTINGS_KEY = 'farmcalc.settings';
const DEFAULT_SETTINGS = {
  system: 'sk',          // 'sk' (Saskatchewan / prairie mix) | 'us' | 'metric'
  crop: 'wheat',         // default crop for every calculator (Settings → Default crop)
  decimals: 'auto',      // 'auto' | '0'..'4'
  currency: '$',
  paper: 'grid',         // 'grid' | 'lines' | 'blank'
  smoothing: 'medium',   // ink smoothing for pen & highlighter: 'off' | 'light' | 'medium' | 'strong'
  hidden: [],            // calculator ids hidden from the home screen (still usable via links/notebook)
  snap: 'on',            // notebook: line entries up with the ruling/grid when moved
  theme: 'night',        // 'night' | 'day' | 'auto' (follow the phone)
};

function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key, val) { try { localStorage.setItem(key, val); } catch { /* storage unavailable */ } }

export const settings = { ...DEFAULT_SETTINGS, ...safeJSON(lsGet(SETTINGS_KEY)) };
setDecimals(settings.decimals);

// One-time switch from the old corn default to wheat. Calculators whose last
// inputs were left on corn start fresh, so they open with wheat values
// (test weight, moisture, yield...). Runs once; picking corn again later sticks.
// One-time switch of the old US default to the new Sask units (calculators reopen
// with Sask starting values; saved inputs belong to the old system so they're skipped).
(function switchToSaskUnits() {
  const FLAG = 'farmcalc.migrated.saskUnits';
  if (lsGet(FLAG)) return;
  lsSet(FLAG, '1');
  if (settings.system !== 'us') return;
  settings.system = 'sk';
  lsSet(SETTINGS_KEY, JSON.stringify(settings));
})();

(function switchDefaultCropToWheat() {
  const FLAG = 'farmcalc.migrated.wheatDefault';
  if (lsGet(FLAG)) return;
  lsSet(FLAG, '1');
  if (settings.crop !== 'corn') return;
  settings.crop = 'wheat';
  lsSet(SETTINGS_KEY, JSON.stringify(settings));
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('farmcalc.inputs.')) continue;
      const saved = safeJSON(localStorage.getItem(k));
      if (saved?.v?.values?.crop === 'corn') localStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
})();

export function saveSettings(patch) {
  Object.assign(settings, patch);
  setDecimals(settings.decimals);
  lsSet(SETTINGS_KEY, JSON.stringify(settings));
}

function safeJSON(s) { try { return s ? JSON.parse(s) : {}; } catch { return {}; } }

// Small per-viewer conveniences (last inputs, recent calculators, collapsed sections)
export const prefs = {
  get(key, fallback) { const v = safeJSON(lsGet('farmcalc.' + key)); return v && 'v' in v ? v.v : fallback; },
  set(key, v) { lsSet('farmcalc.' + key, JSON.stringify({ v })); },
};

export function pushRecentCalc(id) {
  const list = prefs.get('recent', []).filter(x => x !== id);
  list.unshift(id);
  prefs.set('recent', list.slice(0, 6));
}

// ---------- IndexedDB (tiny key-value wrapper) ----------
const DB_NAME = 'farmcalc';
const STORE = 'kv';
let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function idbGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, val) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

// ---------- Notebook ----------
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const PAGE_W = 1400;
export const PAGE_H = 2000;
export const HEAD_H = 150;      // page heading band at the top of the paper
export const MARGIN_X = 110;    // left of the margin line (clears the ring holes)
export const RULE = 36;         // ruled-line spacing on lined paper
export const ROW_OFFSET = 2;    // where a card's first line starts inside a ruled row: the rule then runs just under
                                // the lowest letters (g, y, commas) and under the answer boxes, never through them
const CARD_W = 340;
const COLS = [MARGIN_X + 14, MARGIN_X + 14 + CARD_W + 20, MARGIN_X + 14 + 2 * (CARD_W + 20)];

/** Snap a card's top so its lines of writing sit on the ruled lines. */
export const GRID = 32;         // grid paper square size
const GRID_OFFSET = 0;          // each line of writing fills one grid square, between two grid lines
export function snapToRule(y) {
  if (settings.paper === 'grid') return HEAD_H + GRID_OFFSET + Math.max(0, Math.round((y - HEAD_H - GRID_OFFSET) / GRID)) * GRID;
  if (settings.paper === 'blank') return Math.round(Math.max(HEAD_H + ROW_OFFSET, y));
  return HEAD_H + ROW_OFFSET + Math.max(0, Math.round((y - HEAD_H - ROW_OFFSET) / RULE)) * RULE;
}
/** Left edge: on grid paper, line the writing up with a grid column. */
export function snapX(x) {
  return settings.paper === 'grid' ? Math.round((x + 8) / GRID) * GRID - 8 : Math.round(x);
}
/** Settings → Snap to lines (on unless turned off). */
export function snapOn() { return settings.snap !== 'off';
}

/** Rough card height (one ruled row per written line) for cards not yet measured on screen. */
export function estimateCardH(c) {
  const wrap = t => Math.max(1, Math.ceil(String(t || '').length / 26));   // ~26 handwritten chars per line
  if (c.kind === 'text') return String(c.text || '').split('\n').reduce((n, l) => n + wrap(l), 0) * RULE + 8;
  if (c.kind === 'eq') return ((c.terms?.length || 0) + 3) * RULE + 12;
  if (c.kind === 'conv') return 6 * RULE + 12;
  if (c.kind === 'num') return RULE + 12;
  // summary: title, one row per input, the answer, supporting results
  if (c.style === 'summary') return (2 + (c.given?.length || 0) + (c.results || []).filter(r => r.sum).length) * RULE + 12;
  let rows = 1 + (c.given?.length ? c.given.length + 1 : 0);
  for (const s of c.steps || []) rows += 1 + (s.f ? wrap(s.f) : 0) + (s.s && s.s !== s.f ? wrap('= ' + s.s) : 0) + wrap('= ' + s.r);
  return rows * RULE + 12;
}

function newPage(name) {
  return { id: uid(), name, created: Date.now(), cards: [], strokes: [], view: null };
}

export const notebook = {
  pages: [],
  history: [],          // every calculation ever added (snapshot), newest first
  lastPageId: null,
  ready: null,
};

let memoryOnly = false;
notebook.ready = (async () => {
  let data;
  try { data = await idbGet('notebook'); } catch { memoryOnly = true; }
  if (data && Array.isArray(data.pages)) Object.assign(notebook, data);
  if (!notebook.pages.length) {
    const p = newPage('My Notebook');
    notebook.pages.push(p);
    notebook.lastPageId = p.id;
  }
})();

let saveTimer;
export function saveNotebook(immediate) {
  clearTimeout(saveTimer);
  const run = () => {
    if (memoryOnly) return;
    const { pages, history, lastPageId } = notebook;
    idbSet('notebook', { pages, history, lastPageId }).catch(() => { memoryOnly = true; });
  };
  if (immediate) run(); else saveTimer = setTimeout(run, 400);
}
// Flush pending writes when the app is backgrounded (phones kill PWAs freely)
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNotebook(true); });

export function getPage(id) { return notebook.pages.find(p => p.id === id) || notebook.pages[0]; }

export function addPage(name) {
  const p = newPage(name || `Page ${notebook.pages.length + 1}`);
  notebook.pages.push(p);
  notebook.lastPageId = p.id;
  saveNotebook();
  return p;
}

export function deletePage(id) {
  notebook.pages = notebook.pages.filter(p => p.id !== id);
  if (!notebook.pages.length) notebook.pages.push(newPage('My Notebook'));
  if (notebook.lastPageId === id) notebook.lastPageId = notebook.pages[0].id;
  saveNotebook();
}

/** Add a calculation snapshot as a card on a page, placed near the page's current view center. */
export function addCardToPage(pageId, snap) {
  const page = getPage(pageId);
  const v = page.view;
  void v;
  // Write it below what's already on the page, like the next entry in a notebook:
  // fill the first column top to bottom, then start the next column.
  const newH = estimateCardH(snap);
  let x = COLS[0], y = HEAD_H + ROW_OFFSET;
  for (const cx of COLS) {
    const inCol = page.cards.filter(c => Math.abs(c.x - cx) < CARD_W / 2);
    const bottom = inCol.reduce((b, c) => Math.max(b, c.y + (c.h || estimateCardH(c))), HEAD_H);
    const cy = inCol.length ? bottom + RULE : HEAD_H + ROW_OFFSET;
    if (cy + newH < PAGE_H - 20) { x = cx; y = cy; break; }
  }
  y = snapToRule(y);
  const card = { ...snap, id: uid(), x, y, collapsed: false, auto: true };   // auto: placed by the app, not moved by hand yet
  page.cards.push(card);
  notebook.lastPageId = page.id;
  notebook.history.unshift({ ...snap, id: uid() });
  if (notebook.history.length > 500) notebook.history.length = 500;
  saveNotebook();
  return card;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Backup ----------
export function exportBackup() {
  return JSON.stringify({ app: 'farmcalc', version: 1, exported: new Date().toISOString(), settings, notebook: { pages: notebook.pages, history: notebook.history, lastPageId: notebook.lastPageId } }, null, 1);
}

export function importBackup(text) {
  const data = JSON.parse(text);
  if (data.app !== 'farmcalc' || !data.notebook || !Array.isArray(data.notebook.pages)) throw new Error('Not a Farm Calc backup file');
  notebook.pages = data.notebook.pages;
  notebook.history = data.notebook.history || [];
  notebook.lastPageId = data.notebook.lastPageId || notebook.pages[0]?.id;
  if (data.settings) saveSettings(data.settings);
  saveNotebook(true);
}

export function clearAll() {
  notebook.pages = [newPage('My Notebook')];
  notebook.history = [];
  notebook.lastPageId = notebook.pages[0].id;
  saveNotebook(true);
  try { Object.keys(localStorage).filter(k => k.startsWith('farmcalc.')).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
  Object.assign(settings, DEFAULT_SETTINGS);
  setDecimals(settings.decimals);
}
