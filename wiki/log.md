# Wiki Log

Append-only record of wiki maintenance activity.

## 2026-04-11

- Added `WIKI_SCHEMA.md` to define the wiki workflow without replacing `CLAUDE.md`
- Added `raw/README.md` to establish the immutable source layer
- Added `wiki/index.md` as the master wiki catalog
- Added scaffold pages for `dashboard.md`, `analytics.md`, `flashcards.md`, and `journal/template.md`
- Added typed wiki directories: `summaries/`, `concepts/`, `entities/`, `syntheses/`, and `presentations/`
- Kept existing `cases/`, `solvers/`, and `errors/` pages intact for gradual migration

## 2026-04-13

- Added `wiki/syntheses/openfoam-13-tutorial-atlas.md` with a breadth-first inventory of all 252 runnable tutorial case roots found in the local OpenFOAM 13 image
- Updated `wiki/index.md` to surface the tutorial atlas from the master catalog

## 2026-04-14

- Verified `microfluidica/openfoam:13` as the canonical OpenFOAM 13 source image for this repo
- Verified `foamVersion`, `foamRun`, the cavity tutorial path, and `/opt/openfoam13/etc/bashrc` inside that image
- Updated stale setup and repo-state docs to match the current health-check and auto-fix implementation
- Added `docs/AGENT_CHANGES.md` as an append-only cross-agent change ledger
