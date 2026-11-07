// Renders a calculation as hand-worked steps:
//   given: W = 1,000 bu ...
//   Water removed
//   W × (Mi − Mf) ÷ (100 − Mf)
//     = 56,000 × (25 − 15.5) ÷ (100 − 15.5)
//     = 6,296 lb   (underlined)
import { h } from './ui.js';

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
  for (const s of steps) {
    const el = h('div.step' + (s.final ? '.final' : ''));
    el.append(h('div.s-label', s.label));
    let first = true;
    const line = (txt, isAns) => {
      el.append(h('div.s-line' + (first ? '.first' : ''), first ? '' : '= ', isAns ? h('span.ans', txt) : txt));
      first = false;
    };
    if (s.f) line(s.f);
    if (s.s && s.s !== s.f) line(s.s);
    line(s.r, true);
    wrap.append(el);
  }
  return wrap;
}
