// Unit tables. Every dimension has a base unit (US); `f` converts a value in
// that unit to the base: base = value * f. `f` may be a function of ctx when
// the conversion depends on the crop (bushels ↔ weight).
// ctx = { tw } where tw = test weight in lb/bu.

const LB_PER_KG = 2.2046226218;
const LB_PER_T = 2204.6226218;
const AC_PER_HA = 2.4710538147;
const GAL_PER_L = 0.2641720524;
const FT_PER_M = 3.280839895;
const FT3_PER_BU = 1.2444560;   // US struck bushel = 2150.42 in³

export const DIMS = {
  length: {
    base: 'ft', label: 'Length',
    units: {
      in: { label: 'in', f: 1 / 12 }, ft: { label: 'ft', f: 1 }, yd: { label: 'yd', f: 3 },
      rod: { label: 'rod', f: 16.5 }, mi: { label: 'mi', f: 5280 },
      mm: { label: 'mm', f: FT_PER_M / 1000 }, cm: { label: 'cm', f: FT_PER_M / 100 },
      m: { label: 'm', f: FT_PER_M }, km: { label: 'km', f: FT_PER_M * 1000 },
    },
  },
  area: {
    base: 'ac', label: 'Area',
    units: {
      ft2: { label: 'ft²', f: 1 / 43560 }, yd2: { label: 'yd²', f: 9 / 43560 },
      ac: { label: 'ac', f: 1 }, mi2: { label: 'mi²', f: 640 },
      m2: { label: 'm²', f: 1 / 4046.8564224 }, ha: { label: 'ha', f: AC_PER_HA }, km2: { label: 'km²', f: AC_PER_HA * 100 },
    },
  },
  volume: {
    base: 'gal', label: 'Volume',
    units: {
      floz: { label: 'fl oz', f: 1 / 128 }, pt: { label: 'pt', f: 1 / 8 }, qt: { label: 'qt', f: 1 / 4 },
      gal: { label: 'gal', f: 1 }, ft3: { label: 'ft³', f: 7.48051948 }, bu: { label: 'bu (dry)', f: 7.48051948 * FT3_PER_BU },
      yd3: { label: 'yd³', f: 7.48051948 * 27 }, acft: { label: 'ac-ft', f: 325851.43 },
      mL: { label: 'mL', f: GAL_PER_L / 1000 }, L: { label: 'L', f: GAL_PER_L }, m3: { label: 'm³', f: GAL_PER_L * 1000 },
    },
  },
  mass: {
    base: 'lb', label: 'Mass / weight',
    units: {
      oz: { label: 'oz', f: 1 / 16 }, lb: { label: 'lb', f: 1 }, cwt: { label: 'cwt', f: 100 },
      ton: { label: 'ton (short)', f: 2000 },
      g: { label: 'g', f: LB_PER_KG / 1000 }, kg: { label: 'kg', f: LB_PER_KG }, t: { label: 't (metric)', f: LB_PER_T },
    },
  },
  speed: {
    base: 'mph', label: 'Speed',
    units: {
      mph: { label: 'mph', f: 1 }, kmh: { label: 'km/h', f: 0.621371192 },
      fpm: { label: 'ft/min', f: 60 / 5280 }, ms: { label: 'm/s', f: 2.236936292 }, kn: { label: 'knot', f: 1.150779448 },
    },
  },
  pressure: {
    base: 'psi', label: 'Pressure',
    units: {
      psi: { label: 'psi', f: 1 }, kPa: { label: 'kPa', f: 0.1450377377 },
      bar: { label: 'bar', f: 14.503773773 }, atm: { label: 'atm', f: 14.695948775 }, inHg: { label: 'inHg', f: 0.4911541 },
    },
  },
  temperature: {
    base: 'F', label: 'Temperature',
    units: { F: { label: '°F' }, C: { label: '°C' }, K: { label: 'K' } },
  },
  flow: {
    base: 'gpm', label: 'Flow',
    units: {
      gpm: { label: 'gal/min', f: 1 }, gph: { label: 'gal/hr', f: 1 / 60 },
      lpm: { label: 'L/min', f: GAL_PER_L }, lph: { label: 'L/hr', f: GAL_PER_L / 60 },
    },
  },
  massRate: {
    base: 'lbac', label: 'Rate (weight per area)',
    units: {
      ozac: { label: 'oz/ac', f: 1 / 16 }, lbac: { label: 'lb/ac', f: 1 }, tonac: { label: 'ton/ac', f: 2000 },
      gha: { label: 'g/ha', f: LB_PER_KG / 1000 / AC_PER_HA },
      kgha: { label: 'kg/ha', f: LB_PER_KG / AC_PER_HA }, tha: { label: 't/ha', f: LB_PER_T / AC_PER_HA },
    },
  },
  volRate: {
    base: 'galac', label: 'Rate (volume per area)',
    units: {
      flozac: { label: 'fl oz/ac', f: 1 / 128 }, ptac: { label: 'pt/ac', f: 1 / 8 }, qtac: { label: 'qt/ac', f: 1 / 4 },
      galac: { label: 'gal/ac', f: 1 },
      mLha: { label: 'mL/ha', f: GAL_PER_L / 1000 / AC_PER_HA }, Lha: { label: 'L/ha', f: GAL_PER_L / AC_PER_HA },
    },
  },
  countRate: {
    base: 'pac', label: 'Count per area',
    units: { pac: { label: '/ac', f: 1 }, pha: { label: '/ha', f: 1 / AC_PER_HA }, pft2: { label: '/ft²', f: 43560 }, pm2: { label: '/m²', f: 4046.8564224 } },
  },
  areaRate: {
    base: 'ach', label: 'Work rate',
    units: { ach: { label: 'ac/hr', f: 1 }, hah: { label: 'ha/hr', f: AC_PER_HA } },
  },
  moneyArea: {
    base: 'dac', label: 'Cost per area',
    units: { dac: { label: '¤/ac', f: 1 }, dha: { label: '¤/ha', f: 1 / AC_PER_HA } },
  },
  // ---- crop-dependent ----
  grain: {
    base: 'lb', label: 'Grain quantity', crop: true,
    units: {
      bu: { label: 'bu', f: c => c.tw }, lb: { label: 'lb', f: 1 }, cwt: { label: 'cwt', f: 100 },
      ton: { label: 'ton', f: 2000 }, kg: { label: 'kg', f: LB_PER_KG }, t: { label: 't', f: LB_PER_T },
    },
  },
  grainYield: {
    base: 'lbac', label: 'Yield', crop: true,
    units: {
      buac: { label: 'bu/ac', f: c => c.tw }, lbac: { label: 'lb/ac', f: 1 }, tonac: { label: 'ton/ac', f: 2000 },
      kgha: { label: 'kg/ha', f: LB_PER_KG / AC_PER_HA }, tha: { label: 't/ha', f: LB_PER_T / AC_PER_HA },
      qha: { label: 'q/ha', f: LB_PER_T / 10 / AC_PER_HA },
    },
  },
  grainPrice: {
    base: 'dbu', label: 'Grain price', crop: true,
    units: {
      dbu: { label: '¤/bu', f: 1 }, dcwt: { label: '¤/cwt', f: c => c.tw / 100 },
      dton: { label: '¤/ton', f: c => c.tw / 2000 }, dt: { label: '¤/t', f: c => c.tw / LB_PER_T },
    },
  },
};

