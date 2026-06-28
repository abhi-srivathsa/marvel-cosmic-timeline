# Marvel Cosmic Timeline

A minimal vertical timeline website for the Marvel Cinematic Universe and connected Marvel TV timeline.

## What It Does

- Vertical scroll where the active event comes into focus while previous and next events fade and scale down.
- Compact headline, attached Marvel logo, and attached Marvel background art used as a faded fixed backdrop.
- Search by title, character, year, or event, with matched events highlighted and centered.
- Timeline data follows Marvel's June 2, 2026 Disney+ Complete MCU Timeline article, with Marvel Television seasons included where they connect to the chronology.
- Local event stills are downloaded from MCU Wiki scene/event pages, file thumbnails, and official trailer thumbnails to avoid blank remote hotlinking.

## Development

```bash
pnpm install
node scripts/download-stills.mjs
pnpm dev
pnpm build
```

## Sources

- Timeline reference: https://www.marvel.com/articles/movies/mcu-timeline-order-disney-plus
- Interaction reference: https://www.awwwards.com/inspiration/story-timeline-farmform
- Stills source: https://marvelcinematicuniverse.fandom.com/
