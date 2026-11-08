// Hash router: #/ · #/calc/:id?p=… · #/notebook?page=…&card=… · #/settings
import { renderHome } from './pages/home.js';
import { renderCalc } from './pages/calc.js';
import { renderNotebook } from './pages/notebook.js';
import { renderSettings } from './pages/settings.js';
import { saveNotebook } from './store.js';
import { applyTheme } from './theme.js';

applyTheme();
const view = document.getElementById('view');
const tabs = document.querySelectorAll('#tabbar a');
const scrollPos = {};
let current = '';
let leaveNotebook = null;

function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
}

async function route() {
  const { parts, query } = parse();
  if (current) scrollPos[current] = window.scrollY;
  if (leaveNotebook) { leaveNotebook(); leaveNotebook = null; }
  const key = location.hash || '#/';
  view.replaceChildren();
  view.className = 'view';
  const section = parts[0] || 'home';
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === (section === 'calc' ? 'home' : section)));

  if (section === 'calc') renderCalc(view, parts[1], query);
  else if (section === 'notebook') leaveNotebook = await renderNotebook(view, query);
  else if (section === 'settings') renderSettings(view);
  else renderHome(view);

  // restore scroll on the home list; start calculators at the top
  window.scrollTo(0, section === 'home' ? (scrollPos[key] || 0) : 0);
  current = key;
}

window.addEventListener('hashchange', route);
// tapping the active tab again (e.g. Calculators while inside a calculator) goes to its root
tabs.forEach(t => t.addEventListener('click', e => {
  if (location.hash === t.getAttribute('href')) { e.preventDefault(); route(); }
}));
window.addEventListener('pagehide', () => saveNotebook(true));
route();

// Offline support
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ }));
}
