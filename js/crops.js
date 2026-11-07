// Crop constants. tw = standard test weight (lb/bu), moist = standard/market
// moisture (%), repose = angle of repose for piled grain (degrees),
// seedsLb = typical seeds per lb, unit = seeds per seed unit/bag (0 = sold by weight),
// target = typical target seeding rate (seeds/ac).
export const CROPS = {
  corn:      { label: 'Corn',      tw: 56, moist: 15.5, repose: 23, seedsLb: 1600,   unit: 80000,  target: 34000 },
  soybeans:  { label: 'Soybeans',  tw: 60, moist: 13,   repose: 25, seedsLb: 2800,   unit: 140000, target: 140000 },
  wheat:     { label: 'Wheat',     tw: 60, moist: 13.5, repose: 25, seedsLb: 14000,  unit: 0,      target: 1300000 },
  barley:    { label: 'Barley',    tw: 48, moist: 14.5, repose: 28, seedsLb: 13000,  unit: 0,      target: 1100000 },
  oats:      { label: 'Oats',      tw: 32, moist: 14,   repose: 28, seedsLb: 15000,  unit: 0,      target: 1200000 },
  sorghum:   { label: 'Sorghum',   tw: 56, moist: 14,   repose: 27, seedsLb: 15000,  unit: 0,      target: 100000 },
  rye:       { label: 'Rye',       tw: 56, moist: 14,   repose: 26, seedsLb: 18000,  unit: 0,      target: 1300000 },
  canola:    { label: 'Canola',    tw: 50, moist: 10,   repose: 22, seedsLb: 100000, unit: 0,      target: 500000 },
  sunflower: { label: 'Sunflower (oil)', tw: 28, moist: 10, repose: 31, seedsLb: 7000, unit: 0,    target: 22000 },
};

export const CROP_OPTIONS = Object.entries(CROPS).map(([value, c]) => ({ value, label: c.label }));
