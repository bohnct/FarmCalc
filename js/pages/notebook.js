// Notebook: a pannable/zoomable page of calculation cards with an ink layer
// on top for pen, highlighter, straight lines/arrows and a stroke eraser.
import { h, icon, toast, openSheet, promptSheet, confirmSheet } from '../ui.js';
import { notebook, getPage, addPage, deletePage, saveNotebook, addCardToPage, settings, prefs, uid, PAGE_W, PAGE_H, HEAD_H, MARGIN_X, snapToRule } from '../store.js';
import { renderSteps, renderSummary } from '../steps.js';
import { getCalc } from '../registry.js';
import { fmtDate, fmt, parseQty, parseNum } from '../format.js';
import { DIMS, PREF, convert, unitLabel, findUnitByLabel, needsTestWeight, UNIT_NAMES } from '../units.js';
import { CROPS } from '../crops.js';
import { inkColor } from '../theme.js';

const PEN_COLORS = ['#ffffff', '#ff7a00', '#ff4d4d', '#ffd400', '#3ddc84', '#4da3ff'];
const HL_COLORS = ['#ffe14d', '#ff7a00', '#3ddc84', '#ff5fa2', '#4da3ff'];
const WIDTHS = { pen: [2, 4, 7], hl: [14, 22, 32], line: [2, 4, 7], text: [20, 26, 34] };   // text: font size
const TEXT_SIZES = [['Small', 20], ['Medium', 26], ['Large', 34]];
// Ink smoothing (Settings → Notebook): `follow` is how far the ink moves toward the
// finger on each sample while drawing (1 = no lag); `passes` are corner-rounding
// passes applied when the stroke is finished.
const SMOOTH = {
  off: { follow: 1, passes: 0 },
  light: { follow: 0.7, passes: 1 },
  medium: { follow: 0.5, passes: 2 },
  strong: { follow: 0.32, passes: 3 },
};
const MIN_SCALE = 0.2, MAX_SCALE = 3;
const HOLD_MS = 450;     // hold an entry this long to pick it up
const DOUBLE_MS = 330;   // two taps within this = double-tap (opens options)
// New pages open showing the top-left of the paper (holes, margin and heading in view)
// (starts just below the top buttons so they don't sit over the page heading)
const DEFAULT_VIEW = () => ({ x: 6, y: 64, scale: Math.min(1, (window.innerWidth - 12) / 560) });

let cleanup = null;

