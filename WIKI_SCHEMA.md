# OpenFOAM Studio Wiki Schema

This file defines how the OpenFOAM Studio knowledge base should be created and maintained in the LLM Wiki pattern.

## Purpose

The wiki is the long-lived knowledge layer for OpenFOAM Studio. It exists to help the model reason reliably about OpenFOAM 13, the repo's tested case-generation path, failure diagnosis, and product decisions without inventing unsupported behavior.

The wiki is not a scratchpad and not a duplicate of app code. Raw source material is curated by humans. Wiki pages are written and maintained by the model. Humans should update sources, not manually rewrite the wiki except for obvious corrections.

## Source of truth order

When sources disagree, use this order:

1. Current tests and fixtures in this repo
2. Official OpenFOAM Foundation v13 documentation
3. Project architecture and planning docs
4. Existing wiki pages
5. External articles, tutorials, and forum posts

If there is still uncertainty, preserve the ambiguity and mark confidence accordingly.

## Directory structure

The knowledge base uses these layers:

```text
raw/                     Immutable source documents curated by humans
wiki/index.md            Master catalog of maintained pages
wiki/log.md              Append-only activity log
wiki/dashboard.md        Optional Obsidian dashboard
wiki/analytics.md        Optional Obsidian analytics page
wiki/flashcards.md       Optional spaced-repetition cards
wiki/summaries/          One page per raw source
wiki/concepts/           Core concepts, rules, patterns, workflows
wiki/entities/           Tools, software, specs, repos, benchmarks, organizations
wiki/syntheses/          Cross-source analyses and comparisons
wiki/journal/            Research and maintenance sessions
wiki/presentations/      Markdown slide decks
```

The existing topic folders such as `wiki/cases/`, `wiki/solvers/`, and `wiki/errors/` may continue to exist during migration, but new material should prefer the typed folders above.

## Page types

### Summary pages

Use for one raw source document. Name pages after the source.

Required sections:

- Title
- Source
- Summary
- Key facts
- Open questions
- Related pages
- Confidence

### Concept pages

Use for stable ideas such as solver selection, case structure, patch consistency, pressure reference rules, or error-handling heuristics.

Required sections:

- Title
- What it is
- Why it matters in this repo
- Rules
- Failure modes
- Related pages
- Sources
- Confidence

### Entity pages

Use for named things such as OpenFOAM 13, `foamRun`, `incompressibleFluid`, Ghia benchmark, Docker image names, or external tools.

Required sections:

- Title
- Type
- Description
- Repo relevance
- Interfaces or dependencies
- Related pages
- Sources
- Confidence

### Synthesis pages

Use when answering a cross-cutting question requires combining several pages or sources.

Required sections:

- Title
- Question
- Answer
- Evidence
- Caveats
- Related pages
- Confidence

## Metadata conventions

Every maintained wiki page should begin with lightweight frontmatter:

```yaml
---
type: concept | entity | summary | synthesis | journal
status: draft | stable
confidence: low | medium | high
sources:
  - raw/example-source.md
tags:
  - openfoam
  - stage0
updated: YYYY-MM-DD
---
```

Guidelines:

- `type` is required
- `confidence` reflects evidence quality, not writing quality
- `sources` should point to raw files when possible
- `tags` should stay sparse and useful
- `updated` should reflect the last substantive maintenance pass

## Linking rules

- Use Obsidian-style internal links like `[[solver-selection]]` where practical
- Add a `Related pages` section on every maintained page
- Prefer links to canonical concept/entity pages instead of repeating explanations
- If a page references a raw source, cite that source explicitly in the `Sources` section

## Confidence levels

- `high`: directly supported by current tests, fixtures, or official OpenFOAM v13 docs
- `medium`: supported by reputable docs or repo context, but not validated by tests here
- `low`: useful working hypothesis, migration note, or incomplete synthesis that needs verification

## Ingest workflow

Trigger examples:

- `ingest raw/<file>`
- `ingest sources about <topic>`

When ingesting:

1. Read the raw source completely
2. Create or update a summary page in `wiki/summaries/`
3. Update affected concept pages, entity pages, and syntheses
4. Add cross-links between new and existing pages
5. Update `wiki/index.md`
6. Append a short entry to `wiki/log.md`
7. If confidence is low or contradictions exist, note them explicitly

Do not edit files under `raw/`.

## Query workflow

When answering from the wiki:

1. Search wiki pages first
2. Prefer stable concept/entity pages over transient notes
3. Synthesize across pages when needed
4. Cite the page names used
5. If the answer required novel synthesis, consider creating or updating a page in `wiki/syntheses/`

## Lint workflow

Trigger examples:

- `lint`
- `health check`
- `audit wiki`

Lint should check for:

- orphan pages with no inbound or related links
- pages missing metadata
- contradictions with tests or official OpenFOAM v13 docs
- duplicated concepts split across multiple files
- missing source provenance
- stale pages that still reflect outdated solver naming or architecture assumptions
- low-confidence claims that should be upgraded, qualified, or removed

Fix what can be fixed safely. Report the rest clearly.

## Domain taxonomy

Preferred tags:

- `openfoam`
- `openfoam13`
- `stage0`
- `stage1`
- `stage2`
- `stage3`
- `stage4`
- `solver`
- `mesh`
- `boundary-conditions`
- `numerics`
- `validation`
- `errors`
- `docker`
- `benchmark`
- `architecture`

## Writing rules

- Prefer concise, factual writing over tutorial prose
- Separate repo truth from general OpenFOAM truth
- Call out version-specific behavior, especially OpenFOAM Foundation v13 naming
- State when something is inferred from tests instead of guaranteed by implementation
- Avoid unsupported generalization beyond the currently validated path
- Preserve contradictions rather than smoothing them over

## Migration guidance for the current repo

The current wiki contains useful pages under `wiki/cases/`, `wiki/solvers/`, and `wiki/errors/`. During migration:

- keep those pages intact unless there is a clear correction
- create typed pages in `wiki/concepts/`, `wiki/entities/`, `wiki/summaries/`, and `wiki/syntheses/` for new work
- gradually fold the strongest existing pages into the new schema
- use `wiki/index.md` to bridge old and new structures

## Non-goals

- Do not turn the wiki into executable product logic
- Do not let the wiki override tests
- Do not treat external tutorials as authoritative over repo fixtures or official Foundation v13 docs
