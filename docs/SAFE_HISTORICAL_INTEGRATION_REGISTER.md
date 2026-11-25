# Historical improvement integration register

The canonical target is `C:\Users\USER\OneDrive\Desktop\SAFE_ERP-DRAFT 2`.
Historical sources remain read-only. Source checksums are recorded in
`HISTORICAL_IMPROVEMENT_SOURCES.json`; a checksum is provenance, not proof that
a feature is integrated. Update this register after each tested cohort.

| Cohort / source material | Status | Target evidence or disposition |
|---|---|---|
| Monthly close: `0-SAFE_Cloture_Mensuelle.zip`, `0-SAFE_Cloture_Mensuelle_Annuelle.zip` | Integrated | `src/application/modules/monthly-close/`, `MonthlyClosePanel.tsx`, schema and migrations; included in the previously passing full suite. |
| Equipment maintenance: Nov. 5 maintenance ZIP/patch | Integrated | `src/application/modules/maintenance/`, `EquipmentMaintenancePanel.tsx`, schema/API/auth/migrations; included in the previously passing full suite. |
| Quality/CAPA: Nov. 5 quality ZIP/patch | Integrated | `src/application/modules/quality/`, `QualityPanel.tsx`, schema/API/auth and migration; migration was authored because the historical package lacked one; included in the previously passing full suite. |
| Reversal retry and invoice cancellation: cumulative/patch releases | Integrated | Finance, purchase and sales workflows; rejection restores the supplier invoice to `POSTED` and sales invoice to `ISSUED`, permitting a new attempt; partial unique-index migration and SQLite-memory migration test. |
| Supplier payables aging: `SAFE_ERP_Factures_Balance_Fournisseurs_20261103_Patch.zip`, `SAFE_ERP_Factures_Balance_Fournisseurs_20261103_Cumulatif.zip`, and Nov. 6 documentation patches | Integrated / equivalent current path; superseded warehouse schema not overlaid | The historical balance was reorganized under `src/application/modules/purchases/payables-aging.ts` with tests, service/API and `PayablesAgingPanel`. The user guide correction is integrated below. Its simple `Material.warehouseId` migration is superseded by entity-scoped `Warehouse` and `MaterialWarehouseStock`. The historical production-order FK used `ON DELETE SET NULL`; the current Prisma schema and migration use `RESTRICT`, so that behavioral difference was not overwritten. |
| Nov. 3 supplier-balance cumulative: `SAFE_ERP_Factures_Balance_Fournisseurs_20261103_Cumulatif.zip` (SHA-256 `78a775cae87f2d07767ed2d9d20ebe9601e9a3f09762cf5863ba8860904270e5`) | Compared; no snapshot overlay | CRC is valid (307 files). Against `SAFE_ERP_Cumulatif_20261102-3.zip`, it adds 36, removes one and modifies 27 members. All 264/265/272 member paths from the Nov. 2 `-1/-2/-3` snapshots exist in DRAFT 2 (125/130/137 byte-identical respectively). Missing members in the Nov. 3 cumulative are package metadata, nested historical source bundles, two superseded migrations, the old `payables` module path, and the three demo-load scripts. Cancellation, aging, deposits/production, Power BI and password-reset functions are present in newer/current layers; see the specific dispositions below. |
| Nested password-reset source in the Nov. 3 cumulative | Already present byte-for-byte | `historical-additions/SAFE_Reinitialisation_Sure_Mot_De_Passe_SA_20261105` maps to the existing `src/application/security/passwords.ts` and `src/scripts/reset-admin-password.ts`; both match exactly and the target has `reset-admin-password` and `test:password-reset` scripts. |
| Nov. 6 Rapports/Export guide patch bundled in the Nov. 3 cumulative | Reconciled against the current UI; stale patch wording not copied | The archive patch says the Reports view is unavailable, but current `src/presentation/ReportsPanel.tsx` implements 10 role-filtered calculated views. `README.md` and `docs/GUIDE_UTILISATEUR.md` now describe those views accurately, remove the unsupported 12-report/28-tab certified-pack claims, and clarify that the historical JSON/SSE LAN-sharing procedure is not implemented. No application export, data, or financial behavior changed. |
| Nov. 3 `demo-load` fixture/importer (`src/scripts/demo-load-cli.ts`, `demo-load-fixture.ts`, `demo-load-worker.ts`) | Not integrated; incompatible and unsafe for this target | The fixture imports the removed `src/application/modules/payables/service` path and targets the historical SQLite schema. Its `--apply` mode replaces a chosen SQLite DB file after backup; the current DRAFT 2 PostgreSQL work and no-real-data constraint make a direct port/merge inappropriate. It was inspected but never executed. |
| Sales invoice export: `0-SAFE_ERP_Export_Factures_Ventes_20261104.zip` | Integrated | `src/presentation/sales-invoice-export.ts`, tests and existing invoice panel wiring; CSV formula prefixes and CSV quoting are covered. Targeted sales tests passed 25/25, typecheck and build passed. |
| Finance, approval, FX, cashflow, consolidation, budget, controlling, production, and BI/Power BI cumulative bundles | Already present / equivalent baseline | Target already registers these modules and contains their feature areas; cumulative whole-tree bundles were not overlaid. Power BI Desktop starter assets exist under `integrations/powerbi/desktop-starter/`. |
| Stock adjustment/accounting | Integrated with audited reason | `MaterialsService.updateStock` still updates `Material.quantity` and posts its balanced journal entry in one transaction. It now requires an authenticated actor and a 5â€“500 character reason, records an audit movement, and cannot reduce stock already assigned to warehouses. Initial stock is also audited. Production posting remains atomic, adds movement history, and consumes only unassigned stock when warehouse balances exist. |
| Warehouse locations, reorder thresholds, stock history/transfers, barcode search/metadata and unit metadata | Integrated; independent extension only | `20261106130000_stock_warehouses_movements_metadata`, `materials/warehouse-validation.ts`, `StockMovement`, scoped warehouse APIs and `StocksPanel` add warehouse balances, idempotent internal transfers, history, aggregate reorder thresholds, barcode search and unit metadata. Legacy `Material.quantity` is unchanged and remains the aggregate; existing quantity is treated as unassigned until transferred. Transfers update location balances and audit rows atomically without journal entries. Source material was read from `0-SAFE_ERP_Ajustements_Stock_20261104.zip`, `0-SAFE_ERP_Historique_Mouvements_Stock_20261104.zip`, `0-SAFE_ERP_Stock_Unit_Metadata_20261105.zip`, `0-SAFE_ERP_Transferts_Interdepots_20261104.zip`, and the barcode search ZIP; no source files/archives were modified. |
| Sales customer contacts/company-scoped codes, quotes, manual reminders | Integrated | Audited contact edits, entity-scoped customer-code uniqueness, non-posting quote drafts and editable manual overdue reminders. Invoice export remains integrated. `npm run test:sales` passed 38/38; `npm run test:receivables` 11/11; `npm run test:invoice-cancellation` 10/10. |
| Read-only RBAC policy matrix and limited accounting role | Role integrated; prototype-only account provisioning prepared | The matrix reads effective server rules from an admin-only endpoint. `ACCOUNTANT` is limited to dashboard, accounting/ledger, monthly close, financial analysis, taxation and anomalies; admin, HR, sales, stock, budget, treasury, purchases and consolidation policies remain denied. `src/scripts/provision-draft-prototype-accounts.ts` provides a local masked-input workflow for the independent draft DB only, creates a backup before updating the four seeded accounts and adding `compta`, and does not change the global password minimum. It has not been run; no account/password changes or backups have been made. |
| HR leave requests | Existing target preserved; equivalent core verified | The target's `HrLeaveRequest` model, implementation and migration are preserved. The historical leave ZIP's core leave files match the target; existing leave tests passed 12/12. |
| HR employee document metadata, recruitment, interviews, expense claims | Integrated | Metadata-only document records, scoped recruitment/interviews, and expense submission/review are wired with four migrations and tests. Expense approval intentionally creates neither payment nor accounting entry. HR workflow tests passed 11/11. |
| LF 2026 commute-transport IRPP exemption | Restored from finalized source; rates unchanged | `safe_Projet 2/src/application/modules/hr/service.ts`, its payroll input and tests, and `PayrollSimulationPanel.tsx` establish the prior implementation: from `2026-01`, qualifying employer-provided home-to-work transport is excluded from IRPP taxable gross, not gross pay, CNSS or CSS. DRAFT 2 now validates and passes the payslip period, applies the same taxable-base formula, and labels/discloses the qualifying input. Focused payroll tests verify the 2025-12/2026-01 boundary and persisted payslip path. This restores an already implemented rule; it does not independently certify legal applicability. |
| CNSS employer contribution rules | Validated per project-owner confirmation; preserve existing rules | The project owner confirms that the Tunisian rates and regulatory rules, including CNSS, IRPP and IS, are documented and validated by an expert accountant. Historical duplicate packages are not the authority for those values; do not change rates based on archive comparisons. This status does not establish that every calculation or declaration path is fully implemented or certified. |
| One-hour session duration: `SAFE_ERP_Patch_Duree_Session_1h.zip` and `safe-session-duration-patch/` | Already present; divergent semantics preserved | Target `src/shared/session.ts` uses a 60-minute idle timeout renewed by activity and has tests. Historical token expiry is a fixed one-hour expiration; it was not copied because that would remove idle-renewal behavior and change auth semantics. |
| Local consultative AI: `0-SAFE_ERP_AI_Local_Consultative_Integration.zip` (SHA-256 `15d6722d0edcc9eb56da31c7f6a633fe77c172f4f5490e8e29dc2e3683a74e98`) and `SAFE_ERP_AI_Local_Consultative_Integration.zip` (SHA-256 `33b156d46cb7720cb0455a2f0a0f1b815abc640feeb81234d16417561e58bf53`) | Integrated selectively | Added `src/shared/country-language.ts`, country-based FR/EN deterministic insights with prior-year P&L comparisons in `src/presentation/financial-insights.ts` / `IncomeStatementPanel.tsx`, and equal-duration preceding-period evidence and language selection in the local-only `src/application/modules/ai/service.ts`. Ambiguous/unsupported country codes fail closed; zero baselines have no percentage. Tests cover prompt data minimization, period boundaries, language mapping, and explanation evidence. Preserved the newer Ollama gateway, OCR/invoice analysis, validation and human-review safeguards; no historical machine/model assessment was imported. |
| Accounting/invoicing prototype: `0-0-0-SAFE_ERP_Comptabilite_Facturation.zip` (SHA-256 `ce9c5632aea0e9a905cc0f880b9b939d21eb9b27a8e3a27391c46185ae23d0d4`) | No code delta integrated | The archive is an older prototype; current finance, sales, purchase and accounting paths are more developed. Its obsolete README statements were not copied. |
| Restored `0-SAFE_ERP_Cumulatif.zip` | Audited candidate; no missing application source path | The file at `C:\Users\USER\OneDrive\Desktop\Projet_SAFE_AmÃ©liorations\0-SAFE_ERP_Cumulatif.zip` is a valid 89-entry archive (SHA-256 `2a7e63d476797116798f2ccc64e30df924f5d539306498276d9074812b82dcf6`; 160,217 compressed / 569,997 uncompressed bytes). Its 86 source paths already exist in DRAFT 2 (20 byte-identical, 66 later/different); no source code was overlaid. The OneDrive recycle-bin display reported 5.45 MB, which does not match either local size; archive identity beyond the restored path/name remains unverified. The three Nov. 2 cumulative snapshots and Desktop pack are distinct later deliveries and were not overlaid. |
| Restored `0-0-SAFE_ERP_Cumulatif.zip` | Audited; no missing application source path; no snapshot overlay | The restored file at `C:\Users\USER\OneDrive\Desktop\Safe_Projet 2 Etat d'avancement\Projet_SAFE_AmÃ©liorations 3\0-0-SAFE_ERP_Cumulatif.zip` is a readable 93-entry ZIP with full CRC verification (SHA-256 `fd7386492760d29561b162962bbc47ce82cb554a148fd8e1c2bde53e7f496466`; 178,378 compressed / 631,713 uncompressed bytes). All 93 member paths exist in DRAFT 2: 27 are byte-identical and 66 differ; none was copied over the newer target. The recycle-bin size shown as 522 KB differs from the restored local size. |
| Power BI Desktop download referenced by the UI | Restored from current sources and covered by test | `public/powerbi/SAFE_Desktop_Starter.zip` was absent although the UI linked to it. It was generated from the five files in `integrations/powerbi/desktop-starter/`; `src/presentation/powerbi-desktop-pack.test.ts` checks the documented archive members. This is not a PBIX/PBIT report. |
| ZIPs under `Brouillons/` | Not integrated | These are explicitly draft/unconfirmed candidates; no code was copied from them. |
| Reporting/export guide, user guides, manifests, installation notes and checksum sidecars | Documentation/provenance only | Not application features. Preserve them in historical sources and record hashes. |
| Cumulative snapshots, repeated Nov. 2 delivery bundles, and duplicate releases | Preserved, not overlaid | They contain overlapping whole-tree versions. Integrate only unique, tested deltas; keep original archives intact. |

