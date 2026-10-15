# Conflict Atlas
Copy `src/` and `public/` over a fresh Vite React project, then:

    npm install xlsx @fontsource/overpass
    npm run dev

`public/data.xlsx` holds everything you edit: environmental entries (sheet 1), `Conflicts` (which countries took part in each conflict) and `Conflict Tiers` (the red shade per country).
Country facts load live from Wikidata and are cached in the browser for 14 days.

## Phones, tablets and touch
- Pan/zoom use Pointer Events: one finger drags, two fingers pinch, tap selects a country (drags never select). Mouse wheel still zooms.
- Layouts: desktop 3 columns; tablet landscape narrower columns; tablet portrait = map on top, key/info and cards side by side; phone = sticky map on top, everything else scrolls beneath, tapping a country scrolls to its details.
- Hover tooltips are mouse-only; touch shows a name chip on the map instead. Controls grow to 44px on touch devices.
