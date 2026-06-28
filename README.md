# Marvel Cosmic Timeline

A minimal horizontal timeline website for the Marvel Cinematic Universe and connected Marvel TV timeline.

## What It Does

- Horizontal scroll where the active event comes into focus while previous and next events remain visible, smaller, and faded.
- Compact headline, attached Marvel logo, and attached Marvel background art used as a faded fixed backdrop.
- Search by title, character, year, or event with a dropdown of matching entries; selecting one navigates to that event.
- A continuous timeline line with a point for every event.
- Timeline data follows Marvel's June 2, 2026 Disney+ Complete MCU Timeline article, with Marvel Television seasons included where they connect to the chronology.
- Local poster assets are downloaded from MCU Wiki title pages and high-resolution official poster files.

## Development

```bash
pnpm install
node scripts/download-posters.mjs
pnpm dev
pnpm build
```

## Sources

- Timeline reference: https://www.marvel.com/articles/movies/mcu-timeline-order-disney-plus
- Poster source: https://marvelcinematicuniverse.fandom.com/
