# Farm Calc

A phone app (installable PWA) for farm calculations, with a notebook where every
calculation is written out by hand and can be moved around and marked up.

Plain HTML/CSS/JavaScript: nothing to install.

## Run it on this PC

Double-click `index.html`. That's it.

The source lives in `js/` as separate files. The page loads `js/bundle.js`, one
combined copy of them, because browsers won't load separate module files from a
double-clicked page. **After editing anything in `js/`, rebuild the bundle:**

```
py tools/build.py
```

Math tests (these need a local server): run `py -m http.server 8765`, then open
http://localhost:8765/tests.html

## Put it on your phone

The phone needs an **https** address to install the app. Any static host works:

- **GitHub Pages**: push this folder to a repo, then Settings → Pages → deploy from the main branch.
- **Netlify Drop**: drag this folder onto https://app.netlify.com/drop.

Then on the phone:
- **Android (Chrome):** ⋮ menu → *Install app*.
- **iPhone (Safari):** Share → *Add to Home Screen*.

After the first open it works offline. Data (notebook, drawings, settings) stays on
the phone; use Settings → *Export backup file* to keep a copy.

**When you change files**, bump `VERSION` in `sw.js` so installed phones pick up the update.

## Adding a calculator

Each calculator is a definition object in `js/calcs/<category>.js`, and the form,
results, unit switching, notebook card and "show work" steps are generated from it.
See the comment at the top of `js/calcs/_h.js` for the format, then run
`py tools/build.py`.

## Layout

| Path | What |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | App shell, install info, offline cache |
| `css/styles.css` | All styling (black / white / orange tokens at the top) |
| `js/app.js` | Router (`#/`, `#/calc/:id`, `#/notebook`, `#/settings`) |
| `js/engine.js` | Turns inputs into results; builds notebook snapshots |
| `js/units.js`, `js/crops.js` | Unit tables and crop constants (test weight, moisture, …) |
| `js/calcs/*.js` | The calculators, one file per category |
| `js/pages/notebook.js` | Notebook: cards, pen/highlighter/line/eraser, pan & zoom, export |
| `js/store.js` | Settings (localStorage) and notebook data (IndexedDB) |