### File-by-file disposition of the 66 differing members in `0-0`

The archive is an older snapshot; differing bytes do not make a version more complete. All 66 members were compared as text, with the following exhaustive disposition (counts sum to 66):

| Classification | Members | Reason and action |
|---|---:|---|
| DRAFT 2 newer, broader, or functionally superseding | 59 | The current modules contain the expanded validations, entity/role scoping, workflows, and tests described below. Keep DRAFT 2; no archive code copied. |
| DRAFT 2 database/tooling configuration is newer | 3 | `src/data/prisma/schema.prisma`, `package.json`, `vite.config.mts`. The target schema and migration commands are broader and explicitly controlled; the archive package scripts include `prisma db push`, which is not an acceptable replacement for guarded migrations. |
| Sensitive/uncertain seed; excluded | 1 | `src/data/prisma/seed.ts`. The old seed includes a hard-coded corporate tax value and deletes country accounts before reseeding. It was not run or copied; no fiscal rates or live data were changed. |
| Historical documentation; corrected in target | 1 | `README.md`. The old snapshot contains obsolete feature and sharing claims; the current README and user guide were corrected to match the actual report UI and PostgreSQL limits. |
| Larger legacy monolith, not more complete | 1 | `src/presentation/App.tsx`. The archive has more lines but is an older monolithic UI with embedded synthetic/demo records and flows; DRAFT 2 uses modular, server-backed and role-scoped panels. No demo UI was overlaid. |
| Larger legacy dashboard script, unsafe/superseded | 1 | `src/scripts/create-dashboard.ts`. The archive script queries all entities without entity scoping, writes to a fixed user-profile path, and embeds unverified manual payroll rates and generic heuristics. DRAFT 2 generates the newer per-entity financial dashboard and workbook through the current service. No part was copied. |

