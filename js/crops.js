// Crop constants and starting values. Calculators fill these in when you pick a
// crop; every one can be typed over.
//   tw        standard test weight (lb/bu)
//   moist     standard/market moisture (%)
//   harvest   typical moisture at harvest (%), the starting point for drying & shrink
//   repose    angle of repose for piled grain (degrees)
//   seedsLb   typical seeds per lb
//   unit      seeds per seed unit/bag (0 = sold by weight)
//   target    typical target seeding rate (seeds/ac)
//   seedLbAc  typical seeding rate by weight (lb/ac), for crops sold by weight
//   seedPrice seed price: per unit/bag if sold by count, else per lb (rough placeholder)
//   yld       a typical yield (bu/ac) as a starting point
//   price     a rough cash price ($/bu) as a starting point; type your own
export const CROPS = {
  wheat:     { label: 'Wheat',     tw: 60, moist: 13.5, harvest: 18, repose: 25, seedsLb: 14000,  unit: 0,      target: 1300000, seedLbAc: 90, seedPrice: 0.3,  yld: 60,  price: 6 },
  barley:    { label: 'Barley',    tw: 48, moist: 14.5, harvest: 18, repose: 28, seedsLb: 13000,  unit: 0,      target: 1100000, seedLbAc: 96, seedPrice: 0.28, yld: 80,  price: 5 },
  oats:      { label: 'Oats',      tw: 32, moist: 14,   harvest: 18, repose: 28, seedsLb: 15000,  unit: 0,      target: 1200000, seedLbAc: 90, seedPrice: 0.3,  yld: 100, price: 3.5 },
  canola:    { label: 'Canola',    tw: 50, moist: 10,   harvest: 12, repose: 22, seedsLb: 100000, unit: 0,      target: 500000,  seedLbAc: 5,  seedPrice: 9,    yld: 50,  price: 13 },
  rye:       { label: 'Rye',       tw: 56, moist: 14,   harvest: 18, repose: 26, seedsLb: 18000,  unit: 0,      target: 1300000, seedLbAc: 90, seedPrice: 0.35, yld: 50,  price: 6 },
  corn:      { label: 'Corn',      tw: 56, moist: 15.5, harvest: 25, repose: 23, seedsLb: 1600,   unit: 80000,  target: 34000,   seedLbAc: 0,  seedPrice: 300,  yld: 200, price: 4.5 },
  soybeans:  { label: 'Soybeans',  tw: 60, moist: 13,   harvest: 16, repose: 25, seedsLb: 2800,   unit: 140000, target: 140000,  seedLbAc: 0,  seedPrice: 60,   yld: 55,  price: 10.5 },
  sorghum:   { label: 'Sorghum',   tw: 56, moist: 14,   harvest: 20, repose: 27, seedsLb: 15000,  unit: 0,      target: 100000,  seedLbAc: 6,  seedPrice: 1.8,  yld: 100, price: 4.2 },
  sunflower: { label: 'Sunflower (oil)', tw: 28, moist: 10, harvest: 15, repose: 31, seedsLb: 7000, unit: 0,   target: 22000,   seedLbAc: 3,  seedPrice: 4,    yld: 60,  price: 6 },
};

export const CROP_OPTIONS = Object.entries(CROPS).map(([value, c]) => ({ value, label: c.label }));

/** How seed of this crop is sold: 'unit' (bags of a seed count) or 'lb'. */
export const soldBy = crop => (crop && crop.unit ? 'unit' : 'lb');
