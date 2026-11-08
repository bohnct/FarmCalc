import { h, toast, confirmSheet, openSheet, choiceControl } from '../ui.js';
import { settings, saveSettings, exportBackup, importBackup, clearAll, notebook } from '../store.js';
import { CROPS } from '../crops.js';
import { CATEGORIES, CALCS } from '../registry.js';
import { applyTheme } from '../theme.js';

export function renderSettings(view) {
  const seg = (key, opts) => {
    const el = h('div.seg');
    const draw = () => el.replaceChildren(...opts.map(([val, label]) => h('button' + (settings[key] === val ? '.on' : ''), {
      on: { click: () => { saveSettings({ [key]: val }); draw(); } },
    }, label)));
    draw();
    return el;
  };
  // same styled picker as the calculators (no native dropdowns)
  const select = (key, opts, label) => {
    const el = h('div.pick-wrap');
    const draw = () => el.replaceChildren(choiceControl('set-' + key, label, opts.map(([value, l]) => ({ value, label: l })), settings[key],
      val => { saveSettings({ [key]: val }); draw(); }));
    draw();
    return el;
  };

  // ---- which calculators show on the home screen ----
  const shownCount = () => CALCS.length - (settings.hidden || []).filter(id => CALCS.some(c => c.id === id)).length;
  const homeSub = h('small');
  const updateHomeSub = () => { homeSub.textContent = `${shownCount()} of ${CALCS.length} shown. Hidden ones stay in the app; turn them back on any time.`; };
  updateHomeSub();
  const chooseCalcs = () => openSheet(() => {
    const hidden = new Set(settings.hidden || []);
    const toggle = (id, sw) => {
      if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
      saveSettings({ hidden: [...hidden] });
      sw.classList.toggle('on', !hidden.has(id));
      sw.setAttribute('aria-checked', String(!hidden.has(id)));
      updateHomeSub();
    };
    return [
      h('h3', 'Calculators on home screen'),
      ...CATEGORIES.map(cat => h('div.calc-toggle-group',
        h('div.ctg-head', cat.label),
        CALCS.filter(c => c.category === cat.id).map(c => {
          const sw = h('span.switch' + (hidden.has(c.id) ? '' : '.on'), { role: 'switch', 'aria-checked': String(!hidden.has(c.id)) }, h('i'));
          return h('button.list-item.calc-toggle', { type: 'button', 'aria-label': `Show ${c.title} on home screen`, on: { click: () => toggle(c.id, sw) } },
            h('div.li-main', h('div.li-title', c.title)), sw);
        }))),
    ];
  });

  const row = (title, sub, control) => h('div.set-row', h('div.s-text', title, sub ? h('small', sub) : null), control);

  const fileInput = h('input', {
    type: 'file', accept: '.json,application/json', style: { display: 'none' },
    on: {
      change: async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          importBackup(await file.text());
          toast(`Restored ${notebook.pages.length} notebook page${notebook.pages.length === 1 ? '' : 's'}`);
        } catch (err) { toast(err.message || 'Could not read that file'); }
        e.target.value = '';
      },
    },
  });

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `farm-calc-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  view.append(...[
    h('header.topbar', h('h1', 'Settings')),
    h('div.set-group', h('h2', 'Appearance'),
      h('div.panel',
        h('div.set-row.stack',
          h('div.s-text', 'Theme', h('small', 'Night is black with white & orange. Day is light paper with dark ink. Auto follows your phone.')),
          (() => {
            const el = seg('theme', [['night', 'Night'], ['day', 'Day'], ['auto', 'Auto']]);
            el.addEventListener('click', () => applyTheme());
            return el;
          })()))),
    h('div.set-group', h('h2', 'Units'),
      h('div.panel',
        row('Unit system', 'Sask: acres, bushels, lb/ac, ft & in, seeds/ft², with kg/tonnes, km/h, litres and L/ac', seg('system', [['sk', 'Sask'], ['us', 'US'], ['metric', 'Metric']])),
        row('Default crop', null, select('crop', Object.entries(CROPS).map(([k, c]) => [k, c.label]), 'Default crop')),
        row('Decimal places', 'Auto rounds big numbers more', select('decimals', [['auto', 'Auto'], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']], 'Decimal places')),
        row('Currency symbol', null, h('input.text-input', { type: 'text', value: settings.currency, maxlength: 3, on: { input: e => saveSettings({ currency: e.target.value || '$' }) } })),
      )),
    h('div.set-group', h('h2', 'Home screen'),
      h('div.panel',
        h('div.set-row', h('div.s-text', 'Calculators shown', homeSub),
          h('button.btn.small', { type: 'button', on: { click: chooseCalcs } }, 'Choose')))),
    h('div.set-group', h('h2', 'Notebook'),
      h('div.panel',
        row('Paper', null, seg('paper', [['grid', 'Grid'], ['lines', 'Lines'], ['blank', 'Blank']])),
        h('div.set-row.stack',
          h('div.s-text', 'Ink smoothing', h('small', 'How much pen and highlighter strokes are smoothed. Stronger looks neater but follows your finger more loosely.')),
          seg('smoothing', [['off', 'Off'], ['light', 'Light'], ['medium', 'Medium'], ['strong', 'Strong']])),
      )),
    h('div.set-group', h('h2', 'Backup'),
      h('div.panel', h('div.set-btns',
        h('button.btn', { on: { click: download } }, 'Export backup file'),
        h('button.btn', { on: { click: () => fileInput.click() } }, 'Restore from backup'),
        fileInput,
        h('button.btn.danger', {
          on: {
            click: async () => {
              if (await confirmSheet('Erase everything?', 'This deletes all notebook pages, drawings, history and settings on this phone. Export a backup first if you want to keep them.', 'Erase')) {
                clearAll(); location.hash = '#/'; toast('All data erased');
              }
            },
          },
        }, 'Erase all data'),
      ))),
    !standalone ? h('div.set-group', h('h2', 'Install'),
      h('div.panel', h('p', { style: { margin: '12px 0', color: 'var(--muted)', fontSize: '14px' } },
        isIOS ? 'In Safari, tap Share → “Add to Home Screen” to install Farm Calc as an app.'
          : 'In Chrome, open the ⋮ menu → “Install app” (or “Add to Home screen”) to install Farm Calc.'))) : null,
    h('p.about', 'Farm Calc · works offline · data stays on this device'),
  ].filter(Boolean));
}