The 59 newer/superseding application members, grouped by the same functional areas:

- Advanced finance and controlling (8): `src/application/modules/advanced-finance/analysis.test.ts`, `src/application/modules/advanced-finance/analysis.ts`, `src/application/modules/advanced-finance/api/index.ts`, `src/application/modules/advanced-finance/service.ts`, `src/application/modules/controlling/api/index.ts`, `src/application/modules/controlling/filters.test.ts`, `src/application/modules/controlling/filters.ts`, `src/application/modules/controlling/service.ts`.
- Authentication and finance (10): `src/application/modules/auth/api/index.ts`, `src/application/auth.ts`, `src/application/auth.test.ts`, `src/application/server.ts`, `src/application/modules/finance/account-validation.test.ts`, `src/application/modules/finance/account-validation.ts`, `src/application/modules/finance/journal-validation.ts`, `src/application/modules/finance/errors.ts`, `src/application/modules/finance/service.ts`, `src/application/modules/finance/api/index.ts`.
- HR and payroll (11): `src/application/modules/hr/employee-validation.test.ts`, `src/application/modules/hr/employee-validation.ts`, `src/application/modules/hr/errors.ts`, `src/application/modules/hr/payroll-input.ts`, `src/application/modules/hr/payroll-input.test.ts`, `src/application/modules/hr/payroll-rubriques.ts`, `src/application/modules/hr/payroll-rubriques.test.ts`, `src/application/modules/hr/service.ts`, `src/application/modules/hr/api/index.ts`, `src/application/modules/hr/progressive-tax.test.ts`, `src/presentation/PayrollSimulationPanel.tsx`. The old `gainIrppBonus`/`gainCssBonus` inputs were not restored: their tax-credit treatment is not established by this archive, and confirmed rates/rules must remain unchanged.
- Materials and stock (4): `src/application/modules/materials/api/index.ts`, `src/application/modules/materials/service.ts`, `src/application/modules/materials/validation.test.ts`, `src/application/modules/materials/validation.ts`.
- Sales (10): `src/application/modules/sales/customer-validation.test.ts`, `src/application/modules/sales/customer-validation.ts`, `src/application/modules/sales/api/index.ts`, `src/application/modules/sales/errors.ts`, `src/application/modules/sales/errors.test.ts`, `src/application/modules/sales/invoice-validation.ts`, `src/application/modules/sales/invoice-validation.test.ts`, `src/application/modules/sales/service.ts`, `src/application/modules/sales/service.test.ts`, `src/presentation/SalesInvoicesPanel.tsx`.
- Taxation (6): `src/application/modules/taxation/api/index.ts`, `src/application/modules/taxation/service.ts`, `src/application/modules/taxation/declaration.ts`, `src/application/modules/taxation/declaration.test.ts`, `src/application/modules/taxation/service.test.ts`, `src/presentation/TaxationPanel.tsx`.
- Administration/country configuration (7): `src/application/modules/admin/chart-of-accounts-configuration.ts`, `src/application/modules/admin/chart-of-accounts-configuration.test.ts`, `src/application/modules/admin/api/index.ts`, `src/application/modules/admin/country-configuration.ts`, `src/application/modules/admin/country-configuration.test.ts`, `src/application/modules/admin/service.ts`, `src/presentation/CountryConfigurationPanel.tsx`.
- Reports and accounting views (3): `src/presentation/exportUtils.ts`, `src/presentation/GeneralBalancePanel.tsx`, `src/presentation/GeneralLedgerPanel.tsx`.

