# MADMADHOUSE

A visual CV and flyer archive for the MADMADHOUSE collective: three pages (MMH, ARCHIVE, INFO) with posters as the primary artifact. Live at https://madmadhouse.com.

## Stack
Vite, React 19, TypeScript, React Router, Lenis and GSAP for motion, ThumbHash blur-up placeholders. Hosted on Cloudflare.

## Layout
- `web/`: the site. Event data is in `web/src/data/events.ts` and every animated value comes from `web/src/motion/tokens.ts`.
- `scripts/`: the pipeline that turns harvested posts into data and image derivatives (AVIF, WebP, JPEG ladder). Includes validators for the harvest manifest and assets.
- `PLAN.md`, `OVERVIEW.md`, `DESIGN-DECISIONS.md`, `MOTION-INVENTORY.md`: why the site is built the way it is.

## Run
```
cd web
npm install
npm run dev
```

## Not in this repo
Poster images (owned by the collective and its artists), raw extraction data, and private working notes are kept out on purpose. The pipeline scripts expect them locally, so a fresh clone builds the site from the committed event data but cannot regenerate it.
