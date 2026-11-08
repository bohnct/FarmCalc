// Tiny DOM helpers, icons, toast and bottom sheet.

/** h('div.card#id', {attrs, on:{click}}, ...children) */
export function h(tag, props, ...children) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
    }
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props); props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function svg(markup, cls) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" ${cls ? `class="${cls}"` : ''} aria-hidden="true">${markup}</svg>`;
  return t.content.firstChild;
}

// Stroke icons (24×24)
export const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  book: '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3v18M10 8h5M10 12h5"/>',
  bookAdd: '<path d="M5 4h10a2 2 0 0 1 2 2v5"/><path d="M5 4v16h8"/><path d="M8 9h5M8 13h3"/><path d="M18 14v6M15 17h6"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  collapse: '<path d="M6 15l6-6 6 6"/>',
  expand: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h2M16 15v3"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.5-2.1L3.7 15a1.5 1.5 0 0 1 2.3-2l2 2"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  marker: '<path d="M9 14l-4 4v2h4l4-4"/><path d="M9 14l6-10 5 5-10 6z"/><path d="M4 22h16" opacity=".5"/>',
  line: '<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="5" r="1.5"/>',
  text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  hash: '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>',
  sigma: '<path d="M17 5H7l6 7-6 7h10"/>',
  foldTools: '<path d="M14 6l-6 6 6 6"/><path d="M19 6l-6 6 6 6" opacity=".5"/>',
  expandTools: '<path d="M10 6l6 6-6 6"/><path d="M5 6l6 6-6 6" opacity=".5"/>',
  eraser: '<path d="M8 20h12"/><path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H7z"/><path d="M9 11l5 5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/><path d="M8 9h8M8 13h5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  // category icons
  drying: '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/><path d="M4 21h16" />',
  storage: '<path d="M5 9l7-5 7 5"/><path d="M6 9v11h12V9"/><path d="M6 13h12M6 17h12"/>',
  yield: '<path d="M12 21V8"/><path d="M12 8c-2-1-3-3-3-5 2 0 3 2 3 5zM12 8c2-1 3-3 3-5-2 0-3 2-3 5z"/><path d="M12 13c-2-1-3.5-2.5-3.5-4.5 2 0 3.5 2 3.5 4.5zM12 13c2-1 3.5-2.5 3.5-4.5-2 0-3.5 2-3.5 4.5z"/><path d="M12 18c-2-1-3.5-2.5-3.5-4.5 2 0 3.5 2 3.5 4.5zM12 18c2-1 3.5-2.5 3.5-4.5-2 0-3.5 2-3.5 4.5z"/>',
  fieldops: '<circle cx="7" cy="17" r="3"/><circle cx="18" cy="18" r="2"/><path d="M4 14V9h7l2 5h5l1 3"/><path d="M8 9V6h3"/>',
  seeding: '<path d="M12 20v-7"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/><path d="M5 20h14"/>',
  spraying: '<path d="M4 9h12v3H4z"/><path d="M16 10.5h3"/><path d="M6 12v2M10 12v2M14 12v2"/><path d="M5 16l1 4M10 16v4M15 16l-1 4"/>',
  fertilizer: '<path d="M7 3h10l-2 4H9z"/><path d="M9 7c-3 2-4 5-4 8a7 7 0 0 0 14 0c0-3-1-6-4-8"/><path d="M10 14h4M12 12v4"/>',
  marketing: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/><path d="M15 7h3v3"/>',
  convert: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
};

export function icon(name, cls) { return svg(ICONS[name] || '', cls); }

/**
 * A choice field in the app's own style: a segmented toggle when there are
 * two or three short options, otherwise a button that opens a picker sheet.
 */
export function choiceControl(id, label, opts, current, onChange) {
  const cur = opts.find(o => o.value === current) || opts[0];
  if (opts.length <= 3 && opts.every(o => o.label.length <= 14)) {
    return h('div.seg.choice-seg', { id, role: 'radiogroup', 'aria-label': label },
      opts.map(o => h('button' + (o.value === cur?.value ? '.on' : ''), {
        type: 'button', role: 'radio', 'aria-checked': String(o.value === cur?.value),
        on: { click: () => { if (o.value !== cur?.value) onChange(o.value); } },
      }, o.label)));
  }
  return h('button.pick-btn', {
    id, type: 'button', 'aria-label': `${label}: ${cur?.label || ''}`,
    on: {
      click: () => openSheet(close => [
        h('h3', label),
        ...opts.map(o => h('button.list-item' + (o.value === cur?.value ? '.on' : ''), {
          on: { click: () => { close(); if (o.value !== cur?.value) onChange(o.value); } },
        }, h('div.li-main', h('div.li-title', o.label)), o.value === cur?.value ? icon('check') : null)),
      ]),
    },
  }, h('span.pick-label', cur?.label || ''), icon('chev'));
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, action) {
  const el = document.getElementById('toast');
  el.replaceChildren(h('span', msg));
  if (action) el.appendChild(h('button', { on: { click: () => { el.classList.remove('show'); action.fn(); } } }, action.label));
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4000 : 2200);
}

// ---------- Bottom sheet ----------
export function openSheet(build) {
  const root = document.getElementById('sheet-root');
  const backdrop = h('div.sheet-backdrop');
  const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true' }, h('div.grab'));
  const close = () => {
    root.classList.remove('sheet-open');
    setTimeout(() => { backdrop.remove(); sheet.remove(); }, 220);
  };
  backdrop.addEventListener('click', close);
  sheet.append(...[].concat(build(close)).filter(Boolean));   // skip empty (null) items
  root.append(backdrop, sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('sheet-open')));
  return close;
}

/** Prompt for a short text in a sheet. Resolves with the string or null. */
/**
 * Ask for text in a sheet. Resolves with the string, or null when cancelled.
 * opts.multiline: a textarea (Enter adds a line; an empty result resolves '' so callers can treat it as "delete").
 */
export function promptSheet(title, value = '', okLabel = 'Save', opts = {}) {
  return new Promise(resolve => {
    let done = false;
    openSheet(c => {
      const input = opts.multiline
        ? h('textarea.text-input.text-area', { rows: 4, placeholder: opts.placeholder || '' })
        : h('input.text-input', { type: 'text', value, maxlength: 60, placeholder: opts.placeholder || '' });
      if (opts.multiline) input.value = value;
      const read = () => (opts.multiline ? input.value.replace(/\s+$/, '') : input.value.trim() || null);
      const finish = v => { if (done) return; done = true; c(); resolve(v); };
      setTimeout(() => input.focus(), 250);
      if (!opts.multiline) input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(read()); });
      return [
        h('h3', title), input,
        h('div.row',
          h('button.btn', { on: { click: () => finish(null) } }, 'Cancel'),
          h('button.btn.primary', { on: { click: () => finish(read()) } }, okLabel)),
      ];
    });
  });
}

export function confirmSheet(title, message, okLabel = 'Delete') {
  return new Promise(resolve => {
    openSheet(c => [
      h('h3', title), h('p', { style: { color: 'var(--muted)', margin: '0 0 8px' } }, message),
      h('div.row',
        h('button.btn', { on: { click: () => { c(); resolve(false); } } }, 'Cancel'),
        h('button.btn.danger', { on: { click: () => { c(); resolve(true); } } }, okLabel)),
    ]);
  });
}
