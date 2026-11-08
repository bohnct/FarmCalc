import { h, icon } from '../ui.js';
import { CATEGORIES, CALCS } from '../registry.js';
import { settings } from '../store.js';

// Home: the FarmCalc header and the calculator tiles, grouped by category
// (tap a category heading to collapse or expand it).
// Groups start minimized each time the app opens; ones you open stay open
// while you go in and out of calculators.
const opened = new Set();

export function renderHome(view) {
  const list = h('div.cat-list');

  const draw = () => {
    list.replaceChildren();
    const hidden = new Set(settings.hidden || []);   // chosen in Settings → Home screen
    for (const cat of CATEGORIES) {
      const calcs = CALCS.filter(c => c.category === cat.id && !hidden.has(c.id));
      if (!calcs.length) continue;
      const isCollapsed = !opened.has(cat.id);
      list.append(h('section.cat' + (isCollapsed ? '.collapsed' : ''),
        h('button.cat-head', {
          'aria-expanded': String(!isCollapsed),
          on: {
            click: () => {
              if (opened.has(cat.id)) opened.delete(cat.id); else opened.add(cat.id);
              draw();
            },
          },
        },
        h('span.cat-icon', icon(cat.icon)),
        h('h2', cat.label),
        h('span.count', String(calcs.length)),
        icon('chev', 'chev')),
        h('div.tiles', calcs.map(c => h('a.tile', { href: `#/calc/${c.id}` },
          h('div.t-title', c.title),
          h('div.t-desc', c.desc))))));
    }
    if (!list.children.length) {
      list.append(h('div.empty', 'All calculators are hidden. ', h('a', { href: '#/settings', style: { color: 'var(--accent)' } }, 'Show them in Settings')));
    }
  };

  view.append(
    h('header.topbar', h('h1.brand', 'Farm', h('b', 'Calc'))),
    list,
  );
  draw();
}
