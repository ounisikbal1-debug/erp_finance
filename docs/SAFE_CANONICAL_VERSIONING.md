# SAFE ERP canonical source and versioning

## Canonical source

`C:\Users\USER\OneDrive\Desktop\safe_Projet 2` is the sole canonical implementation.
The historical improvement folders and their ZIP/patch files are immutable
provenance, not writable branches or sources to overlay. Integrate only reviewed,
compatible behavior into the canonical target. Preserve conflicting historical
variants and record their hashes and disposition in
`HISTORICAL_IMPROVEMENT_SOURCES.json`.

## Integration record

For each historical cohort, record its source archive/path and SHA-256, feature
and target files, disposition (`integrated`, `already-present`, `deferred`,
`blocked`, or `not-applicable`), conflict resolution, and targeted test
commands/results. A source hash identifies provenance; it does not mean that
the source was applied or that its behavior is correct.

## Release discipline

1. Make changes only in the canonical target and preserve existing target
   behavior unless a reviewed requirement explicitly changes it.
2. Resolve file-level differences semantically. Do not copy cumulative trees or
   apply a patch wholesale when the target has diverged.
3. Keep schema changes, migrations, authorization, APIs, UI wiring, and
   regression tests in the same cohort. Never run schema changes against a user
   database as part of validation.
4. Run the cohort's focused tests, then Prisma validation/generation,
   TypeScript, the complete safe test suite, and production build.
5. After verification, update the integration record, increment the package
   version according to SemVer (patch for compatible fixes, minor for
   backward-compatible features, major for incompatible behavior), and create
   a new release artifact from the canonical tree. Never rewrite historical
   ZIPs; include the manifest and its source hashes in each release.

## Database isolation

`SAFE_ERP_TEST_DATABASE_URL` selects a test database in test mode.
`SAFE_ERP_DATABASE_URL` is an opt-in runtime override for an independent
installation such as a draft copy. With neither variable set, the existing
default database path is unchanged. Initialize a draft database separately;
never point the draft at the original version's database or migrate the
original database as part of testing.

## Current status

The source-hash inventory records every historical file except `.git` and
`node_modules` content. The inventory is evidence of provenance only. Cohort
dispositions and validation results must be recorded separately and updated as
integration proceeds.
Run `node src/scripts/verify-historical-improvement-sources.js` to verify every
recorded source hash. Set `SAFE_HISTORICAL_ROOT` if the historical folder has
moved, or `SAFE_HISTORICAL_MANIFEST` to verify another manifest.
