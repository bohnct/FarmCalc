// Helpers shared by calculator definitions.
//
// A calculator definition looks like:
// {
//   id, title, category, desc, crop?: fixed crop id,
//   fields: [ {
//     name, label, sym?, help?,
//     type?: 'number' | 'select' | 'crop',
//     dim?, units?: {us, metric}      // convertible quantity (value arrives in base units)
//     unit?: '%'                      // fixed suffix shown in the box
//     money?: true                    // prefix with currency symbol
//     choices?: [{value,label}]       // tappable unit list, raw number + v[name+'Unit']
//     options?: [..] | v => [..]      // for selects
//     def?, defMetric?, optional?, show?: v => bool, cropDefault?: 'moist' | ...
//   } ],
//   compute(v, ctx) => { results:[...], work:[...], notes?:[], warn?:[], links?:[] } | { error }
// }
// Result: { label, value, dim?, units?, unit?, money?, text?, decimals?, primary? }
// Work step: { label, f?: formula, s?: substituted, r: result, final? }
import { fmt, money as fmtMoney } from '../format.js';
import { CONST } from '../units.js';

export { fmt, CONST };
export const n = (x, d) => fmt(x, d);
export const m = (x, ctx, d = 2) => fmtMoney(x, ctx.cur, d);
export const step = (label, f, s, r, final) => ({ label, f, s, r, final: !!final });
export const deg = x => x * Math.PI / 180;
export const pctStr = (x, d) => fmt(x, d) + '%';
export const fail = error => ({ error });
