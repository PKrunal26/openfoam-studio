# Wiki Index

This is the master catalog for the OpenFOAM Studio knowledge base.

## Canonical pages

### Concepts

- [[case-structure]] — OpenFOAM case layout and dependency ordering
- [[file-inventory]] — minimum authored file sets by regime
- [[solver-selection]] — solver/module selection policy
- [[lid-driven-cavity]] — canonical validation case
- [[reviewer-checklist]] — failure triage workflow
- [[common-failures]] — common error patterns and safe fixes

### Entities

- [[incompressibleFluid]] — primary supported solver module
- [[openfoam-13-agent-guide]] — repo-specific OpenFOAM 13 operating guide

### Syntheses

- [[openfoam-13-tutorial-atlas]] — breadth-first inventory of the OpenFOAM 13 tutorial tree

### Project context

- [[vision]] — product motivation and constraints
- [[project-log]] — project history and milestones
- [[README]] — wiki reading order

## Folder map

- `wiki/cases/` — case structure and canonical cases
- `wiki/solvers/` — solver and module knowledge
- `wiki/errors/` — failure patterns and review heuristics
- `wiki/summaries/` — source summaries
- `wiki/concepts/` — normalized concept pages
- `wiki/entities/` — normalized entity pages
- `wiki/syntheses/` — cross-cutting analyses, including the OpenFOAM tutorial atlas
- `wiki/journal/` — maintenance and research notes
- `wiki/presentations/` — slide decks

## Migration notes

- The current wiki began as a curated documentation set, not a full LLM Wiki.
- `WIKI_SCHEMA.md` defines the target maintenance workflow.
- Existing pages remain valid while we migrate toward typed wiki pages and raw-source ingest.