export async function renderNotebook(view, query) {
  if (cleanup) { cleanup(); cleanup = null; }
  view.classList.add('full');
  await notebook.ready;

  let page = getPage(query.get('page') || notebook.lastPageId);
  notebook.lastPageId = page.id;

  // ---------- tool state ----------
  const toolOpts = Object.assign({
    pen: { color: '#ffffff', width: 4 },
    hl: { color: '#ffe14d', width: 22 },
    line: { color: '#ff7a00', width: 4, arrow: false },
    text: { color: '#ffffff', width: 26 },
  }, prefs.get('toolOpts', {}));
  let tool = prefs.get('tool', 'select');
  let undo = [], redo = [];

  // ---------- DOM ----------
  // The page heading lives on the paper itself. Tapping it opens the page menu (rename / switch / new).
  const nameEl = h('span.ph-name');
  const pageNoEl = h('div.ph-sub');
  const dateEl = h('span.ph-date-val');
  const heading = h('button.nb-head', { type: 'button', 'aria-label': 'Page heading: tap to rename or switch pages', on: { click: pageSheet } },
    h('div.ph-left', h('div.ph-title', h('div.ph-name-row', nameEl, h('span.ph-caret', icon('chev')))), pageNoEl),
    h('div.ph-date', h('span.ph-date-label', 'Date'), dateEl));
  const paper = h('div.nb-paper', { style: { width: PAGE_W + 'px', height: PAGE_H + 'px' } },
    h('div.nb-rules'),
    h('div.nb-holes', h('span'), h('span'), h('span')),
    heading);
  // CSS custom properties can't be set through the style object; use setProperty
  paper.style.setProperty('--head-h', HEAD_H + 'px');
  paper.style.setProperty('--margin-x', MARGIN_X + 'px');
  const cardsEl = h('div.nb-cards');
  const world = h('div.nb-world', paper, cardsEl);
  const canvas = h('canvas.nb-ink');
  const viewport = h('div.nb-viewport', world, canvas);
  const emptyEl = h('div.nb-empty', h('div.hand', 'Nothing here yet'), h('p', 'Open any calculator and tap “Add to Notebook”. Calculations land here as hand-worked cards you can move and mark up.'));
  const toolsEl = h('div.nb-tools');
  let popEl = null;
  const nb = h('div.nb', viewport,
    h('div.nb-top',
      h('button.icon-btn', { 'aria-label': 'New equation: add up or combine numbers on this page', title: 'Equation (sum numbers)', on: { click: () => startEq(null) } }, icon('sigma')),
      h('button.icon-btn', { 'aria-label': 'Add a number to the page (e.g. number of bins)', title: 'Add a number', on: { click: () => numberSheet(null) } }, icon('hash')),
      h('button.icon-btn', { 'aria-label': 'Convert a number on this page to another unit', title: 'Convert units', on: { click: startConvertPick } }, icon('convert')),
      h('button.icon-btn', { 'aria-label': 'Calculation history', title: 'History', on: { click: historySheet } }, icon('history')),
      h('button.icon-btn', { 'aria-label': 'Export page as image', title: 'Export image', on: { click: exportPng } }, icon('share'))),
    h('div.nb-zoom',
      // +/− only show with a mouse; on a phone you pinch to zoom (see CSS)
      h('button.zbtn', { 'aria-label': 'Zoom in', on: { click: () => zoomBy(1.25) } }, icon('plus')),
      h('button.zbtn', { 'aria-label': 'Zoom out', on: { click: () => zoomBy(0.8) } }, icon('minus')),
      h('button', { 'aria-label': 'Fit content', on: { click: fitContent } }, icon('fit'))),
    emptyEl, toolsEl);
  view.append(nb);

  // ---------- view transform ----------
  let vt = page.view ? { ...page.view } : DEFAULT_VIEW();
  const ctx2d = canvas.getContext('2d');
  let dpr = 1;

  function applyView(persist = true) {
    world.style.transform = `translate(${vt.x}px, ${vt.y}px) scale(${vt.scale})`;
    requestDraw();
    if (persist) { page.view = { ...vt }; saveNotebook(); }
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = viewport.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    requestDraw();
  }
  const toWorld = (cx, cy) => {
    const r = viewport.getBoundingClientRect();
    return { x: (cx - r.left - vt.x) / vt.scale, y: (cy - r.top - vt.y) / vt.scale };
  };
  function zoomAt(cx, cy, newScale) {
    const r = viewport.getBoundingClientRect();
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    const px = cx - r.left, py = cy - r.top;
    vt.x = px - (px - vt.x) * (s / vt.scale);
    vt.y = py - (py - vt.y) * (s / vt.scale);
    vt.scale = s;
    applyView();
  }
  function zoomBy(f) { const r = viewport.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, vt.scale * f); }
  function contentBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of cardsEl.children) {
      const c = page.cards.find(k => k.id === el.dataset.id); if (!c) continue;
      x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + el.offsetWidth); y1 = Math.max(y1, c.y + el.offsetHeight);
    }
    for (const s of page.strokes) {
      for (let i = 0; i < s.pts.length; i += 2) {
        const pad = s.width / 2;
        x0 = Math.min(x0, s.pts[i] - pad); y0 = Math.min(y0, s.pts[i + 1] - pad);
        x1 = Math.max(x1, s.pts[i] + pad); y1 = Math.max(y1, s.pts[i + 1] + pad);
      }
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }
  function fitContent() {
    // always include the top-left of the paper so the heading stays in view
    const c = contentBounds() || { x0: 0, y0: 0, x1: 700, y1: 600 };
    const b = { x0: 0, y0: 0, x1: Math.max(c.x1, 400), y1: Math.max(c.y1, HEAD_H + 200) };
    const r = viewport.getBoundingClientRect();
    const top = 64, bottom = 150, pad = 8;
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((r.width - pad * 2) / (b.x1 - b.x0), (r.height - top - bottom) / (b.y1 - b.y0), 1.2)));
    vt = { scale: s, x: pad - b.x0 * s, y: top - b.y0 * s };   // pinned left so the holes/margin stay in view
    applyView();
  }
  function centerOn(card) {
    const el = cardsEl.querySelector(`[data-id="${card.id}"]`);
    const r = viewport.getBoundingClientRect();
    vt.scale = Math.max(vt.scale, 0.9);
    vt.x = r.width / 2 - (card.x + (el?.offsetWidth || 300) / 2) * vt.scale;
    vt.y = Math.max(70, r.height / 2 - 120) - card.y * vt.scale;
    applyView();
    if (el) { el.classList.add('dragging'); setTimeout(() => el.classList.remove('dragging'), 900); }
  }

  // ---------- ink rendering ----------
  let drawQueued = false, live = null;
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; drawInk(); });
  }
  function drawInk() {
    ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.setTransform(dpr * vt.scale, 0, 0, dpr * vt.scale, dpr * vt.x, dpr * vt.y);
    for (const s of page.strokes) drawStroke(ctx2d, s);
    if (live) drawStroke(ctx2d, live);
    drawArrows(ctx2d);
  }

  // ---------- cards ----------
  // Cards are written straight onto the paper; their controls (date, collapse,
  // options) only appear when the card is tapped/selected.
  let selectedId = null;
  function selectCard(id) {
    selectedId = id;
    for (const el of cardsEl.children) el.classList.toggle('selected', el.dataset.id === id);
  }
  function renderCards() {
    cardsEl.className = 'nb-cards paper-' + (settings.paper || 'grid');
    cardsEl.replaceChildren(...page.cards.map(cardEl));
    selectCard(page.cards.some(c => c.id === selectedId) ? selectedId : null);
    markPicked();
    requestDraw();   // arrows follow the cards
    // remember real heights so new cards get written below existing ones, and
    // push down any app-placed card whose estimated spot overlaps the one above it
    requestAnimationFrame(() => {
      for (const el of cardsEl.children) {
        const c = page.cards.find(k => k.id === el.dataset.id);
        if (c && el.offsetHeight) c.h = el.offsetHeight;
      }
      let changed = false;
      const byTop = [...page.cards].sort((a, b) => a.y - b.y);
      for (const c of byTop) {
        if (!c.auto) continue;
        const above = byTop.filter(o => o !== c && o.y < c.y && Math.abs(o.x - c.x) < 170);
        const bottom = above.reduce((m, o) => Math.max(m, o.y + (o.h || 0)), 0);
        if (bottom > c.y) {
          moveCard(c, c.x, snapToRule(bottom + 36));
          const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
          if (el) el.style.top = c.y + 'px';
          changed = true;
        }
      }
      if (changed) { saveNotebook(); requestDraw(); }
    });
    nameEl.textContent = page.name;
    const idx = notebook.pages.indexOf(page);
    pageNoEl.textContent = `Page ${idx + 1} of ${notebook.pages.length} · tap to rename or switch`;
    dateEl.textContent = new Date(page.created || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    paper.className = 'nb-paper ' + (settings.paper || 'grid');
    emptyEl.style.display = page.cards.length || page.strokes.length ? 'none' : '';
  }
  function cardEl(c) {
    if (c.kind === 'eq') return eqEl(c);
    if (c.kind === 'conv') return convEl(c);
    if (c.kind === 'num') return numEl(c);
    if (c.kind === 'text') {
      // free text written anywhere on the page
      return h('div.ncard.textcard', { 'data-id': c.id, style: { left: c.x + 'px', top: c.y + 'px' } },
        h('div.ncard-head',
          h('div.nh-text', h('div.nh-date', fmtDate(c.date))),
          h('button', { 'aria-label': 'Edit text', on: { click: () => editText(c) } }, icon('edit')),
          h('button', { 'aria-label': 'Text options', on: { click: () => cardMenu(c) } }, icon('more'))),
        h('div.ncard-text', { style: { color: inkColor(c.color || '#ffffff'), fontSize: (c.size || 26) + 'px' } }, c.text));
    }
    const el = h('div.ncard' + (c.collapsed ? '.collapsed' : ''), { 'data-id': c.id, style: { left: c.x + 'px', top: c.y + 'px' } },
      h('div.ncard-head',
        h('div.nh-text', h('div.nh-date', fmtDate(c.date))),
        mainKey(c) ? h('button', { 'aria-label': 'Convert this answer to another unit', title: 'Convert', on: { click: () => openConvert({ card: c.id, key: mainKey(c) }) } }, icon('convert')) : null,
        h('button', { 'aria-label': c.collapsed ? 'Expand' : 'Collapse', on: { click: () => { c.collapsed = !c.collapsed; saveNotebook(); renderCards(); requestDraw(); } } }, icon(c.collapsed ? 'expand' : 'collapse')),
        h('button', { 'aria-label': 'Card options', on: { click: () => cardMenu(c) } }, icon('more'))),
      // summary entries show inputs + answer only; the full working lives in the calculator
      h('div.ncard-body', c.style === 'summary' ? renderSummary(c) : renderSteps(c)),
      c.note ? h('div.ncard-note', c.note) : null);
    return el;
  }
  // ---------- free text ----------
  async function createText(p) {
    const o = toolOpts.text;
    const text = await promptSheet('Write on the page', '', 'Add', { multiline: true, placeholder: 'Notes for this page…' });
    if (!text) return;
    const c = {
      id: uid(), kind: 'text', text, color: o.color, size: o.width, date: Date.now(),
      x: Math.round(clamp(p.x - 6, 4, PAGE_W - 120)), y: snapToRule(Math.max(HEAD_H, p.y - 20)),
    };
    page.cards.push(c);
    undo.push({ t: 'addcard', card: c }); redo = [];
    saveNotebook(); renderCards(); syncTools();
  }
  async function editText(c) {
    const text = await promptSheet('Edit text', c.text, 'Save', { multiline: true });
    if (text === null || text === c.text) return;
    if (!text) { removeCard(c, 'Text deleted'); return; }
    undo.push({ t: 'edit', card: c, from: c.text, to: text }); redo = [];
    c.text = text;
    saveNotebook(); renderCards(); syncTools();
  }
  function removeCard(c, msg) {
    const idx = page.cards.indexOf(c);
    const marks = page.strokes.filter(s => s.card === c.id);
    page.cards.splice(idx, 1);
    page.strokes = page.strokes.filter(s => s.card !== c.id);
    undo.push({ t: 'delcard', card: c, idx, marks }); redo = [];
    saveNotebook(); renderCards(); syncTools(); requestDraw();
    toast(msg, { label: 'Undo', fn: doUndo });
  }
  function duplicateCard(c) {
    const copy = { ...structuredClone(c), id: uid(), x: c.x + 24, y: snapToRule(c.y + 36), auto: false };
    page.cards.push(copy); undo.push({ t: 'addcard', card: copy }); redo = [];
    saveNotebook(); renderCards(); syncTools();
  }

  // ---------- equations (∑) ----------
  // An equation entry adds, subtracts, multiplies or divides numbers taken from
  // other entries on the page (or typed in). It reads those numbers fresh every
  // time it's drawn, so editing a bin's inputs updates the total automatically.
  // Terms: { op: '+'|'-'|'*'|'/', ref: { card, key } } or { op, num, unit, label }.
  // key: 'r:<result label>' | 's:<step index>' | 'eq' (another equation's answer).
  const OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  function refInfo(ref, depth = 0) {
    const c = page.cards.find(k => k.id === ref.card);
    if (!c) return { missing: true, label: 'deleted entry', q: null };
    if (c.kind === 'eq') {
      const r = evalEq(c, depth + 1);
      return { label: c.title, q: r.ok ? { value: r.value, unit: r.unit } : null };
    }
    if (c.kind === 'num') return { label: c.label || 'number', q: { value: c.value, unit: c.unit || '' } };
    if (c.kind === 'conv') {
      const r = depth > 8 ? { ok: false } : evalConv(c, depth + 1);
      return { label: c.title, q: r.ok ? { value: r.value, unit: r.unit } : null };
    }
    if (ref.key.startsWith('r:')) {
      const lab = ref.key.slice(2);
      const r = (c.results || []).find(x => x.label === lab);
      return { label: `${c.title} · ${lab}`, q: r ? parseQty(r.text) : null, missing: !r };
    }
    if (ref.key.startsWith('s:')) {
      const st = (c.steps || [])[Number(ref.key.slice(2))];
      return { label: `${c.title} · ${st ? st.label : '?'}`, q: st ? parseQty(st.r) : null, missing: !st };
    }
    return { label: c.title, q: null, missing: true };
  }
  const termInfo = (t, depth) => (t.ref ? refInfo(t.ref, depth) : { label: t.label || 'number', q: { value: t.num, unit: t.unit || '' } });

  /** Work the terms left to right, like a tally on paper. Units: + and − keep the first term's unit. */
  function evalEq(eq, depth = 0) {
    if (depth > 8) return { ok: false };          // guards against equations that use each other in a loop
    let value = 0, unit = '', mixed = false;
    for (const [i, t] of eq.terms.entries()) {
      const info = termInfo(t, depth);
      if (!info.q) return { ok: false, missing: true };
      const { value: v, unit: u } = info.q;
      if (i === 0) { value = v; unit = u; continue; }
      if (t.op === '+' || t.op === '-') {
        if (u && unit && u !== unit) mixed = true;
        if (!unit) unit = u;
        value = t.op === '+' ? value + v : value - v;
      } else if (t.op === '*') {
        value *= v;
        // a count like "bins" times a measurement like "bu" stays in bu
        if (u && unit) {
          const mu = !!findUnitByLabel(unit, settings.currency), mv = !!findUnitByLabel(u, settings.currency);
          unit = mu && !mv ? unit : (!mu && mv ? u : `${unit}·${u}`);
        } else if (u) unit = u;
      } else {
        if (v === 0) return { ok: false, div0: true };
        value /= v;
        if (u) unit = u === unit ? '' : (unit ? `${unit}/${u}` : `1/${u}`);
      }
    }
    return { ok: Number.isFinite(value), value, unit, mixed };
  }

  /** "$" units go in front ($1,250.00/bu); everything else after (11,360 bu). */
  function fmtQty(v, unit) {
    const m = /^([^\w\s%°/·]{1,3})(.*)$/.exec(unit || '');
    if (m) { const rest = m[2].trim(); return `${m[1]}${fmt(v, 2)}${rest ? (rest.startsWith('/') ? rest : ' ' + rest) : ''}`; }
    return `${fmt(v)}${unit ? ' ' + unit : ''}`;
  }

  /**
   * Line labels for an equation. When two lines would read the same
   * ("Bin Volume · Capacity" twice), tell them apart by the entry's note
   * (e.g. "Bin 3") or else its first measured input (e.g. "30 ft").
   */
  function termLabels(eq) {
    const infos = eq.terms.map(t => termInfo(t));
    const count = {};
    infos.forEach(i => { count[i.label] = (count[i.label] || 0) + 1; });
    return eq.terms.map((t, i) => {
      const base = infos[i].label;
      if (count[base] < 2 || !t.ref) return base;
      const src = page.cards.find(k => k.id === t.ref.card);
      if (!src) return base;
      const tag = (src.note || '').split('\n')[0].trim()
        || ((src.given || []).find(g => g.label !== 'Crop' && /\d/.test(g.text)) || {}).text || '';
      return tag ? base.replace(' · ', ` (${tag}) · `) : base;
    });
  }

  function eqEl(c) {
    const r = evalEq(c);
    const anyMissing = c.terms.some(t => t.ref && termInfo(t).missing);
    const labels = termLabels(c);
    return h('div.ncard.eqcard' + (selectedId === c.id ? '.selected' : ''), { 'data-id': c.id, style: { left: c.x + 'px', top: c.y + 'px' } },
      h('div.ncard-head',
        h('div.nh-text', h('div.nh-date', fmtDate(c.date))),
        h('button', { 'aria-label': 'Convert the total to another unit', title: 'Convert', on: { click: () => openConvert({ card: c.id, key: 'eq' }) } }, icon('convert')),
        h('button', { 'aria-label': 'Edit equation', on: { click: () => startEq(c) } }, icon('edit')),
        h('button', { 'aria-label': 'Equation options', on: { click: () => cardMenu(c) } }, icon('more'))),
      h('div.ncard-body', h('div.hand-steps.summary',
        h('div.hand-title', c.title),
        c.terms.map((t, i) => {
          const info = termInfo(t);
          return h('div.sum-row.eq-row', { 'data-term': String(i) },
            h('span.eq-op', i ? OPS[t.op] : ''),
            h('span.sum-label', labels[i]), h('span.sum-dots'),
            h('span.sum-val', info.q ? fmtQty(info.q.value, info.q.unit) : '?'));
        }),
        h('div.sum-answer', h('span.sum-alabel', '='), h('span.sum-dots'),
          h('span.ans.boxed', { 'data-key': 'eq' }, r.ok ? fmtQty(r.value, r.unit) : (r.div0 ? 'can’t ÷ 0' : '?'))),
        r.mixed ? h('div.eq-warn', 'units differ, check the terms') : null,
        anyMissing ? h('div.eq-warn', 'an entry used here was deleted') : null)));
  }

  // ---- pick mode: tap numbers on the page to build an equation ----
  let picking = null;    // { terms, op, editId }
  const eqBar = h('div.eq-bar');
  function startEq(existing) {
    if (picking) endEq();
    picking = { terms: existing ? structuredClone(existing.terms) : [], op: '+', editId: existing ? existing.id : null };
    if (tool !== 'select') setTool('select');
    closePop(); selectCard(null);
    nb.classList.add('picking');
    nb.append(eqBar);
    drawEqBar();
  }
  function endEq() {
    picking = null;
    nb.classList.remove('picking');
    eqBar.remove();
    cardsEl.querySelectorAll('.picked').forEach(el => el.classList.remove('picked'));
    requestDraw();
  }
  function markPicked() {
    cardsEl.querySelectorAll('.picked').forEach(el => el.classList.remove('picked'));
    if (!picking) return;
    for (const t of picking.terms) {
      if (!t.ref) continue;
      cardsEl.querySelector(`.ncard[data-id="${t.ref.card}"] [data-key="${CSS.escape(t.ref.key)}"]`)?.classList.add('picked');
    }
  }
  function drawEqBar() {
    if (!picking) return;
    if (picking.mode === 'convert') {
      eqBar.replaceChildren(
        h('div.eqb-head', h('b', 'Convert a number'), h('span.eqb-hint', 'tap any answer on the page')),
        h('div.eqb-row', h('button.btn.small', { type: 'button', style: { flex: 1 }, on: { click: endEq } }, 'Cancel')));
      return;
    }
    const T = picking.terms;
    const r = T.length ? evalEq({ terms: T }) : null;
    const expr = T.map((t, i) => { const q = termInfo(t).q; return (i ? ` ${OPS[t.op]} ` : '') + (q ? fmtQty(q.value, q.unit) : '?'); }).join('')
      + (r && r.ok && T.length > 1 ? `  =  ${fmtQty(r.value, r.unit)}` : '');
    eqBar.replaceChildren(
      h('div.eqb-head', h('b', picking.editId ? 'Edit equation' : 'New equation'),
        h('span.eqb-hint', T.length ? `${T.length} number${T.length === 1 ? '' : 's'}` : 'tap numbers on the page')),
      h('div.eqb-expr', expr || 'Tap an answer on the page to start…'),
      h('div.eqb-row',
        h('div.seg.eqb-ops', { role: 'radiogroup', 'aria-label': 'Next operation' },
          Object.keys(OPS).map(o => h('button' + (picking.op === o ? '.on' : ''), {
            type: 'button', role: 'radio', 'aria-checked': String(picking.op === o), 'aria-label': { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' }[o],
            on: { click: () => { picking.op = o; drawEqBar(); } },
          }, OPS[o]))),
        h('button.btn.small', { type: 'button', title: 'Type a number', on: { click: addTypedNumber } }, '123'),
        h('button.btn.small', { type: 'button', 'aria-label': 'Remove last number', disabled: !T.length, on: { click: () => { T.pop(); drawEqBar(); } } }, icon('undo'))),
      h('div.eqb-row',
        h('button.btn.small', { type: 'button', style: { flex: 1 }, on: { click: endEq } }, 'Cancel'),
        h('button.btn.small.primary', { type: 'button', style: { flex: 1 }, disabled: !T.length, on: { click: finishEq } }, 'Done')));
    markPicked();
  }
  function addRef(el) {
    const cardId = el.closest('.ncard')?.dataset.id;
    if (!cardId || cardId === picking.editId) return;   // an equation can't use itself
    picking.terms.push({ op: picking.terms.length ? picking.op : '+', ref: { card: cardId, key: el.dataset.key } });
    drawEqBar();
  }
  async function addTypedNumber() {
    const text = await promptSheet('Add a number', '', 'Add', { placeholder: 'e.g. 5000 bu sold' });
    if (!text || !picking) return;
    const m = /^\s*(-?[\d,]*\.?\d+)\s*(.*)$/.exec(text.replace(/−/g, '-'));
    if (!m) { toast('Start with a number, e.g. 5000 sold'); return; }
    let rest = m[2].trim(), unit = '';
    // "5000 bu sold": if the first word matches the running unit, treat it as the unit
    const running = picking.terms.length ? evalEq({ terms: picking.terms }).unit : '';
    if (running && rest.split(/\s+/)[0] === running) { unit = running; rest = rest.slice(running.length).trim(); }
    picking.terms.push({ op: picking.terms.length ? picking.op : '+', num: parseFloat(m[1].replace(/,/g, '')), unit, label: rest || 'number' });
    drawEqBar();
  }
  async function finishEq() {
    const P = picking;
    if (!P || !P.terms.length) return;
    if (P.editId) {
      const eq = page.cards.find(k => k.id === P.editId);
      if (eq) { undo.push({ t: 'eqedit', card: eq, from: eq.terms, to: P.terms }); redo = []; eq.terms = P.terms; }
      endEq(); saveNotebook(); renderCards(); syncTools();
      return;
    }
    const allPlus = P.terms.every((t, i) => !i || t.op === '+');
    endEq();
    const title = (await promptSheet('Name this equation', allPlus ? 'Total' : 'Result', 'Save')) || (allPlus ? 'Total' : 'Result');
    // place it beside the first entry it uses (or below the entries if there's no room)
    const src = P.terms.map(t => t.ref && page.cards.find(k => k.id === t.ref.card)).filter(Boolean);
    let x = MARGIN_X + 14, y = HEAD_H + 8;
    if (src.length) {
      const first = src[0];
      const w = cardsEl.querySelector(`.ncard[data-id="${first.id}"]`)?.offsetWidth || 340;
      x = first.x + w + 40; y = first.y;
      if (x > PAGE_W - 360) {
        x = first.x;
        y = Math.max(...src.map(c => c.y + (cardsEl.querySelector(`.ncard[data-id="${c.id}"]`)?.offsetHeight || 200))) + 36;
      }
    }
    const eq = { id: uid(), kind: 'eq', title, terms: P.terms, date: Date.now(), x: Math.round(clamp(x, 4, PAGE_W - 340)), y: snapToRule(y) };
    page.cards.push(eq);
    undo.push({ t: 'addcard', card: eq }); redo = [];
    saveNotebook(); renderCards(); syncTools();
    requestAnimationFrame(() => centerOn(eq));
  }

  // ---- arrows from each number an equation uses to its line in the equation ----
  function worldRect(el) {
    const r = el.getBoundingClientRect(), v = viewport.getBoundingClientRect();
    return { x: (r.left - v.left - vt.x) / vt.scale, y: (r.top - v.top - vt.y) / vt.scale, w: r.width / vt.scale, h: r.height / vt.scale };
  }
  function drawArrows(g) {
    for (const c of page.cards) {
      // equations: one arrow per number used; conversions: one arrow from their number
      const links = c.kind === 'eq' ? c.terms : c.kind === 'conv' ? [{ ref: c.ref }] : null;
      if (!links) continue;
      links.forEach((t, i) => {
        if (!t.ref) return;
        const cardNode = cardsEl.querySelector(`.ncard[data-id="${t.ref.card}"]`);
        const rowEl = cardsEl.querySelector(`.ncard[data-id="${c.id}"] [data-term="${i}"]`);
        if (!cardNode || !rowEl) return;
        const keyEl = cardNode.querySelector(`[data-key="${CSS.escape(t.ref.key)}"]`);
        const a = worldRect(keyEl && keyEl.offsetParent ? keyEl : cardNode);   // folded-away number → point at its entry
        const b = worldRect(rowEl);
        g.save();
        g.strokeStyle = g.fillStyle = '#ff7a00';
        g.globalAlpha = 0.9; g.lineWidth = 2; g.setLineDash([7, 5]); g.lineCap = 'round';
        let sx, sy = a.y + a.h / 2, ex, ey = b.y + b.h / 2, c1x, c2x;
        const overlap = !(a.x + a.w < b.x || b.x + b.w < a.x);
        if (overlap) {                       // stacked in the same column: loop out to the left
          sx = a.x - 6; ex = b.x - 4;
          c1x = Math.min(sx, ex) - 60; c2x = c1x;
        } else if (b.x > a.x) {              // equation to the right
          sx = a.x + a.w + 6; ex = b.x - 4;
          const d = Math.max(30, (ex - sx) / 2); c1x = sx + d; c2x = ex - d;
        } else {                             // equation to the left
          sx = a.x - 6; ex = b.x + b.w + 4;
          const d = Math.max(30, (sx - ex) / 2); c1x = sx - d; c2x = ex + d;
        }
        g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(c1x, sy, c2x, ey, ex, ey); g.stroke();
        // arrowhead along the curve's final direction
        g.setLineDash([]);
        const ang = Math.atan2(ey - ey, ex - c2x) || (ex >= c2x ? 0 : Math.PI);
        const L = 11;
        g.beginPath(); g.moveTo(ex, ey);
        g.lineTo(ex - L * Math.cos(ang - 0.45), ey - L * Math.sin(ang - 0.45));
        g.lineTo(ex - L * Math.cos(ang + 0.45), ey - L * Math.sin(ang + 0.45));
        g.closePath(); g.fill();
        g.restore();
      });
    }
  }

  // ---------- numbers (#) ----------
  // A plain labelled number written on the page ("Bins on the yard: 6 bins").
  // Equations and conversions can tap it like any other answer, and editing it
  // updates everything that uses it.  { kind: 'num', label, value, unit }
  function numEl(c) {
    return h('div.ncard.eqcard.numcard', { 'data-id': c.id, style: { left: c.x + 'px', top: c.y + 'px' } },
      h('div.ncard-body', h('div.hand-steps.summary',
        h('div.sum-answer.num-row', h('span.sum-alabel', c.label || 'number'), h('span.sum-dots'),
          h('span.ans.boxed', { 'data-key': 'eq' }, fmtQty(c.value, c.unit))))));
  }

  /** Add (existing = null) or edit a number entry: label, number, optional unit. */
  function numberSheet(existing) {
    openSheet(close => {
      const label = h('input.text-input', { type: 'text', maxlength: 40, placeholder: 'What is it? e.g. Bins on the yard', value: existing ? existing.label : '' });
      const value = h('input.text-input', { type: 'text', inputmode: 'decimal', placeholder: 'Number, e.g. 6', value: existing ? String(existing.value) : '' });
      const unit = h('input.text-input', { type: 'text', maxlength: 16, placeholder: 'Unit (optional), e.g. bins, bu, ac', value: existing ? (existing.unit || '') : '' });
      setTimeout(() => (existing ? value : label).focus(), 250);
      const save = () => {
        const v = parseNum(value.value);
        if (!Number.isFinite(v)) { value.focus(); toast('Enter a number'); return; }
        const patch = { label: label.value.trim() || 'Number', value: v, unit: unit.value.trim() };
        if (existing) {
          undo.push({ t: 'patch', card: existing, from: { label: existing.label, value: existing.value, unit: existing.unit }, to: patch }); redo = [];
          Object.assign(existing, patch);
        } else {
          // drop it in the middle of what's on screen, on a ruled line
          const r = viewport.getBoundingClientRect();
          const cx = (r.width / 2 - vt.x) / vt.scale, cy = (r.height / 2 - vt.y) / vt.scale;
          const c = { id: uid(), kind: 'num', ...patch, date: Date.now(), x: Math.round(clamp(cx - 150, 4, PAGE_W - 320)), y: snapToRule(Math.max(HEAD_H, cy - 18)) };
          page.cards.push(c);
          undo.push({ t: 'addcard', card: c }); redo = [];
          emptyEl.style.display = 'none';
        }
        close(); saveNotebook(); renderCards(); syncTools();
      };
      [label, value, unit].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
      return [
        h('h3', existing ? 'Edit number' : 'Add a number'),
        h('div.num-fields', label, value, unit),
        h('p.sheet-note', 'Tip: use ∑ to multiply it with another number on the page, e.g. bins × bushels per bin.'),
        h('div.row',
          h('button.btn', { type: 'button', on: { click: close } }, 'Cancel'),
          h('button.btn.primary', { type: 'button', on: { click: save } }, existing ? 'Save' : 'Add to page')),
      ];
    });
  }

  // ---------- conversions (⇄) ----------
  // A conversion entry takes one number on the page (e.g. a bushel total) and
  // writes it in another unit (e.g. metric tonnes), using the crop's test weight
  // when bushels are involved. Like equations, it re-reads its number every time,
  // so it follows edits to the bins it came from.
  // { kind: 'conv', ref: { card, key }, to: unit id, crop, tw }

  /** The key of an entry's main answer (what the ⇄ shortcut converts). */
  function mainKey(c) {
    if (c.kind === 'eq' || c.kind === 'conv' || c.kind === 'num') return 'eq';
    if (c.style === 'summary') { const p = (c.results || []).find(r => r.primary) || (c.results || [])[0]; return p ? 'r:' + p.label : null; }
    return c.steps && c.steps.length ? 's:' + (c.steps.length - 1) : null;
  }

  /** Which crop a number belongs to (for its test weight): from the entry, or the entries an equation used. */
  function cropOf(ref, depth = 0) {
    const c = page.cards.find(k => k.id === ref.card);
    if (!c || depth > 8) return settings.crop || 'wheat';
    if (c.kind === 'conv') return c.crop || settings.crop || 'wheat';
    if (c.kind === 'eq') { const t = c.terms.find(x => x.ref); return t ? cropOf(t.ref, depth + 1) : settings.crop || 'wheat'; }
    if (c.prefill && CROPS[c.prefill.crop]) return c.prefill.crop;
    const def = getCalc(c.calcId);
    if (def && def.crop) return def.crop;
    const g = (c.given || []).find(x => x.label === 'Crop');
    const hit = g && Object.entries(CROPS).find(([, v]) => v.label === g.text);
    return hit ? hit[0] : settings.crop || 'wheat';
  }

  const shortLabel = (dim, u) => unitLabel(dim, u, settings.currency).replace(/\s*\(.*\)$/, '');

  function evalConv(c, depth = 0) {
    const src = refInfo(c.ref, depth).q;
    if (!src) return { ok: false };
    const fu = findUnitByLabel(src.unit, settings.currency);
    if (!fu || !DIMS[fu.dim].units[c.to]) return { ok: false, badUnit: true };
    const ctx = { tw: c.tw || CROPS[c.crop || settings.crop || 'wheat'].tw };
    const value = convert(fu.dim, src.value, fu.unit, c.to, ctx);
    return { ok: Number.isFinite(value), value, unit: shortLabel(fu.dim, c.to), src, fu, ctx, factor: convert(fu.dim, 1, fu.unit, c.to, ctx) };
  }

  function convEl(c) {
    const r = evalConv(c);
    const info = refInfo(c.ref);
    const rows = [h('div.sum-row.eq-row', { 'data-term': '0' }, h('span.sum-label', info.label), h('span.sum-dots'),
      h('span.sum-val', info.q ? fmtQty(info.q.value, info.q.unit) : '?'))];
    if (r.ok && needsTestWeight(r.fu.dim, r.fu.unit, c.to)) {
      rows.push(h('div.sum-row', h('span.sum-label', `test weight (${CROPS[c.crop]?.label || 'crop'})`), h('span.sum-dots'), h('span.sum-val', `${fmt(r.ctx.tw)} lb/bu`)));
    }
    if (r.ok) {
      rows.push(h('div.sum-row', h('span.sum-label', 'rate'), h('span.sum-dots'),
        h('span.sum-val', `1 ${shortLabel(r.fu.dim, r.fu.unit)} = ${fmt(r.factor, r.factor < 1 ? 5 : 3)} ${r.unit}`)));
    }
    return h('div.ncard.eqcard.convcard' + (selectedId === c.id ? '.selected' : ''), { 'data-id': c.id, style: { left: c.x + 'px', top: c.y + 'px' } },
      h('div.ncard-head',
        h('div.nh-text', h('div.nh-date', fmtDate(c.date))),
        h('button', { 'aria-label': 'Change conversion', on: { click: () => openConvert(c.ref, c) } }, icon('edit')),
        h('button', { 'aria-label': 'Conversion options', on: { click: () => cardMenu(c) } }, icon('more'))),
      h('div.ncard-body', h('div.hand-steps.summary',
        h('div.hand-title', c.title),
        rows,
        h('div.sum-answer', h('span.sum-alabel', '='), h('span.sum-dots'),
          h('span.ans.boxed', { 'data-key': 'eq' }, r.ok ? fmtQty(r.value, r.unit) : '?')),
        !r.ok && r.badUnit ? h('div.eq-warn', 'this number’s unit changed; tap ✎ to pick a new unit') : null,
        info.missing ? h('div.eq-warn', 'the entry this came from was deleted') : null)));
  }

  /** The convert sheet: pick a unit; crop & test weight appear when bushels are involved. */
  function openConvert(ref, existing) {
    const q = refInfo(ref).q;
    const fu = q && findUnitByLabel(q.unit, settings.currency);
    if (!fu) { toast(q ? `“${q.unit || 'no unit'}” can’t be converted` : 'That number can’t be read'); return; }
    const pref = PREF[fu.dim] || {};
    const targets = Object.keys(DIMS[fu.dim].units).filter(u => u !== fu.unit && !(fu.dim === 'grain' && u === 'cwt' && fu.unit !== 'cwt'));
    const st = {
      to: existing?.to || (fu.unit === 'bu' ? 't' : fu.unit === 'buac' ? 'tha' : (pref.us === fu.unit ? pref.metric : pref.us)) || targets[0],
      crop: existing?.crop || cropOf(ref),
    };
    if (!targets.includes(st.to)) st.to = targets[0];
    st.tw = existing?.tw || CROPS[st.crop].tw;
    openSheet(close => {
      const unitsEl = h('div.conv-units'), twEl = h('div.conv-tw'), preview = h('div.conv-preview');
      const value = () => convert(fu.dim, q.value, fu.unit, st.to, { tw: st.tw });
      const drawPreview = () => { preview.textContent = `${fmtQty(q.value, q.unit)}  =  ${fmtQty(value(), shortLabel(fu.dim, st.to))}`; };
      const drawUnits = () => unitsEl.replaceChildren(...targets.map(u => h('button.conv-unit' + (st.to === u ? '.on' : ''), {
        type: 'button', on: { click: () => { st.to = u; drawUnits(); drawTw(); drawPreview(); } },
      }, h('b', shortLabel(fu.dim, u)), h('small', UNIT_NAMES[u] || ''))));
      const drawTw = () => {
        if (!needsTestWeight(fu.dim, fu.unit, st.to)) { twEl.replaceChildren(); return; }
        const twInput = h('input.text-input', {
          type: 'text', inputmode: 'decimal', value: String(st.tw), 'aria-label': 'Test weight in lb per bushel',
          on: { input: e => { const v = parseNum(e.target.value); if (v > 0) { st.tw = v; drawPreview(); } } },
        });
        twEl.replaceChildren(
          h('div.ts-label', 'Crop'),
          h('div.conv-crops', Object.entries(CROPS).map(([id, cr]) => h('button.chip' + (st.crop === id ? '.on' : ''), {
            type: 'button', on: { click: () => { st.crop = id; st.tw = cr.tw; drawTw(); drawPreview(); } },
          }, cr.label))),
          h('div.conv-twrow', h('span', 'Test weight'), twInput, h('span.conv-twunit', 'lb/bu')));
      };
      drawUnits(); drawTw(); drawPreview();
      const save = () => {
        const name = UNIT_NAMES[st.to] || shortLabel(fu.dim, st.to);
        const patch = { to: st.to, crop: st.crop, tw: st.tw };
        if (existing) {
          const from = { to: existing.to, crop: existing.crop, tw: existing.tw, title: existing.title };
          Object.assign(existing, patch, { title: existing.titleSet ? existing.title : `${refInfo(ref).label.split(' · ')[0]} in ${name}` });
          undo.push({ t: 'patch', card: existing, from, to: { ...patch, title: existing.title } }); redo = [];
        } else {
          const pos = placeNear([ref.card], 4);
          const c = { id: uid(), kind: 'conv', ref, ...patch, title: `${refInfo(ref).label.split(' · ')[0]} in ${name}`, date: Date.now(), ...pos };
          page.cards.push(c);
          undo.push({ t: 'addcard', card: c }); redo = [];
          requestAnimationFrame(() => centerOn(c));
        }
        close(); saveNotebook(); renderCards(); syncTools();
      };
      return [
        h('h3', `Convert ${fmtQty(q.value, q.unit)}`),
        h('div.ts-label', 'To'), unitsEl, twEl, preview,
        h('div.row',
          h('button.btn', { type: 'button', on: { click: close } }, 'Close'),
          h('button.btn.primary', { type: 'button', on: { click: save } }, existing ? 'Update' : 'Add to page')),
      ];
    });
  }

  /** A free spot beside the given entries (to their right, else below), clear of other entries. */
  function placeNear(cardIds, rows) {
    const src = cardIds.map(id => page.cards.find(k => k.id === id)).filter(Boolean);
    const sizeOf = c => { const el = cardsEl.querySelector(`.ncard[data-id="${c.id}"]`); return { w: el?.offsetWidth || 340, h: el?.offsetHeight || 200 }; };
    let x = MARGIN_X + 14, y = HEAD_H + 8;
    if (src.length) {
      x = src[0].x + sizeOf(src[0]).w + 40; y = src[0].y;
      if (x > PAGE_W - 420) { x = src[0].x; y = Math.max(...src.map(c => c.y + sizeOf(c).h)) + 36; }
    }
    const H = (rows + 2) * 36;
    // step down past anything already there
    for (let guard = 0; guard < 50; guard++) {
      const hit = page.cards.find(o => o.x < x + 400 && x < o.x + sizeOf(o).w && o.y < y + H && y < o.y + sizeOf(o).h);
      if (!hit) break;
      y = hit.y + sizeOf(hit).h + 36;
    }
    return { x: Math.round(clamp(x, 4, PAGE_W - 400)), y: snapToRule(y) };
  }

  function startConvertPick() {
    if (picking) endEq();
    picking = { mode: 'convert', terms: [], editId: null };
    if (tool !== 'select') setTool('select');
    closePop(); selectCard(null);
    nb.classList.add('picking');
    nb.append(eqBar);
    drawEqBar();
  }

  /** Size (Small/Medium/Large) and color for one text note; changes apply right away and can be undone. */
  function textStyleControls(c) {
    const wrap = h('div.text-style');
    const restyle = patch => {
      const from = { size: c.size || 26, color: c.color || '#ffffff' };
      Object.assign(c, patch);
      undo.push({ t: 'style', card: c, from, to: { size: c.size, color: c.color } }); redo = [];
      saveNotebook(); renderCards(); syncTools(); draw();
    };
    const draw = () => wrap.replaceChildren(
      h('div.ts-label', 'Size'),
      h('div.seg', TEXT_SIZES.map(([name, w]) => h('button' + ((c.size || 26) === w ? '.on' : ''), { type: 'button', on: { click: () => restyle({ size: w }) } }, name))),
      h('div.ts-label', 'Color'),
      h('div.ts-swatches', PEN_COLORS.map(col => h('button.sw' + ((c.color || '#ffffff') === col ? '.on' : ''), {
        type: 'button', 'aria-label': `Color ${col}`, style: { background: inkColor(col) }, on: { click: () => restyle({ color: col }) },
      }))));
    draw();
    return wrap;
  }

  function cardMenu(c) {
    if (c.kind === 'num') {
      openSheet(close => [
        h('h3', `${c.label || 'Number'}: ${fmtQty(c.value, c.unit)}`),
        h('button.list-item', { on: { click: () => { close(); numberSheet(c); } } }, icon('edit'), h('div.li-main', h('div.li-title', 'Edit number'), h('div.li-sub', 'Equations using it update'))),
        c.unit && findUnitByLabel(c.unit, settings.currency) ? h('button.list-item', { on: { click: () => { close(); openConvert({ card: c.id, key: 'eq' }); } } }, icon('convert'), h('div.li-main', h('div.li-title', 'Convert'))) : null,
        h('button.list-item', { on: { click: () => { close(); duplicateCard(c); } } }, icon('dup'), h('div.li-main', h('div.li-title', 'Duplicate'))),
        h('button.list-item', { on: { click: () => { close(); removeCard(c, 'Number deleted'); } } }, icon('trash'), h('div.li-main', h('div.li-title', { style: { color: 'var(--danger)' } }, 'Delete number'))),
      ]);
      return;
    }
    if (c.kind === 'conv') {
      openSheet(close => [
        h('h3', c.title),
        h('button.list-item', { on: { click: () => { close(); openConvert(c.ref, c); } } }, icon('edit'), h('div.li-main', h('div.li-title', 'Change unit or test weight'))),
        h('button.list-item', {
          on: { click: async () => { close(); const t = await promptSheet('Rename conversion', c.title, 'Save'); if (t) { c.title = t; c.titleSet = true; saveNotebook(); renderCards(); } } },
        }, icon('note'), h('div.li-main', h('div.li-title', 'Rename'))),
        h('button.list-item', { on: { click: () => { close(); removeCard(c, 'Conversion deleted'); } } }, icon('trash'), h('div.li-main', h('div.li-title', { style: { color: 'var(--danger)' } }, 'Delete conversion'))),
      ]);
      return;
    }
    if (c.kind === 'eq') {
      openSheet(close => [
        h('h3', c.title),
        h('button.list-item', { on: { click: () => { close(); startEq(c); } } }, icon('edit'), h('div.li-main', h('div.li-title', 'Edit equation'), h('div.li-sub', 'Add or remove numbers, change + − × ÷'))),
        h('button.list-item', { on: { click: () => { close(); openConvert({ card: c.id, key: 'eq' }); } } }, icon('convert'), h('div.li-main', h('div.li-title', 'Convert total'), h('div.li-sub', 'e.g. bushels to metric tonnes'))),
        h('button.list-item', {
          on: { click: async () => { close(); const t = await promptSheet('Rename equation', c.title, 'Save'); if (t) { c.title = t; saveNotebook(); renderCards(); } } },
        }, icon('note'), h('div.li-main', h('div.li-title', 'Rename'))),
        h('button.list-item', { on: { click: () => { close(); duplicateCard(c); } } }, icon('dup'), h('div.li-main', h('div.li-title', 'Duplicate'))),
        h('button.list-item', { on: { click: () => { close(); removeCard(c, 'Equation deleted'); } } }, icon('trash'), h('div.li-main', h('div.li-title', { style: { color: 'var(--danger)' } }, 'Delete equation'))),
      ]);
      return;
    }
    if (c.kind === 'text') {
      openSheet(close => [
        h('h3', 'Text'),
        h('button.list-item', { on: { click: () => { close(); editText(c); } } }, icon('edit'), h('div.li-main', h('div.li-title', 'Edit text'))),
        textStyleControls(c),
        h('button.list-item', { on: { click: () => { close(); duplicateCard(c); } } }, icon('dup'), h('div.li-main', h('div.li-title', 'Duplicate'))),
        h('button.list-item', { on: { click: () => { close(); removeCard(c, 'Text deleted'); } } }, icon('trash'), h('div.li-main', h('div.li-title', { style: { color: 'var(--danger)' } }, 'Delete text'))),
      ]);
      return;
    }
    openSheet(close => [
      h('h3', c.title),
      mainKey(c) ? h('button.list-item', { on: { click: () => { close(); openConvert({ card: c.id, key: mainKey(c) }); } } },
        icon('convert'), h('div.li-main', h('div.li-title', 'Convert answer'), h('div.li-sub', 'e.g. bushels to metric tonnes'))) : null,
      h('button.list-item', { on: { click: () => { close(); c.collapsed = !c.collapsed; saveNotebook(); renderCards(); } } },
        icon(c.collapsed ? 'expand' : 'collapse'), h('div.li-main', h('div.li-title', c.collapsed ? 'Expand' : 'Collapse'), h('div.li-sub', c.collapsed ? 'Show the whole entry' : 'Show just the answer'))),
      // Edit inputs: opens the calculator with this entry's values; "Update" there rewrites this entry in place
      h('button.list-item', { on: { click: () => { close(); location.hash = `#/calc/${c.calcId}?p=${encodeURIComponent(JSON.stringify(c.prefill || {}))}&edit=${page.id}~${c.id}`; } } },
        icon('edit'), h('div.li-main', h('div.li-title', 'Edit inputs'), h('div.li-sub', 'Change a value (e.g. a measured diameter) and update this entry'))),
      h('button.list-item', { on: { click: () => { close(); location.hash = `#/calc/${c.calcId}?p=${encodeURIComponent(JSON.stringify(c.prefill || {}))}`; } } },
        icon('calc'), h('div.li-main', h('div.li-title', 'Open as a new calculation'), h('div.li-sub', 'Starts from these inputs; this entry stays as is'))),
      h('button.list-item', {
        on: {
          click: async () => {
            close();
            const note = await promptSheet(c.note ? 'Edit note' : 'Add a note', c.note || '', 'Save');
            if (note !== null) { c.note = note; saveNotebook(); renderCards(); }
          },
        },
      }, icon('note'), h('div.li-main', h('div.li-title', c.note ? 'Edit note' : 'Add a note'))),
      h('button.list-item', {
        on: {
          click: () => {
            close();
            const copy = { ...structuredClone(c), id: uid(), x: c.x + 24, y: c.y + 24 };
            page.cards.push(copy); undo.push({ t: 'addcard', card: copy }); redo = [];
            saveNotebook(); renderCards(); syncTools();
          },
        },
      }, icon('dup'), h('div.li-main', h('div.li-title', 'Duplicate'))),
      h('button.list-item', {
        on: {
          click: () => {
            close();
            const idx = page.cards.indexOf(c);
            const marks = page.strokes.filter(s => s.card === c.id);
            page.cards.splice(idx, 1);
            page.strokes = page.strokes.filter(s => s.card !== c.id);
            undo.push({ t: 'delcard', card: c, idx, marks }); redo = [];
            saveNotebook(); renderCards(); syncTools(); requestDraw();
            toast('Card deleted', { label: 'Undo', fn: doUndo });
          },
        },
      }, icon('trash'), h('div.li-main', h('div.li-title', { style: { color: 'var(--danger)' } }, 'Delete card'))),
    ]);
  }

  // ---------- pointer handling ----------
  const pointers = new Map();
  let mode = null;    // 'pan' | 'drag' | 'draw' | 'erase' | 'pinch'
  let start = null;

  function onDown(e) {
    // building an equation: a tap on any answer adds it
    if (picking) {
      const k = e.target.closest('[data-key]');
      if (k && k.closest('.ncard')) {
        e.preventDefault();
        if (picking.mode === 'convert') { const ref = { card: k.closest('.ncard').dataset.id, key: k.dataset.key }; endEq(); openConvert(ref); }
        else addRef(k);
        return;
      }
    }
    if (e.target.closest('button, a, input, select')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { viewport.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    closePop();
    if (pointers.size === 2) {
      // second finger: switch to pinch/pan (drop a stroke that just started)
      if (mode === 'draw' && live && live.pts.length < 12) live = null;
      else if (mode === 'draw') commitLive();
      if (mode === 'drag') endDrag();
      if (mode === 'press') clearTimeout(start.timer);
      const [a, b] = [...pointers.values()];
      mode = 'pinch';
      start = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vt: { ...vt } };
      requestDraw();
      return;
    }
    if (pointers.size > 2) return;
    const p = toWorld(e.clientX, e.clientY);
    if (tool === 'select' || tool === 'text') {
      const cardNode = e.target.closest('.ncard');
      const c = cardNode && page.cards.find(k => k.id === cardNode.dataset.id);
      if (c && (tool === 'select' || c.kind === 'text')) {
        // Touching an entry doesn't grab it. Moving pans the page; holding still
        // picks it up (liftCard); a quick tap is a tap (double-tap = options).
        mode = 'press';
        start = { card: c, el: cardNode, x: e.clientX, y: e.clientY, vt: { ...vt }, p, textTool: tool === 'text' };
        start.timer = setTimeout(liftCard, HOLD_MS);
      } else if (tool === 'select') {
        mode = 'pan';
        start = { x: e.clientX, y: e.clientY, vt: { ...vt } };
      } else {
        // decided on release: a tap on the paper writes, a drag pans
        mode = 'textTap';
        start = { x: e.clientX, y: e.clientY, vt: { ...vt }, p, cardNode: node };
      }
    } else if (tool === 'eraser') {
      mode = 'erase';
      start = { removed: [] };
      eraseAt(p);
    } else {
      mode = 'draw';
      const o = toolOpts[tool];
      const pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : null;
      live = { id: uid(), tool, color: o.color, width: o.width, pts: [r1(p.x), r1(p.y)] };
      if (pressure !== null) live.pr = [r2(pressure)];
      if (tool === 'line') { live.pts.push(r1(p.x), r1(p.y)); live.arrow = !!o.arrow; }
      requestDraw();
    }
    e.preventDefault();
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = viewport.getBoundingClientRect();
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.vt.scale * dist / start.dist));
      const wx = (start.cx - r.left - start.vt.x) / start.vt.scale;
      const wy = (start.cy - r.top - start.vt.y) / start.vt.scale;
      vt = { scale: s, x: cx - r.left - wx * s, y: cy - r.top - wy * s };
      applyView(false);
    } else if (mode === 'press') {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
        clearTimeout(start.timer);
        mode = 'pan';
        start = { x: start.x, y: start.y, vt: start.vt };
        vt.x = start.vt.x + (e.clientX - start.x);
        vt.y = start.vt.y + (e.clientY - start.y);
        applyView(false);
      }
    } else if (mode === 'textTap') {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) mode = 'pan';
    } else if (mode === 'pan') {
      vt.x = start.vt.x + (e.clientX - start.x);
      vt.y = start.vt.y + (e.clientY - start.y);
      applyView(false);
    } else if (mode === 'drag') {
      const p = toWorld(e.clientX, e.clientY);
      const c = start.card;
      moveCard(c, Math.round(clamp(p.x - start.ox, -100, PAGE_W - 60)), Math.round(clamp(p.y - start.oy, -20, PAGE_H - 40)));
      start.el.style.left = c.x + 'px'; start.el.style.top = c.y + 'px';
      requestDraw();
    } else if (mode === 'erase') {
      const evs = coalesced(e);
      for (const ev of evs) eraseAt(toWorld(ev.clientX, ev.clientY));
    } else if (mode === 'draw' && live) {
      if (live.tool === 'line') {
        const p = toWorld(e.clientX, e.clientY);
        live.pts[2] = r1(p.x); live.pts[3] = r1(p.y);
      } else {
        const evs = coalesced(e);
        const follow = SMOOTH[settings.smoothing || 'medium'].follow;
        for (const ev of evs) {
          const raw = toWorld(ev.clientX, ev.clientY);
          live.raw = raw;
          // stabilizer: the ink follows the finger part of the way, ironing out jitter
          const n = live.pts.length;
          const p = { x: live.pts[n - 2] + (raw.x - live.pts[n - 2]) * follow, y: live.pts[n - 1] + (raw.y - live.pts[n - 1]) * follow };
          if (Math.hypot(p.x - live.pts[n - 2], p.y - live.pts[n - 1]) * vt.scale < 1.5) continue;
          live.pts.push(r1(p.x), r1(p.y));
          if (live.pr) live.pr.push(r2(ev.pressure || 0.5));
        }
      }
      requestDraw();
    }
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (mode === 'pinch') {
      if (pointers.size === 0) { mode = null; applyView(); }
      else if (pointers.size === 1) {
        // continue as a pan with the remaining finger
        const [rest] = [...pointers.values()];
        mode = 'pan'; start = { x: rest.x, y: rest.y, vt: { ...vt } };
      }
      return;
    }
    if (pointers.size) return;
    if (mode === 'pan') applyView();
    else if (mode === 'press') {
      clearTimeout(start.timer);
      if (e.type !== 'pointercancel') tapCard(start);
    } else if (mode === 'drag') endDrag();
    else if (mode === 'textTap') {
      const c = start.cardNode && page.cards.find(k => k.id === start.cardNode.dataset.id);
      if (c && c.kind === 'text') editText(c);
      else if (!c) createText(start.p);
    } else if (mode === 'erase') {
      if (start.removed.length) { undo.push({ t: 'erase', items: start.removed }); redo = []; saveNotebook(); syncTools(); }
    } else if (mode === 'draw') commitLive();
    mode = null;
  }

  // Hold still on an entry for HOLD_MS to pick it up (then drag it); two taps
  // within DOUBLE_MS open its options. A plain drag always pans the page.
  function liftCard() {
    if (mode !== 'press') return;
    const { card: c, el, p } = start;
    mode = 'drag';
    start = { card: c, el, ox: p.x - c.x, oy: p.y - c.y, from: { x: c.x, y: c.y } };
    el.classList.add('dragging');
    cardsEl.append(el);                               // bring to front
    page.cards.splice(page.cards.indexOf(c), 1); page.cards.push(c);
    // small buzz to say "picked up" (Android; browsers only allow it after a real touch)
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(12); } catch { /* not supported */ }
  }
  let lastTap = null;
  function tapCard(st) {
    const c = st.card;
    if (st.textTool) { editText(c); return; }        // Text tool: a tap edits the text
    const now = Date.now();
    if (lastTap && lastTap.id === c.id && now - lastTap.t < DOUBLE_MS) { lastTap = null; cardMenu(c); return; }
    lastTap = { id: c.id, t: now };
    // a lone tap: remind how entries work (only the first few times)
    setTimeout(() => {
      if (!lastTap || lastTap.id !== c.id || lastTap.t !== now) return;
      const shown = prefs.get('tapHint', 0);
      if (shown < 3) { prefs.set('tapHint', shown + 1); toast('Double-tap for options · hold to move'); }
    }, DOUBLE_MS + 20);
  }

  function endDrag() {
    const c = start.card;
    start.el.classList.remove('dragging');
    if (c.x !== start.from.x || c.y !== start.from.y) {
      // settle the writing onto the ruled lines; it's now where the user put it
      c.auto = false;
      moveCard(c, c.x, snapToRule(c.y));
      start.el.style.top = c.y + 'px';
      requestDraw();
    }
    if (c.x !== start.from.x || c.y !== start.from.y) { undo.push({ t: 'move', id: c.id, from: start.from, to: { x: c.x, y: c.y } }); redo = []; syncTools(); }
    saveNotebook();
  }

  // Marks that start on a card belong to it and travel with it when it moves
  function moveCard(c, x, y) {
    const dx = x - c.x, dy = y - c.y;
    if (!dx && !dy) return;
    c.x = x; c.y = y;
    for (const s of page.strokes) {
      if (s.card !== c.id) continue;
      for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] = r1(s.pts[i] + dx); s.pts[i + 1] = r1(s.pts[i + 1] + dy); }
    }
  }
  function cardAt(x, y) {
    const els = [...cardsEl.children].reverse();   // topmost first
    for (const el of els) {
      const c = page.cards.find(k => k.id === el.dataset.id);
      if (c && x >= c.x && x <= c.x + el.offsetWidth && y >= c.y && y <= c.y + el.offsetHeight) return c;
    }
    return null;
  }

  function commitLive() {
    if (!live) return;
    const s = live; live = null;
    if (s.tool === 'line' && Math.hypot(s.pts[2] - s.pts[0], s.pts[3] - s.pts[1]) < 3) { requestDraw(); return; }
    if (s.tool === 'pen' || s.tool === 'hl') {
      // finish exactly where the finger lifted, then round off the corners
      if (s.raw) {
        const n = s.pts.length;
        if (Math.hypot(s.raw.x - s.pts[n - 2], s.raw.y - s.pts[n - 1]) > 0.5) {
          s.pts.push(r1(s.raw.x), r1(s.raw.y));
          if (s.pr) s.pr.push(s.pr[s.pr.length - 1]);
        }
      }
      Object.assign(s, smoothStroke(s.pts, s.pr, SMOOTH[settings.smoothing || 'medium'].passes));
    }
    delete s.raw;
    const owner = cardAt(s.pts[0], s.pts[1]);
    if (owner) s.card = owner.id;
    page.strokes.push(s);
    undo.push({ t: 'add', s }); redo = [];
    emptyEl.style.display = 'none';
    saveNotebook(); syncTools(); requestDraw();
  }

  function eraseAt(p) {
    const rad = 10 / vt.scale;
    for (let i = page.strokes.length - 1; i >= 0; i--) {
      const s = page.strokes[i];
      if (hitStroke(s, p, rad + s.width / 2)) {
        page.strokes.splice(i, 1);
        start.removed.push({ s, idx: i });
      }
    }
    requestDraw();
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, vt.scale * Math.exp(-e.deltaY * 0.01));
    else { vt.x -= e.deltaX; vt.y -= e.deltaY; applyView(); }
  }

  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  // iOS Safari: stop the page itself from pinch-zooming
  const stopGesture = e => e.preventDefault();
  document.addEventListener('gesturestart', stopGesture);
  window.addEventListener('resize', resize);
  // switching Day/Night repaints ink and text notes in the right colors
  const onTheme = () => { renderCards(); requestDraw(); buildTools(); };
  window.addEventListener('themechange', onTheme);

  // ---------- undo / redo ----------
  function apply(a, reverse) {
    if (a.t === 'add') {
      if (reverse) page.strokes.splice(page.strokes.indexOf(a.s), 1); else page.strokes.push(a.s);
    } else if (a.t === 'erase') {
      if (reverse) [...a.items].sort((x, y) => x.idx - y.idx).forEach(it => page.strokes.splice(Math.min(it.idx, page.strokes.length), 0, it.s));
      else a.items.forEach(it => { const i = page.strokes.indexOf(it.s); if (i >= 0) page.strokes.splice(i, 1); });
    } else if (a.t === 'clear') {
      page.strokes = reverse ? a.strokes.slice() : [];
    } else if (a.t === 'move') {
      const c = page.cards.find(k => k.id === a.id);
      if (c) { const to = reverse ? a.from : a.to; moveCard(c, to.x, to.y); }
    } else if (a.t === 'delcard') {
      // a deleted card takes its own marks with it
      if (reverse) { page.cards.splice(Math.min(a.idx, page.cards.length), 0, a.card); page.strokes.push(...(a.marks || [])); }
      else { page.cards.splice(page.cards.indexOf(a.card), 1); page.strokes = page.strokes.filter(s => s.card !== a.card.id); }
    } else if (a.t === 'addcard') {
      if (reverse) page.cards.splice(page.cards.indexOf(a.card), 1); else page.cards.push(a.card);
    } else if (a.t === 'patch') {
      Object.assign(a.card, reverse ? a.from : a.to);
    } else if (a.t === 'eqedit') {
      a.card.terms = reverse ? a.from : a.to;
    } else if (a.t === 'edit') {
      a.card.text = reverse ? a.from : a.to;
    } else if (a.t === 'style') {
      Object.assign(a.card, reverse ? a.from : a.to);
    }
  }
  function doUndo() { const a = undo.pop(); if (!a) return; apply(a, true); redo.push(a); afterHistory(); }
  function doRedo() { const a = redo.pop(); if (!a) return; apply(a, false); undo.push(a); afterHistory(); }
  function afterHistory() { saveNotebook(); renderCards(); requestDraw(); syncTools(); }

  // ---------- toolbar ----------
  const TOOLS = [
    ['select', 'hand', 'Move & pan'], ['pen', 'pen', 'Pen'], ['hl', 'marker', 'Highlighter'],
    ['line', 'line', 'Line'], ['text', 'text', 'Text'], ['eraser', 'eraser', 'Eraser'],
  ];
  let undoBtn, redoBtn;
  // The toolbar can fold down to just the active tool + an expand button, to free up the page.
  let toolsFolded = prefs.get('toolsFolded', false);
  function buildTools() {
    toolsEl.replaceChildren();
    toolsEl.classList.toggle('folded', toolsFolded);
    const foldBtn = h('button.fold', {
      'aria-label': toolsFolded ? 'Show all tools' : 'Hide tools', title: toolsFolded ? 'Show all tools' : 'Hide tools',
      on: { click: () => { toolsFolded = !toolsFolded; prefs.set('toolsFolded', toolsFolded); closePop(); buildTools(); } },
    }, icon(toolsFolded ? 'expandTools' : 'foldTools'));
    for (const [id, ic, label] of TOOLS) {
      const on = tool === id;
      if (toolsFolded && !on) continue;
      toolsEl.append(h('button' + (on ? '.on' : ''), {
        'aria-label': on && toolOpts[id] ? `${label} (tap again for color & size)` : label,
        title: on && toolOpts[id] ? `${label}: tap again for color & size` : label, 'aria-pressed': String(on),
        on: { click: () => { if (tool === id && toolOpts[id]) togglePop(); else setTool(id); } },
      }, icon(ic), on && toolOpts[id] ? h('i.tdot') : null));
    }
    undoBtn = h('button', { 'aria-label': 'Undo', title: 'Undo', on: { click: doUndo } }, icon('undo'));
    redoBtn = h('button', { 'aria-label': 'Redo', title: 'Redo', on: { click: doRedo } }, icon('redo'));
    if (toolsFolded) toolsEl.append(undoBtn, foldBtn);
    else toolsEl.append(h('span.sep'), undoBtn, redoBtn, foldBtn);
    syncTools();
  }
  function syncTools() {
    // ink tools write over the cards; Move and Text let you tap the cards themselves
    nb.classList.toggle('drawing', tool !== 'select' && tool !== 'text');
    const dot = toolsEl.querySelector('.tdot');
    if (dot && toolOpts[tool]) dot.style.background = toolOpts[tool].color;
    undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length;
  }
  function setTool(id) { tool = id; prefs.set('tool', id); closePop(); if (id !== 'select') selectCard(null); buildTools(); }
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function togglePop() {
    if (popEl) { closePop(); return; }
    if (!toolOpts[tool]) setTool('pen');
    const o = toolOpts[tool];
    const colors = tool === 'hl' ? HL_COLORS : PEN_COLORS;
    const save = () => { prefs.set('toolOpts', toolOpts); syncTools(); };
    const build = () => {
      // (filter: parts that don't apply to this tool are null, which the browser would print as "null")
      popEl.replaceChildren(...[
        h('div.tp-label', 'Color'),
        h('div.tp-row', colors.map(c => h('button.sw' + (o.color === c ? '.on' : ''), { style: { background: inkColor(c) }, 'aria-label': c, on: { click: () => { o.color = c; save(); build(); } } }))),
        h('div.tp-label', tool === 'text' ? 'Size' : 'Thickness'),
        tool === 'text'
          ? h('div.seg.size-seg', TEXT_SIZES.map(([name, w]) => h('button' + (o.width === w ? '.on' : ''), { type: 'button', on: { click: () => { o.width = w; save(); build(); } } }, name)))
          : h('div.tp-row', WIDTHS[tool].map(w => h('button.wd' + (o.width === w ? '.on' : ''), { 'aria-label': `Width ${w}`, on: { click: () => { o.width = w; save(); build(); } } },
            h('i', { style: { height: Math.max(2, Math.min(14, w / (tool === 'hl' ? 2.2 : 1))) + 'px', background: o.color, opacity: tool === 'hl' ? 0.6 : 1 } })))),
        tool === 'text' ? h('div.tp-hint', 'Tap the paper to write · tap text to edit · drag text to move it') : null,
        tool === 'line' ? h('div.tp-row', h('button.toggle' + (o.arrow ? '.on' : ''), { on: { click: () => { o.arrow = !o.arrow; save(); build(); } } }, o.arrow ? '→  Arrowhead on' : '—  Arrowhead off')) : null,
      ].filter(Boolean));
    };
    popEl = h('div.tool-pop');
    build();
    nb.append(popEl);
  }

  // ---------- sheets ----------
  function switchPage(p) {
    page = p; notebook.lastPageId = p.id; undo = []; redo = [];
    vt = page.view ? { ...page.view } : DEFAULT_VIEW();
    renderCards(); applyView(false); syncTools(); saveNotebook();
    history.replaceState(null, '', `#/notebook?page=${p.id}`);
  }
  function pageSheet() {
    openSheet(close => [
      h('h3', 'Notebook pages'),
      ...notebook.pages.map(p => h('button.list-item' + (p.id === page.id ? '.on' : ''), { on: { click: () => { close(); switchPage(p); } } },
        icon('book'), h('div.li-main', h('div.li-title', p.name), h('div.li-sub', `${p.cards.length} calculation${p.cards.length === 1 ? '' : 's'} · ${p.strokes.length} marks`)),
        p.id === page.id ? icon('check') : null)),
      h('button.list-item', {
        on: { click: async () => { close(); const name = await promptSheet('New page', '', 'Create'); if (name) switchPage(addPage(name)); } },
      }, icon('plus'), h('div.li-main', h('div.li-title', 'New page'))),
      h('div.row',
        h('button.btn.small', { style: { flex: 1 }, on: { click: async () => { close(); const name = await promptSheet('Rename page', page.name); if (name) { page.name = name; saveNotebook(); renderCards(); } } } }, icon('edit'), 'Rename'),
        h('button.btn.small', {
          style: { flex: 1 }, disabled: !page.strokes.length,
          on: { click: () => { close(); undo.push({ t: 'clear', strokes: page.strokes.slice() }); redo = []; page.strokes = []; afterHistory(); toast('Drawings cleared', { label: 'Undo', fn: doUndo }); } },
        }, icon('eraser'), 'Clear ink'),
        h('button.btn.small.danger', {
          style: { flex: 1 },
          on: {
            click: async () => {
              close();
              if (await confirmSheet(`Delete “${page.name}”?`, `Its ${page.cards.length} calculation cards and drawings will be removed. Calculations stay in History.`)) {
                deletePage(page.id); switchPage(getPage(notebook.lastPageId));
              }
            },
          },
        }, icon('trash'), 'Delete')),
    ]);
  }

  function historySheet() {
    let q = '';
    openSheet(close => {
      const list = h('div');
      const draw = () => {
        const items = notebook.history.filter(x => !q || (x.title + ' ' + x.results.map(r => r.text).join(' ')).toLowerCase().includes(q));
        list.replaceChildren(...(items.length ? items.slice(0, 100).map(x => {
          const prim = x.results.find(r => r.primary) || x.results[0];
          return h('div.list-item',
            h('div.li-main', h('div.li-title', `${x.title} — ${prim ? prim.text : ''}`), h('div.li-sub', fmtDate(x.date))),
            h('button.icon-btn.plain', { 'aria-label': 'Add to this page', title: 'Add to this page', on: { click: () => { close(); const c = addCardToPage(page.id, { ...x, date: x.date }); notebook.history.shift(); undo.push({ t: 'addcard', card: c }); redo = []; renderCards(); syncTools(); centerOn(c); } } }, icon('plus')),
            getCalc(x.calcId) ? h('button.icon-btn.plain', { 'aria-label': 'Open in calculator', title: 'Open in calculator', on: { click: () => { close(); location.hash = `#/calc/${x.calcId}?p=${encodeURIComponent(JSON.stringify(x.prefill || {}))}`; } } }, icon('calc')) : null);
        }) : [h('p', { style: { color: 'var(--muted)' } }, q ? 'No matches.' : 'Calculations you add to the notebook show up here.')]));
      };
      draw();
      return [
        h('h3', 'History'),
        h('div.search', { style: { margin: '0 0 12px' } }, icon('search'), h('input', { type: 'search', placeholder: 'Search history', on: { input: e => { q = e.target.value.toLowerCase(); draw(); } } })),
        list,
      ];
    });
  }

  // ---------- export ----------
  async function exportPng() {
    const c = contentBounds();
    if (!c) { toast('Nothing on this page to export yet'); return; }
    try { await document.fonts.ready; } catch { /* ignore */ }
    // export from the paper's top-left so the heading (and holes/margin) come along
    const b = { x0: 0, y0: 0, x1: Math.min(PAGE_W, Math.max(c.x1 + 40, 640)), y1: Math.min(PAGE_H, c.y1 + 40) };
    const pad = 0, scale = 2;
    const W = Math.ceil(b.x1 - b.x0 + pad * 2), H = Math.ceil(b.y1 - b.y0 + pad * 2);
    const out = document.createElement('canvas');
    out.width = W * scale; out.height = H * scale;
    const g = out.getContext('2d');
    g.scale(scale, scale);
    g.translate(pad - b.x0, pad - b.y0);
    drawPaper(g, W, H, settings.paper || 'grid', page, heading);
    // cards: copy the laid-out DOM text positions onto the canvas
    for (const el of cardsEl.children) {
      const c = page.cards.find(k => k.id === el.dataset.id); if (!c) continue;
      drawCardToCanvas(g, el, c, vt.scale);
    }
    for (const s of page.strokes) drawStroke(g, s);
    drawArrows(g);
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    const name = `${page.name.replace(/[^\w-]+/g, '_')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: page.name }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  // ---------- go ----------
  buildTools();
  renderCards();
  resize();
  applyView(false);
  const focusId = query.get('card');
  if (focusId) {
    const c = page.cards.find(k => k.id === focusId);
    if (c) requestAnimationFrame(() => centerOn(c));
  } else if (!page.view && (page.cards.length || page.strokes.length)) requestAnimationFrame(fitContent);

  cleanup = () => {
    document.removeEventListener('gesturestart', stopGesture);
    window.removeEventListener('resize', resize);
    window.removeEventListener('themechange', onTheme);
    saveNotebook(true);
  };
  return cleanup;
}

// ---------- drawing helpers ----------
// All pointer samples since the last event (smoother ink); falls back to the event itself
const coalesced = e => { const list = e.getCoalescedEvents ? e.getCoalescedEvents() : []; return list.length ? list : [e]; };
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function drawStroke(g, s) {
  const p = s.pts;
  if (!p || p.length < 2) return;
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle = inkColor(s.color);   // white ink shows dark on Day paper
  if (s.tool === 'hl') { g.globalAlpha = 0.38; g.lineCap = 'butt'; }
  if (s.tool === 'line') {
    g.lineWidth = s.width;
    const ang = Math.atan2(p[3] - p[1], p[2] - p[0]);
    const len = 10 + s.width * 3;                     // arrowhead length grows with line thickness
    let ex = p[2], ey = p[3];
    if (s.arrow && Math.hypot(p[2] - p[0], p[3] - p[1]) > len) {
      // stop the line inside the arrowhead (flat end) so no line pokes out past the point
      ex = p[2] - Math.cos(ang) * len * 0.7;
      ey = p[3] - Math.sin(ang) * len * 0.7;
      g.lineCap = 'butt';
    }
    g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(ex, ey); g.stroke();
    if (s.arrow) {
      g.beginPath();
      g.moveTo(p[2], p[3]);
      g.lineTo(p[2] - len * Math.cos(ang - 0.45), p[3] - len * Math.sin(ang - 0.45));
      g.lineTo(p[2] - len * Math.cos(ang + 0.45), p[3] - len * Math.sin(ang + 0.45));
      g.closePath(); g.fill();
    }
    g.restore(); return;
  }
  if (p.length === 2) {
    g.beginPath(); g.arc(p[0], p[1], s.width / 2, 0, Math.PI * 2); g.fill(); g.restore(); return;
  }
  if (s.pr) {
    // stylus: vary width with pressure, segment by segment
    for (let i = 2; i < p.length; i += 2) {
      const pr = s.pr[i / 2] ?? 0.5;
      g.lineWidth = s.width * (0.35 + pr * 1.3);
      g.beginPath(); g.moveTo(p[i - 2], p[i - 1]); g.lineTo(p[i], p[i + 1]); g.stroke();
    }
    g.restore(); return;
  }
  // smooth path through midpoints
  g.lineWidth = s.width;
  g.beginPath(); g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
    g.quadraticCurveTo(p[i], p[i + 1], mx, my);
  }
  g.lineTo(p[p.length - 2], p[p.length - 1]);
  g.stroke();
  g.restore();
}

/**
 * Chaikin corner cutting: each pass replaces every corner with two points at
 * 1/4 and 3/4 along its edges, which turns a jagged polyline into a smooth curve.
 * The end points are kept so the stroke still starts and ends where it was drawn.
 * Pressure values (if any) are smoothed the same way so they stay in step.
 * Afterwards, points closer than ~1 unit are dropped to keep saved strokes small.
 */
function smoothStroke(pts, pr, passes) {
  let P = [];
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1], pr ? pr[i / 2] ?? 0.5 : 0]);
  for (let k = 0; k < passes && P.length > 2; k++) {
    const out = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]);
    }
    out.push(P[P.length - 1]);
    P = out;
  }
  const kept = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const q = kept[kept.length - 1];
    if (Math.hypot(P[i][0] - q[0], P[i][1] - q[1]) >= 1) kept.push(P[i]);
  }
  if (P.length > 1) kept.push(P[P.length - 1]);
  return {
    pts: kept.flatMap(p => [r1(p[0]), r1(p[1])]),
    ...(pr ? { pr: kept.map(p => r2(p[2])) } : {}),
  };
}

function hitStroke(s, pt, rad) {
  const p = s.pts;
  if (p.length === 2) return Math.hypot(p[0] - pt.x, p[1] - pt.y) <= rad;
  for (let i = 2; i < p.length; i += 2) {
    if (distToSeg(pt.x, pt.y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= rad) return true;
  }
  return false;
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Paint a card onto the export canvas by copying its rendered text positions. */
function drawCardToCanvas(g, el, c, viewScale) {
  const base = el.getBoundingClientRect();
  const w = el.offsetWidth, hgt = el.offsetHeight;
  const toLocal = r => ({ x: c.x + (r.left - base.left) / viewScale, y: c.y + (r.top - base.top) / viewScale, w: r.width / viewScale, h: r.height / viewScale });
  g.save();
  void w; void hgt;   // cards are plain writing on the paper: no box to paint
  // underline answers / boxes for final answers
  for (const ans of el.querySelectorAll('.ans')) {
    const r = toLocal(ans.getBoundingClientRect());
    g.strokeStyle = '#ff7a00'; g.lineWidth = 2;
    if (ans.closest('.final')) { roundRect(g, r.x, r.y, r.w, r.h, 4); g.stroke(); }
    else { g.beginPath(); g.moveTo(r.x, r.y + r.h); g.lineTo(r.x + r.w, r.y + r.h); g.stroke(); }
  }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent;
    if (!text.trim()) continue;
    const parent = node.parentElement;
    if (parent.closest('button')) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()];
    if (!rects.length) continue;
    g.fillStyle = cs.color;
    g.font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
    g.textBaseline = 'middle';
    if (rects.length === 1) {
      const r = toLocal(rects[0]);
      g.fillText(text, r.x, r.y + r.h / 2, r.w + 2);
    } else {
      // wrapped text: split words across the line boxes
      const words = text.split(/(\s+)/);
      let line = 0, cur = '';
      const lines = rects.map(toLocal);
      for (const word of words) {
        const test = cur + word;
        if (line < lines.length - 1 && g.measureText(test).width > lines[line].w + 1 && cur.trim()) {
          g.fillText(cur, lines[line].x, lines[line].y + lines[line].h / 2);
          line++; cur = word.trimStart();
        } else cur = test;
      }
      if (cur) g.fillText(cur, lines[line].x, lines[line].y + lines[line].h / 2);
    }
  }
  g.restore();
}
/** Paint the paper (rules, margin, holes, heading) onto the export canvas, matching the CSS. */
function drawPaper(g, W, H, style, page, headingEl) {
  // read the current theme's paper colors so the image matches the screen
  const css = getComputedStyle(document.documentElement);
  const tok = name => css.getPropertyValue(name).trim();
  g.fillStyle = tok('--paper'); g.fillRect(0, 0, W, H);
  g.save();
  g.lineWidth = 1;
  if (style === 'lines') {
    g.strokeStyle = tok('--rule');
    for (let y = HEAD_H + 36; y < H; y += 36) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
    g.strokeStyle = tok('--margin-line');
    g.beginPath(); g.moveTo(MARGIN_X + 0.5, 0); g.lineTo(MARGIN_X + 0.5, H); g.stroke();
    for (const f of [0.18, 0.5, 0.82]) {
      const cy = PAGE_H * f; if (cy > H) continue;
      g.fillStyle = tok('--desk'); g.beginPath(); g.arc(46, cy, 17, 0, Math.PI * 2); g.fill();
      g.strokeStyle = tok('--paper-edge'); g.stroke();
    }
  } else if (style === 'grid') {
    g.strokeStyle = tok('--grid');
    for (let y = HEAD_H; y < H; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x + 0.5, HEAD_H); g.lineTo(x + 0.5, H); g.stroke(); }
  }
  // heading: page name and date
  const left = style === 'lines' ? MARGIN_X + 22 : 40;
  g.strokeStyle = tok('--head-rule'); g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, HEAD_H - 4); g.lineTo(W, HEAD_H - 4); g.stroke();
  g.lineWidth = 1; g.beginPath(); g.moveTo(0, HEAD_H); g.lineTo(W, HEAD_H); g.stroke();
  const font = getComputedStyle(headingEl.querySelector('.ph-name')).fontFamily;
  g.fillStyle = tok('--ink-strong'); g.font = `700 54px ${font}`; g.textBaseline = 'alphabetic';
  g.fillText(page.name, left, 88, W - left - 260);
  g.fillStyle = tok('--accent-2'); g.font = `500 26px ${font}`;
  g.fillText(new Date(page.created || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), Math.max(left + 300, W - 230), 88);
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
