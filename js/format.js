// Number formatting and safe arithmetic-expression parsing for inputs.

let decimalsSetting = 'auto';
export function setDecimals(d) { decimalsSetting = d; }

function autoDecimals(n) {
  const a = Math.abs(n);
  if (a === 0) return 0;
  if (a >= 1000) return 0;
  if (a >= 100) return 1;
  if (a >= 1) return 2;
  if (a >= 0.01) return 3;
  return 4;
}

/** Format a number for display. `dec` forces decimals; otherwise uses setting/auto. */
export function fmt(n, dec) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  let d = dec;
  if (d === undefined) d = decimalsSetting === 'auto' ? autoDecimals(n) : Number(decimalsSetting);
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
  return s === '-0' ? '0' : s;
}

/** Fixed decimals (keeps trailing zeros), e.g. money */
export function fmtFixed(n, d = 2) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function money(n, cur = '$', d = 2) {
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0;
  return (neg ? '−' : '') + cur + fmtFixed(Math.abs(n), d);
}

/** Plain value for an input box (no thousands separators). */
export function fmtInput(n) {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 10000) / 10000;
  return String(r);
}

/**
 * Parse user input. Accepts plain numbers ("1,250.5") and simple math
 * ("12*3+4", "(30+28)/2", "2x40"). Returns NaN when empty or invalid.
 */
export function parseNum(text) {
  if (text === null || text === undefined) return NaN;
  let s = String(text).trim();
  if (!s) return NaN;
  // "25%" in a percent field means 25, so the sign is simply ignored
  s = s.replace(/,/g, '').replace(/%/g, '').replace(/[×x]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return parseFloat(s);
  if (!/^[\d.+\-*/()\s]+$/.test(s)) return NaN;
  try {
    const p = new ExprParser(s);
    const v = p.parse();
    return Number.isFinite(v) ? v : NaN;
  } catch { return NaN; }
}

class ExprParser {
  constructor(s) { this.s = s.replace(/\s+/g, ''); this.i = 0; }
  parse() { const v = this.expr(); if (this.i !== this.s.length) throw new Error('trailing'); return v; }
  peek() { return this.s[this.i]; }
  expr() {
    let v = this.term();
    while (this.peek() === '+' || this.peek() === '-') { const op = this.s[this.i++]; const r = this.term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  term() {
    let v = this.factor();
    while (this.peek() === '*' || this.peek() === '/') { const op = this.s[this.i++]; const r = this.factor(); v = op === '*' ? v * r : v / r; }
    return v;
  }
  factor() {
    if (this.peek() === '-') { this.i++; return -this.factor(); }
    if (this.peek() === '+') { this.i++; return this.factor(); }
    let v;
    if (this.peek() === '(') { this.i++; v = this.expr(); if (this.s[this.i++] !== ')') throw new Error(')'); }
    else {
      const m = /^\d*\.?\d+/.exec(this.s.slice(this.i));
      if (!m) throw new Error('num');
      this.i += m[0].length; v = parseFloat(m[0]);
    }
    return v;
  }
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
