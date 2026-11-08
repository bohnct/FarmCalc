// Day / Night theme. settings.theme is 'night' | 'day' | 'auto' (follow the phone).
// The resolved theme goes on <html data-theme="…">; the CSS swaps its color tokens.
import { settings } from './store.js';

const lightQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function currentTheme() {
  const t = settings.theme || 'night';
  if (t === 'auto') return lightQuery && lightQuery.matches ? 'day' : 'night';
  return t;
}

export function applyTheme() {
  const t = currentTheme();
  const root = document.documentElement;
  if (t === 'day') root.dataset.theme = 'day'; else delete root.dataset.theme;
  // phone status bar / browser chrome color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'day' ? '#f4f2ee' : '#000000');
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}

if (lightQuery) {
  const onChange = () => { if ((settings.theme || 'night') === 'auto') applyTheme(); };
  if (lightQuery.addEventListener) lightQuery.addEventListener('change', onChange); else lightQuery.addListener(onChange);
}

/**
 * Pen colors are saved as chosen; "white" means "ink", which is drawn
 * near-black on Day paper so it stays visible. Other colors are unchanged.
 */
export function inkColor(c) {
  if (currentTheme() === 'day' && (c || '').toLowerCase() === '#ffffff') return '#1d1d1d';
  return c;
}
