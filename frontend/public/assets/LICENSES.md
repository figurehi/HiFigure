# HiChart Asset Licenses

This folder documents the paper-safe visual assets used by HiChart.

## Project-authored scientific symbols

The scientific symbols inserted by the SVG editor's `Scientific symbols` palette
are authored directly in the HiChart codebase as simple SVG geometry. They do not
copy paths, glyphs, or icon artwork from third-party packs.

Current project-authored symbols:

- Dataset
- Image
- Model
- Metric
- Feedback loop

These symbols are intended to be usable in HiChart screenshots, paper figures,
demo videos, and open-source releases under the same license terms as the
HiChart project.

## Fonts

All typefaces are self-hosted through [Fontsource](https://fontsource.org)
packages (`@fontsource/*` and `@fontsource-variable/*`, v5.3.0) and wired up
with `next/font/local` in `app/layout.tsx`. Nothing is fetched from Google
Fonts at build or run time, so builds work offline and no visitor request
reaches a third-party CDN.

Interface faces:

- Inter (variable) — `--font-sans`
- Source Serif 4 (variable) — `--font-serif`
- IBM Plex Sans, IBM Plex Sans Condensed, JetBrains Mono, Atkinson Hyperlegible

Figure faces offered in the Style and Match pickers:

- Karla, EB Garamond, Archivo Black, Libre Baskerville, Space Grotesk,
  Barlow Condensed, Lora, Roboto Condensed, Public Sans, Zilla Slab, Manrope,
  IBM Plex Mono, Roboto, Nunito Sans

Every family above is distributed under the SIL Open Font License 1.1, which
permits embedding and redistribution as long as the license notice travels with
the font files. Only the Latin subset is bundled. The UI also exposes generic
fallback stacks for sans, serif, and monospace rendering.

When adding a face, prefer an OFL-1.1 or Apache-2.0 family available on
Fontsource and record it here.

## Approved future icon sources

If HiChart imports external SVG icon assets later, prefer sources with permissive
licenses and record the exact source URL, author if required, license, and import
date in this file.

Recommended allowlist:

- Lucide Icons: ISC License
- Tabler Icons: MIT License
- Phosphor Icons: MIT License
- BioIcons: use only entries with CC0 or MIT unless attribution is added

Avoid assets that require unclear commercial terms, nontrivial attribution in
each figure, or share-alike obligations that would complicate paper figures and
open-source distribution.
