// All calculators, grouped by category. Adding a calculator = adding a
// definition to one of the category files below.
import drying from './calcs/drying.js';
import storage from './calcs/storage.js';
import yieldCalcs from './calcs/yield.js';
import fieldops from './calcs/fieldops.js';
import seeding from './calcs/seeding.js';
import spraying from './calcs/spraying.js';
import fertilizer from './calcs/fertilizer.js';
import marketing from './calcs/marketing.js';
import convert from './calcs/convert.js';

export const CATEGORIES = [
  { id: 'drying', label: 'Grain Drying', icon: 'drying' },
  { id: 'storage', label: 'Grain Storage', icon: 'storage' },
  { id: 'yield', label: 'Yield', icon: 'yield' },
  { id: 'fieldops', label: 'Field Ops', icon: 'fieldops' },
  { id: 'seeding', label: 'Seeding', icon: 'seeding' },
  { id: 'spraying', label: 'Spraying', icon: 'spraying' },
  { id: 'fertilizer', label: 'Fertilizer', icon: 'fertilizer' },
  { id: 'marketing', label: 'Marketing', icon: 'marketing' },
  { id: 'convert', label: 'Convert', icon: 'convert' },
];

export const CALCS = [...drying, ...storage, ...yieldCalcs, ...fieldops, ...seeding, ...spraying, ...fertilizer, ...marketing, ...convert];

export const getCalc = id => CALCS.find(c => c.id === id);
export const getCategory = id => CATEGORIES.find(c => c.id === id);