No candidate archive version was judged safely superior and no application source file was replaced. This comparison covers the 66 differing members in this restored snapshot; it does not prove that every historical delivery outside this archive has been recovered.

## Full-history reconciliation result

`HISTORICAL_IMPROVEMENT_SOURCES.json` catalogs 520 source artifacts, including
88 ZIP archives (28 under `Brouillons/` and one `dist/` Power BI build copy).
The drafts were excluded as unconfirmed, and the `dist/` copy was treated as a
build artifact, not application source. The manifest checksums establish which
local files were inventoried, not that every historic delivery or session is
available.

Recorded source-tree comparisons found 156 identical files, 171 differing
files, two source-only fiscal notes and 148 DRAFT 2-only paths between
`safe_Projet 2` and DRAFT 2. Compared with DRAFT 1, DRAFT 2 had 396 identical
files, 45 differing files, no DRAFT 1-only source paths and 34 additional
paths. A finalized LF 2026 payroll implementation and its tests were found in
`safe_Projet 2` but absent from DRAFT 2; that specific period-dependent IRPP
transport rule is now restored as recorded above.

**Coverage is not proven complete from the project's first version.** No clean
pristine original snapshot or complete session/attachment history was
available. The restored `0-SAFE_ERP_Cumulatif.zip` is valid and was inventoried,
but its local size does not match the OneDrive recycle-bin display. The separate
`0-0-SAFE_ERP_Cumulatif.zip` remains unavailable, and published copies named
`0-SAFE_ERP_Cumulatif.zip` have different checksums; none was selected as a
substitute. The historical fiscal notes remain reference-only and were not
copied wholesale. The 21 Excel proposals and attached guides belong to the
next phase and were not applied; the workbook was not modified.

