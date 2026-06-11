# PropertyLine

AI-powered property boundary measurement from satellite imagery.
Live production site: [propertyline.app](https://propertyline.app)

## How it works

Enter an address → the app geocodes it and pulls a Google Static Maps satellite
image → you drag a boundary polygon to match your lot → add structures (sheds,
garages, pools), a house footprint, setback lines, and labeled measurement
lines → export an annotated site-plan request image for Gemini.

## Project structure

```
index.html              Single-page app shell
styles.css              Theme + layout (dark red/black)
js/
  main.js               App core: state, canvas rendering, tools, events
  geometry.js           Pure polygon/segment/matrix math (no DOM, no state)
  format.js             Formatting helpers + clipboard utility
  toast.js              Toast notification system
netlify/functions/
  geocode.js            Address → lat/lng (Google Geocoding API)
  satellite-image.js    lat/lng → static satellite image URL
  autocomplete.js       Address autocomplete (Google Places API)
netlify.toml            Netlify build config
```

The serverless functions keep the Google Maps API key (`GOOGLE_MAPS_KEY` env
var) server-side. For localhost development you can instead store a key in the
in-app "Local Dev API Keys" panel (saved to localStorage only).

## Local development

```bash
npx netlify dev    # serves the site + functions (needs GOOGLE_MAPS_KEY)
# or, frontend only (use the localhost dev key panel):
npx serve .
```

## Controls

| Action | Input |
|---|---|
| Zoom | Scroll wheel (to cursor), pinch, `+` / `−`, toolbar |
| Pan | Drag empty map area / two-finger drag |
| Fit boundary | `F` or ⛶ button |
| Reset view | `0` or ↺ button |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` |
| Add corner | Double-click on a boundary line |
| Remove corner | Double-click a corner |