// Preferred display unit per system for each dimension
export const PREF = {
  length: { us: 'ft', metric: 'm' }, area: { us: 'ac', metric: 'ha' }, volume: { us: 'gal', metric: 'L' },
  mass: { us: 'lb', metric: 'kg' }, speed: { us: 'mph', metric: 'kmh' }, pressure: { us: 'psi', metric: 'kPa' },
  temperature: { us: 'F', metric: 'C' }, flow: { us: 'gpm', metric: 'lpm' }, massRate: { us: 'lbac', metric: 'kgha' },
  volRate: { us: 'galac', metric: 'Lha' }, countRate: { us: 'pac', metric: 'pha' }, moneyArea: { us: 'dac', metric: 'dha' },
  areaRate: { us: 'ach', metric: 'hah' },
  grain: { us: 'bu', metric: 't' }, grainYield: { us: 'buac', metric: 'tha' }, grainPrice: { us: 'dbu', metric: 'dt' },
};

// Units offered in calculator dropdowns: only the ones a farmer would actually
// use for that kind of quantity. Fields/results can narrow further with `unitSet`.
// (The Unit Converter still offers every unit.)
export const PRACTICAL = {
  length: ['ft', 'in', 'yd', 'm', 'cm'],
  area: ['ac', 'ha'],
  volume: ['gal', 'L'],
  mass: ['lb', 'ton', 'kg', 't'],
  speed: ['mph', 'kmh'],
  pressure: ['psi', 'kPa', 'bar'],
  temperature: ['F', 'C'],
  flow: ['gpm', 'lpm'],
  massRate: ['lbac', 'kgha'],
  volRate: ['galac', 'Lha'],
  countRate: ['pac', 'pha'],
  moneyArea: ['dac', 'dha'],
  areaRate: ['ach', 'hah'],
  grain: ['bu', 'lb', 'ton', 't'],
  grainYield: ['buac', 'tha', 'kgha'],
  grainPrice: ['dbu', 'dt', 'dton'],
};

/** Units to offer for a field or result: its own set, else the practical set; always includes `current`. */
export function practicalUnits(dim, unitSet, current) {
  const list = (unitSet || PRACTICAL[dim] || Object.keys(DIMS[dim].units)).filter(u => DIMS[dim].units[u]);
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}

export function defaultUnit(dim, system, override) {
  if (override && override[system]) return override[system];
  return (PREF[dim] && PREF[dim][system]) || DIMS[dim].base;
}

function factor(dim, unit, ctx) {
  const u = DIMS[dim].units[unit];
  if (!u) throw new Error(`Unknown unit ${unit} for ${dim}`);
  return typeof u.f === 'function' ? u.f(ctx || {}) : u.f;
}

export function toBase(dim, value, unit, ctx) {
  if (dim === 'temperature') {
    if (unit === 'C') return value * 9 / 5 + 32;
    if (unit === 'K') return (value - 273.15) * 9 / 5 + 32;
    return value;
  }
  return value * factor(dim, unit, ctx);
}

export function fromBase(dim, value, unit, ctx) {
  if (dim === 'temperature') {
    if (unit === 'C') return (value - 32) * 5 / 9;
    if (unit === 'K') return (value - 32) * 5 / 9 + 273.15;
    return value;
  }
  return value / factor(dim, unit, ctx);
}

export function convert(dim, value, from, to, ctx) {
  return fromBase(dim, toBase(dim, value, from, ctx), to, ctx);
}

export function unitLabel(dim, unit, currency = '$') {
  const u = DIMS[dim]?.units[unit];
  return u ? u.label.replace('¤', currency) : unit;
}

export function unitList(dim, only) {
  const ids = Object.keys(DIMS[dim].units);
  return only ? ids.filter(id => only.includes(id)) : ids;
}

export const CONST = { LB_PER_KG, LB_PER_T, AC_PER_HA, GAL_PER_L, FT_PER_M, FT3_PER_BU, BU_PER_FT3: 1 / FT3_PER_BU };