## Validation after the latest cumulative reconciliation

`node --test --require ts-node/register
src/application/modules/hr/payroll-input.test.ts
src/application/modules/hr/progressive-tax.test.ts
src/application/modules/hr/service.test.ts` passed 10/10. `npx tsc --noEmit`
passed. `npm run test:hr-payroll-persistence` passed 2/2, including the
synthetic HR migration check. After comparing the Nov. 3 cumulative, serial
targeted runs passed: invoice cancellation 11/11, purchases 47/47, materials
and stock migrations 61/61, production 11/11, BI/AI/Power BI 51/51, and
password reset 2/2. Test concurrency was limited to one worker because
initial parallel invocations exhausted the machine's available memory; those
parallel results are not treated as code failures. `npm run build
-- --outDir <temporary session path>` passed; the temporary build output was
removed. Vite emitted its existing advisory for chunks larger than 500 kB.
The full suite was not rerun after the latest changes; the full-suite result
below is the previously recorded baseline.

## Required stock workflow acceptance

The target must enforce these user-confirmed behaviors before a stock workflow
cohort is considered complete:

1. A receipt is linked to a supplier invoice that is approved for the same
   entity, but receipt does not post accounting automatically.
2. Picking changes neither on-hand stock nor accounting entries.
3. Only a confirmed dispatch decrements stock, atomically and idempotently.
4. Tests cover rejected/unapproved invoices, entity scope, retries, duplicate
   dispatch, insufficient stock, and before/after journal counts.

