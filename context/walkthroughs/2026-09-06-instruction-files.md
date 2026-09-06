# Walkthrough: Repository Instructions

Date: 2026-09-06

## Completed

- Added `AGENTS.md` with verified repository context, locked architecture constraints, planned verification order, secret/configuration safeguards, and the required context/walkthrough workflow.
- Added `CLAUDE.md` as a redirect to `AGENTS.md`; repository guidance is maintained in one place.

## Sources reviewed

- `RentUZ-specs.md`
- `context/0_Phase.md` (cross-cutting source of truth)
- `context/1_Phase.md` (schema/auth/BFF ownership)
- `context/7_Phase.md` (admin ownership)
- `context/8_Phase.md` (final verification/deployment)
- `.kilo/package.json` and `.kilo/.gitignore`
- Git-tracked file list and recent repository history

## Verification

- Confirmed the repository is currently specification-first: only `LICENSE` is tracked; implementation manifests, source directories, CI, Docker, and README are not yet present.
- Confirmed `CLAUDE.md` only redirects to `AGENTS.md`, and the walkthrough contains no claims that absent commands have already been verified.
