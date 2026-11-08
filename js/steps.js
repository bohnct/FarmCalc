// Renders a calculation as hand-worked steps:
//   given: W = 1,000 bu ...
//   Water removed
//   W × (Mi − Mf) ÷ (100 − Mf)
//     = 56,000 × (25 − 15.5) ÷ (100 − 15.5)
//     = 6,296 lb   (underlined)
import { h } from './ui.js';

/**
 * Summary card: the inputs written out in words (label ...... value), a rule,
 * then the main answer boxed, plus any key supporting results.
 * The full working is folded away and shown when `opts.showWork` is true.
 */
export function renderSummary(c, opts = {}) {
  const wrap = h('div.hand-steps.summary');
  wrap.append(h('div.hand-title', c.title));
  wrap.append(h('div.sum-inputs', (c.given || []).map(g => h('div.sum-row',
    h('span.sum-label', g.label), h('span.sum-dots'), h('span.sum-val', g.text)))));
  const main = (c.results || []).find(r => r.primary) || (c.results || [])[0];
  if (main) {
    wrap.append(h('div.sum-answer', h('span.sum-alabel', main.label), h('span.sum-dots'), h('span.ans.boxed', { 'data-key': 'r:' + main.label }, main.text)));
  }
  for (const r of (c.results || []).filter(x => x.sum)) {
    wrap.append(h('div.sum-row.sum-extra', h('span.sum-label', r.label), h('span.sum-dots'), h('span.sum-val', { 'data-key': 'r:' + r.label }, r.text)));
  }
  if (opts.onToggleWork && (c.steps || []).length) {
    wrap.append(h('button.work-toggle', { type: 'button', on: { click: opts.onToggleWork } }, opts.showWork ? 'hide working ▴' : 'show working ▾'));
    if (opts.showWork) wrap.append(renderSteps({ steps: c.steps }, { given: false }));
  }
  return wrap;
}

export function renderSteps({ given = [], steps = [], title, subtitle }, opts = {}) {
  const wrap = h('div.hand-steps');
  if (title && opts.title !== false) {
    // a single picked step already shows its own label, so skip the subtitle then
    wrap.append(h('div.hand-title', title));
    if (subtitle && steps.length > 1) wrap.append(h('div.hand-sub', subtitle));
  }
  if (given.length && opts.given !== false) {
    wrap.append(h('div.given',
      h('div.g-head', 'given:'),
      given.map(g => h('div',
        g.sym ? `${g.sym} = ${g.text}` : `${g.label}: ${g.text}`,
        g.sym ? h('span.g-label', g.label.toLowerCase()) : null))));
  }
  // each step's answer carries data-key="s:<index>" so the notebook can pick it for an equation
  steps.forEach((s, i) => {
    const el = h('div.step' + (s.final ? '.final' : ''));
    el.append(h('div.s-label', s.label));
    let first = true;
    const line = (txt, isAns) => {
      el.append(h('div.s-line' + (first ? '.first' : ''), first ? '' : '= ', isAns ? h('span.ans', { 'data-key': 's:' + i }, txt) : txt));
      first = false;
    };
    if (s.f) line(s.f);
    if (s.s && s.s !== s.f) line(s.s);
    line(s.r, true);
    wrap.append(el);
  });
  return wrap;
}