**Implemented:** a receipt must reference an approved supplier invoice in the
same entity and does not create an accounting journal. Invoice approval may
precede receipt, while posting is blocked until every material invoice line is
fully received net of supplier returns. Receipt updates warehouse/global stock
and weighted-average cost, with entity-scoped invoice/order-line matching and
idempotency covered by service tests.

**Implemented:** entity-scoped multi-line picking is non-posting and does not
reserve or change stock. Confirmed dispatch atomically decrements global and
warehouse balances, records a `DISPATCH` movement, and is idempotent by key and
pick. Dispatch checks current available balances because picks are not stock
reservations. The workflow is not yet linked to sales orders or invoice lines,
which do not currently provide operational item-to-stock references.

## Current validation baseline

After the latest integrations, `npx prisma validate --schema=src/data/prisma/schema.prisma`,
`npx prisma generate --schema=src/data/prisma/schema.prisma`, `npx tsc --noEmit`,
`npm test` (236/236 main-suite tests plus all configured pretest integration
suites), and `npm run build` passed. The build reports advisory large-chunk
warnings for the workbook (~941 KB) and main bundle (~1,046 KB). The historical
source verifier passed all 520 recorded files with zero missing/mismatched
hashes (88 ZIP archives; `.git` and `node_modules` are excluded).

Latest targeted checks: sales/CRM 38/38, receivables/reminders 11/11, invoice
cancellation 10/10, financial comparison/workbook 9/9, budget 9/9,
cash-flow forecast/API 5/5, financial report 5/5, BI/AI 21/21, HR workflows
11/11, HR leave 12/12, materials 16/16, isolated stock integration 5/5,
production 6/6, and auth/RBAC 5/5. Stock migration tests used in-memory or
uniquely named synthetic databases. The draft was initialized with a separate
synthetic database; no user database was copied or tested.

The full suite and build were run in the canonical target before its completed
application was copied to `C:\Users\USER\OneDrive\Desktop\SAFE_ERP-DRAFT 1`.
The draft launcher was manually tested and then started through its new
logon task: `/health` and the application both returned HTTP 200 on
`127.0.0.1:3300`. The task
`SAFE_ERP-DRAFT 1 - Demarrage automatique` is enabled; the original task
`SAFE ERP - Demarrage automatique` is disabled, not deleted. The original
folder and `LANCER_SAFE_ERP.bat` are preserved for rollback. Browser login,
dashboard, Stock controls, and the read-only RBAC screen were smoke-tested
before the launcher-task verification. A test after an actual PC restart has
not been performed.

The final branding correction changed all user-visible application headings,
the HTML title, export labels, and workbook creator metadata to the exact
`SAFE_ERP` spelling. The updated production build and sources were copied to
the draft, which was restarted through its scheduled task; its HTML title,
health endpoint, and application endpoint were reverified with HTTP 200.
The admin login and dashboard were also smoke-tested against the final draft.

Picking and confirmed dispatch remain unimplemented; do not infer them from
these validation results.

## Historical AI reconciliation cohort

For this cohort, `npm run test:bi-ai` passed 51/51 tests after the final test
correction, `npm run test:financial-report` passed 20/20, and `npx tsc --noEmit`
passed. `npm run build -- --outDir <temporary session path>` passed; the
temporary output was removed and the project's `dist` was not written. Vite
reported the existing large-chunk advisory. These checks cover the selective
AI/P&L delta only; they do not represent a rerun of the entire historical
integration suite or validate a production Ollama deployment.
