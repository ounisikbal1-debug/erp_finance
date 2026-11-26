import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, Modal, PageHeader, Panel, Stat, Table } from "@/components/primitives";
import {
  CNSS_EMPLOYEE_RATE,
  CNSS_EMPLOYER_RATE,
  CSS_RATE,
  IRPP_BRACKETS,
  computePayslip,
  computeIrppAnnual,
  currentPeriod,
  fmtTND,
  periodLabel,
} from "../../../shared/fiscal";

export interface CustomPmePayrollRates {
  cnssEmployeeRate: number;
  cnssEmployerRate: number;
  workAccidentRate: number;
  foprolosRate: number;
  profExpensesRate: number;
  profExpensesMaxCap: number;
  headOfFamilyDeduction: number;
  childDeduction: number;
  parentDeduction: number;
  cssRate: number;
  assuranceDecesRate: number;
  assuranceInvaliditeRate: number;
  assuranceMaladieRate: number;
}

const DEFAULT_PME_RATES: CustomPmePayrollRates = {
  cnssEmployeeRate: 9.68,
  cnssEmployerRate: 16.57,
  workAccidentRate: 0.5,
  foprolosRate: 1.0,
  profExpensesRate: 10.0,
  profExpensesMaxCap: 2000.0,
  headOfFamilyDeduction: 300.0,
  childDeduction: 100.0,
  parentDeduction: 1750.0,
  cssRate: 0.5,
  assuranceDecesRate: 0.5,
  assuranceInvaliditeRate: 0.78400752510838,
  assuranceMaladieRate: 0.48212520380679,
};

export default function Payroll() {
  const utils = trpc.useUtils();
  const runs = trpc.payroll.list.useQuery();
  const employees = trpc.employees.list.useQuery();
  const create = trpc.payroll.create.useMutation({
    onSuccess: () => {
      utils.payroll.list.invalidate();
      utils.dashboard.get.invalidate();
      setOpen(false);
      setSelected(null);
    },
  });

  const [activeTab, setActiveTab] = useState<"cycles" | "ratesSheet">("cycles");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());

  // Paramètres modulables (alignés sur SAFE Grandes Entreprises)
  const [customRates, setCustomRates] = useState<CustomPmePayrollRates>(() => {
    try {
      const raw = window.localStorage.getItem("safe_pme_custom_rates_v1");
      return raw ? { ...DEFAULT_PME_RATES, ...JSON.parse(raw) } : DEFAULT_PME_RATES;
    } catch {
      return DEFAULT_PME_RATES;
    }
  });
  const [savedNotice, setSavedNotice] = useState("");

  // Simulateur de paie individuel
  const [simBase, setSimBase] = useState(4580.673);
  const [simPresence, setSimPresence] = useState(18.668);
  const [simTransport, setSimTransport] = useState(93.216);
  const [simHeadOfFamily, setSimHeadOfFamily] = useState(false);
  const [simChildren, setSimChildren] = useState(0);
  const [simParents, setSimParents] = useState(0);
  const [simBenefitType, setSimBenefitType] = useState<"COMPLEMENTARY_RETIREMENT" | "RETIREMENT_SAVINGS" | "LIFE_INSURANCE">("COMPLEMENTARY_RETIREMENT");
  const [simBenefitRate, setSimBenefitRate] = useState(4);

  const active = useMemo(() => (employees.data ?? []).filter((e) => e.status === "actif"), [employees.data]);

  const preview = useMemo(
    () =>
      active.map((e) => {
        const p = computePayslip({
          baseSalary: e.baseSalary,
          allowances: e.allowances,
          headOfFamily: e.headOfFamily,
          children: e.children,
        });
        return { emp: e, ...p };
      }),
    [active],
  );

  const totals = preview.reduce(
    (a, p) => ({
      gross: a.gross + p.gross,
      cnssE: a.cnssE + p.cnssEmployee,
      cnssR: a.cnssR + (p.totalEmployerCharges ?? p.cnssEmployer),
      css: a.css + p.css,
      irpp: a.irpp + p.irpp,
      net: a.net + p.net,
    }),
    { gross: 0, cnssE: 0, cnssR: 0, css: 0, irpp: 0, net: 0 },
  );

  function generate() {
    if (preview.length === 0) return;
    create.mutate({
      period,
      label: `Paie ${periodLabel(period)}`,
      payslips: preview.map((p) => ({
        employeeId: p.emp.id,
        employeeName: `${p.emp.firstName} ${p.emp.lastName}`,
        matricule: p.emp.matricule,
        baseSalary: p.emp.baseSalary,
        allowances: p.emp.allowances,
        gross: p.gross,
        cnssEmployee: p.cnssEmployee,
        cnssEmployer: p.totalEmployerCharges ?? p.cnssEmployer,
        css: p.css,
        taxableBase: p.taxableBase,
        irpp: p.irpp,
        net: p.net,
      })),
    });
  }

  const detail = trpc.payroll.get.useQuery({ id: selected ?? "00000000-0000-0000-0000-000000000000" }, { enabled: !!selected });

  // ── Calculs instantanés du simulateur modulable (alignés sur SAFE GE) ─────────
  const simGross = Math.round((simBase + simPresence + simTransport) * 1000) / 1000;
  const simCnssEmployee = Math.round(simGross * (customRates.cnssEmployeeRate / 100) * 1000) / 1000;
  const simTaxableGross = Math.max(0, Math.round((simGross - simCnssEmployee) * 1000) / 1000);
  const simAnnualTaxable = simTaxableGross * 12;
  const simProfExpenses = Math.min(simAnnualTaxable * (customRates.profExpensesRate / 100), customRates.profExpensesMaxCap);
  const simFamilyDeductions = (simHeadOfFamily ? customRates.headOfFamilyDeduction : 0)
    + (simChildren * customRates.childDeduction)
    + (simParents * customRates.parentDeduction);

  // AVANTAGE FISCAL : assis sur le Salaire Brut Total (Base + Primes)
  const simBenefitAmount = Math.round(simGross * (simBenefitRate / 100) * 1000) / 1000;
  const simAnnualNetTaxable = Math.max(0, simAnnualTaxable - simProfExpenses - simFamilyDeductions - simBenefitAmount * 12);
  const simMonthlyNetTaxable = Math.round((simAnnualNetTaxable / 12) * 1000) / 1000;

  // Calcul IRPP par tranche annuel et mensuel
  let simAnnualIrpp = 0;
  const tranchesCalcul = IRPP_BRACKETS.map((b) => {
    const minVal = b.from;
    const maxVal = b.to === null ? Infinity : b.to;
    let slice = 0;
    if (simAnnualNetTaxable > minVal) {
      slice = Math.max(0, Math.min(simAnnualNetTaxable, maxVal) - minVal);
    }
    const taxAnnual = Math.round(slice * (b.rate / 100) * 1000) / 1000;
    simAnnualIrpp += taxAnnual;
    return {
      min: minVal,
      max: maxVal,
      rate: b.rate,
      slice,
      taxAnnual,
      taxMonthly: Math.round((taxAnnual / 12) * 1000) / 1000,
    };
  });

  const simMonthlyIrpp = Math.round((simAnnualIrpp / 12) * 1000) / 1000;
  const simMonthlyCss = Math.round(((simAnnualNetTaxable * (customRates.cssRate / 100)) / 12) * 1000) / 1000;

  // 3 Assurances modulables 100% Patronales
  const simAssuranceDeces = Math.round((simGross * (customRates.assuranceDecesRate / 100)) * 1000) / 1000;
  const simAssuranceInvalidite = Math.round((simGross * (customRates.assuranceInvaliditeRate / 100)) * 1000) / 1000;
  const effectiveMaladieRate = customRates.assuranceMaladieRate < 0.01 ? customRates.assuranceMaladieRate * 100 : customRates.assuranceMaladieRate;
  const simAssuranceMaladie = Math.round((simGross * (effectiveMaladieRate / 100)) * 1000) / 1000;
  const simTotalAssurancesPatronales = Math.round((simAssuranceDeces + simAssuranceInvalidite + simAssuranceMaladie) * 1000) / 1000;

  // Charges patronales totales
  const simCnssEmployer = Math.round((simGross * (customRates.cnssEmployerRate / 100)) * 1000) / 1000;
  const simWorkAccident = Math.round((simGross * (customRates.workAccidentRate / 100)) * 1000) / 1000;
  const simFoprolos = Math.round((simGross * (customRates.foprolosRate / 100)) * 1000) / 1000;
  const simTotalEmployerCharges = Math.round((simCnssEmployer + simWorkAccident + simFoprolos + simTotalAssurancesPatronales) * 1000) / 1000;

  // Retenues salariales & Net (les 3 assurances ne sont PAS déduites du salarié)
  const simTotalDeductions = Math.round((simCnssEmployee + simMonthlyIrpp + simMonthlyCss) * 1000) / 1000;
  const simNet = Math.round((simGross - simTotalDeductions) * 1000) / 1000;

  function saveCustomRates() {
    try {
      window.localStorage.setItem("safe_pme_custom_rates_v1", JSON.stringify(customRates));
      setSavedNotice("Taux modulables enregistrés et appliqués avec succès !");
      setTimeout(() => setSavedNotice(""), 3500);
    } catch {
      setSavedNotice("Erreur lors de l’enregistrement des taux.");
    }
  }

  return (
    <>
      <PageHeader
        title="Gestion de la Paie & Salaires"
        subtitle="Moteur fiscal tunisien harmonisé · IRPP 8 tranches · CNSS 9,68 % / 17,07 % · CSS 0,5 % · 3 Assurances patronales 1,766 % (Décès 0,5 %, Invalidité 0,784 %, Maladie 0,482 %)"
        actions={
          <div className="flex gap-2">
            <button
              className={activeTab === "cycles" ? "erp-btn-gold" : "erp-btn-ghost"}
              onClick={() => setActiveTab("cycles")}
            >
              📑 Cycles & Bulletins
            </button>
            <button
              className={activeTab === "ratesSheet" ? "erp-btn-gold" : "erp-btn-ghost"}
              onClick={() => setActiveTab("ratesSheet")}
            >
              ⚙️ Feuille des Taux Modulables
            </button>
          </div>
        }
      />

      {activeTab === "cycles" ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Salariés actifs" value={String(active.length)} hint="Base de calcul du prochain cycle" />
            <Stat label="Masse brute soumise" value={fmtTND(totals.gross)} hint={`CNSS salarié ${CNSS_EMPLOYEE_RATE} %`} />
            <Stat label="IRPP retenu total" value={fmtTND(totals.irpp)} hint="Barème progressif 8 tranches" tone="gold" />
            <Stat label="Net à payer global" value={fmtTND(totals.net)} hint="Viré sur compte bancaire" tone="success" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title="Cycles de paie"
              subtitle="Historique des bulletins générés"
              className="xl:col-span-2"
              noPad
              actions={
                <button className="erp-btn-gold" onClick={() => setOpen(true)} disabled={active.length === 0}>
                  + Lancer un cycle
                </button>
              }
            >
              {runs.isLoading ? (
                <Loading />
              ) : (runs.data ?? []).length === 0 ? (
                <EmptyState
                  icon="◫"
                  title="Aucun cycle de paie"
                  description="Lancez votre premier cycle : l'ERP calcule automatiquement la CNSS salarié (9,68 %), employeur (17,07 %), la CSS (0,5 %) et l'IRPP selon le barème tunisien à 8 tranches."
                  action={
                    <button className="erp-btn-gold" onClick={() => setOpen(true)} disabled={active.length === 0}>
                      {active.length === 0 ? "Créez d'abord des salariés" : "Lancer un cycle"}
                    </button>
                  }
                />
              ) : (
                <Table head={["Période", "Statut", "Brut", "CNSS salarié", "IRPP", "Net à payer"]}>
                  {(runs.data ?? []).map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                      <td className="font-medium">{periodLabel(r.period)}</td>
                      <td>
                        <Badge tone="success">Validée</Badge>
                      </td>
                      <td className="text-right"><Money value={r.totalGross} /></td>
                      <td className="text-right"><Money value={r.totalCnssEmployee} /></td>
                      <td className="text-right"><Money value={r.totalIrpp} /></td>
                      <td className="text-right"><Money value={r.totalNet} bold /></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>

            <Panel title="Synthèse Légale Tunisienne" subtitle="Taux sociaux & fiscaux en vigueur">
              <div className="space-y-2 text-[12.5px]">
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">CNSS Salarié</span>
                  <span className="font-semibold">{customRates.cnssEmployeeRate} %</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">CNSS Patronale + AT</span>
                  <span className="font-semibold">{customRates.cnssEmployerRate + customRates.workAccidentRate} %</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">FOPROLOS</span>
                  <span className="font-semibold">{customRates.foprolosRate} %</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">CSS (Solidarité)</span>
                  <span className="font-semibold">{customRates.cssRate} %</span>
                </div>
                <div className="rounded-md bg-secondary/50 p-2 text-[11.5px] leading-relaxed">
                  <p className="font-semibold text-foreground">3 Assurances Patronales (1,766 %) :</p>
                  <p className="text-muted-foreground mt-0.5">
                    • Décès : 0,5% × Brut<br />
                    • Invalidité : 0,784% × Brut<br />
                    • Maladie : 0,482% × Brut
                  </p>
                </div>
                <div className="rounded-md bg-gold-soft/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
                  Tranche 6 IRPP vérifiée : 40 000 DT – 50 000 DT à 36 % (assiette 10 000 DT).
                </div>
              </div>
            </Panel>
          </div>

          {/* Bulletins du cycle sélectionné */}
          {selected && detail.data && (
            <Panel
              title={`Bulletins — ${periodLabel(detail.data.period)}`}
              className="mt-4"
              noPad
              actions={
                <button className="erp-btn-ghost h-8 text-[12px] no-print" onClick={() => window.print()}>
                  🖨️ Imprimer les bulletins
                </button>
              }
            >
              <Table
                head={[
                  "Salarié",
                  "Matricule",
                  "Brut",
                  "CNSS 9,68 %",
                  "CSS 0,5 %",
                  "Base imposable",
                  "IRPP",
                  "Net à payer",
                  "Charges Employeur",
                ]}
              >
                {detail.data.payslips.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.employeeName}</td>
                    <td className="font-mono text-[12px] text-muted-foreground">{p.matricule}</td>
                    <td className="text-right"><Money value={p.gross} /></td>
                    <td className="text-right text-destructive"><Money value={p.cnssEmployee} /></td>
                    <td className="text-right text-destructive"><Money value={p.css} /></td>
                    <td className="text-right font-semibold"><Money value={p.taxableBase} /></td>
                    <td className="text-right text-destructive"><Money value={p.irpp} /></td>
                    <td className="text-right text-primary font-bold"><Money value={p.net} bold /></td>
                    <td className="text-right text-muted-foreground font-semibold"><Money value={p.cnssEmployer} /></td>
                  </tr>
                ))}
                <tr className="bg-gold-soft/40 font-semibold">
                  <td colSpan={2}>Totaux du cycle</td>
                  <td className="text-right"><Money value={detail.data.totalGross} bold /></td>
                  <td className="text-right text-destructive"><Money value={detail.data.totalCnssEmployee} bold /></td>
                  <td className="text-right text-destructive"><Money value={detail.data.totalCss} bold /></td>
                  <td />
                  <td className="text-right text-destructive"><Money value={detail.data.totalIrpp} bold /></td>
                  <td className="text-right text-primary font-bold"><Money value={detail.data.totalNet} bold /></td>
                  <td className="text-right font-semibold"><Money value={detail.data.totalCnssEmployer} bold /></td>
                </tr>
              </Table>
            </Panel>
          )}
        </>
      ) : (
        /* ── ONGLET 2 : FEUILLE DES TAUX MODULABLES (ALIGNÉE SUR SAFE GE) ── */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <div>
              <h2 className="text-[16px] font-bold text-foreground">Paramètres & Barèmes Modulables de Paie</h2>
              <p className="text-[12.5px] text-muted-foreground">
                Feuille interactive harmonisée avec SAFE Grandes Entreprises. Les 3 assurances sont 100% patronales. L'avantage fiscal est calculé sur le Salaire Brut Total.
              </p>
            </div>
            <button className="erp-btn-gold" onClick={saveCustomRates}>
              💾 Enregistrer les Modifications
            </button>
          </div>

          {savedNotice && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] font-semibold text-emerald-800">
              ✅ {savedNotice}
            </div>
          )}

          {/* Grille des paramètres modulables */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Taux CNSS Salarié (%)">
              <input
                type="number"
                step="0.01"
                className="erp-input font-bold"
                value={customRates.cnssEmployeeRate}
                onChange={(e) => setCustomRates({ ...customRates, cnssEmployeeRate: Number(e.target.value) })}
              />
            </Field>
            <Field label="Taux CNSS Patronale (%)">
              <input
                type="number"
                step="0.01"
                className="erp-input font-bold"
                value={customRates.cnssEmployerRate}
                onChange={(e) => setCustomRates({ ...customRates, cnssEmployerRate: Number(e.target.value) })}
              />
            </Field>
            <Field label="Taux Accident du Travail (%)">
              <input
                type="number"
                step="0.01"
                className="erp-input font-bold"
                value={customRates.workAccidentRate}
                onChange={(e) => setCustomRates({ ...customRates, workAccidentRate: Number(e.target.value) })}
              />
            </Field>
            <Field label="Taux CSS (%)">
              <input
                type="number"
                step="0.1"
                className="erp-input font-bold"
                value={customRates.cssRate}
                onChange={(e) => setCustomRates({ ...customRates, cssRate: Number(e.target.value) })}
              />
            </Field>
            <Field label="Frais Professionnels (%)">
              <input
                type="number"
                step="0.5"
                className="erp-input font-bold"
                value={customRates.profExpensesRate}
                onChange={(e) => setCustomRates({ ...customRates, profExpensesRate: Number(e.target.value) })}
              />
            </Field>
            <Field label="Plafond Frais Pro (DT/an)">
              <input
                type="number"
                step="100"
                className="erp-input font-bold"
                value={customRates.profExpensesMaxCap}
                onChange={(e) => setCustomRates({ ...customRates, profExpensesMaxCap: Number(e.target.value) })}
              />
            </Field>
            <Field label="Déduction Chef de Famille (DT/an)">
              <input
                type="number"
                step="50"
                className="erp-input font-bold"
                value={customRates.headOfFamilyDeduction}
                onChange={(e) => setCustomRates({ ...customRates, headOfFamilyDeduction: Number(e.target.value) })}
              />
            </Field>
            <Field label="Déduction par Enfant (DT/an)">
              <input
                type="number"
                step="25"
                className="erp-input font-bold"
                value={customRates.childDeduction}
                onChange={(e) => setCustomRates({ ...customRates, childDeduction: Number(e.target.value) })}
              />
            </Field>

            {/* 3 Assurances modulables exclusivement patronales */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <Field label="1. Assurance Décès Patronale (%)">
                <input
                  type="number"
                  step="0.01"
                  className="erp-input font-bold"
                  value={customRates.assuranceDecesRate}
                  onChange={(e) => setCustomRates({ ...customRates, assuranceDecesRate: Number(e.target.value) })}
                />
              </Field>
              <p className="mt-1 text-[11px] font-semibold text-emerald-800">0.5% × Total Brut (Charge Patronale)</p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <Field label="2. Assurance Invalidité Patronale (%)">
                <input
                  type="number"
                  step="0.000001"
                  className="erp-input font-bold"
                  value={customRates.assuranceInvaliditeRate}
                  onChange={(e) => setCustomRates({ ...customRates, assuranceInvaliditeRate: Number(e.target.value) })}
                />
              </Field>
              <p className="mt-1 text-[11px] font-semibold text-emerald-800">0.78400752510838% × Total Brut (Charge Patronale)</p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <Field label="3. Assurance Maladie Patronale (%)">
                <input
                  type="number"
                  step="0.000001"
                  className="erp-input font-bold"
                  value={customRates.assuranceMaladieRate}
                  onChange={(e) => setCustomRates({ ...customRates, assuranceMaladieRate: Number(e.target.value) })}
                />
              </Field>
              <p className="mt-1 text-[11px] font-semibold text-emerald-800">0,0048212520380679 × Total Brut (Charge Patronale)</p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <Field label="Dispositif d’Avantage Fiscal">
                <select
                  className="erp-input font-semibold"
                  value={simBenefitType}
                  onChange={(e) => setSimBenefitType(e.target.value as any)}
                >
                  <option value="COMPLEMENTARY_RETIREMENT">Retraite complémentaire</option>
                  <option value="RETIREMENT_SAVINGS">Épargne retraite</option>
                  <option value="LIFE_INSURANCE">Assurance-vie</option>
                </select>
              </Field>
              <p className="mt-1 text-[11px] font-semibold text-blue-800">Assis sur Salaire Brut Total (Base + Primes)</p>
            </div>
          </div>

          {/* DÉTAIL DU CALCUL DU NET IMPOSABLE */}
          <Panel title="📑 Détail du Calcul du Net Imposable (Assiette IRPP & CSS)" subtitle="Décomposition officielle tunisienne" noPad>
            <div className="overflow-x-auto">
              <table className="erp-table text-[12.5px]">
                <thead>
                  <tr className="bg-secondary/60">
                    <th>Élément de Détermination de l'Assiette</th>
                    <th className="text-center">Règle légale / Taux</th>
                    <th className="text-right">Montant Annuel (DT/an)</th>
                    <th className="text-right">Montant Mensuel (DT/mois)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold">
                    <td>1. Salaire Brut Total (Base + Primes)</td>
                    <td className="text-center text-muted-foreground">Assiette de base</td>
                    <td className="text-right">{(simGross * 12).toFixed(3)} DT</td>
                    <td className="text-right">{simGross.toFixed(3)} DT</td>
                  </tr>
                  <tr className="text-destructive">
                    <td>− Cotisation CNSS Salariée Déductible</td>
                    <td className="text-center">{customRates.cnssEmployeeRate}% du Brut</td>
                    <td className="text-right">-{(simCnssEmployee * 12).toFixed(3)} DT</td>
                    <td className="text-right">-{simCnssEmployee.toFixed(3)} DT</td>
                  </tr>
                  <tr className="bg-secondary/40 font-bold text-primary">
                    <td>= Salaire Brut Imposable (Brut − CNSS)</td>
                    <td className="text-center">Formule légale</td>
                    <td className="text-right">{simAnnualTaxable.toFixed(3)} DT</td>
                    <td className="text-right">{simTaxableGross.toFixed(3)} DT</td>
                  </tr>
                  <tr className="text-amber-800">
                    <td>− Déduction Frais Professionnels</td>
                    <td className="text-center">{customRates.profExpensesRate}% (plafonné à {customRates.profExpensesMaxCap} DT/an)</td>
                    <td className="text-right">-{simProfExpenses.toFixed(3)} DT</td>
                    <td className="text-right">-{(simProfExpenses / 12).toFixed(3)} DT</td>
                  </tr>
                  <tr className="text-muted-foreground">
                    <td>− Déductions Familiales (Chef de famille + Enfants + Parents)</td>
                    <td className="text-center">300 DT / 100 DT / 1 750 DT</td>
                    <td className="text-right">-{simFamilyDeductions.toFixed(3)} DT</td>
                    <td className="text-right">-{(simFamilyDeductions / 12).toFixed(3)} DT</td>
                  </tr>
                  <tr className="text-emerald-700 font-medium">
                    <td>− Dispositif d’Avantage Fiscal ({simBenefitType === "COMPLEMENTARY_RETIREMENT" ? "Retraite compl." : "Épargne retraite"})</td>
                    <td className="text-center">{simBenefitRate}% assis sur Salaire Brut Total (Base + Primes)</td>
                    <td className="text-right">-{(simBenefitAmount * 12).toFixed(3)} DT</td>
                    <td className="text-right">-{simBenefitAmount.toFixed(3)} DT</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-primary text-primary-foreground font-bold">
                    <td colSpan={2}>= REVENU NET IMPOSABLE RETENU (ASSIETTE BARÈME IRPP ET CSS)</td>
                    <td className="text-right text-gold">{simAnnualNetTaxable.toFixed(3)} DT</td>
                    <td className="text-right text-gold">{simMonthlyNetTaxable.toFixed(3)} DT</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          {/* TABLEAU DES TRANCHES IRPP */}
          <Panel
            title="Barème Progressif de l’IRPP & Calcul par Tranche"
            subtitle="Barème fiscal 8 tranches"
            actions={
              <span className="rounded bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                ✓ Tranche 6 vérifiée : 40 000 DT – 50 000 DT (36%, assiette 10 000 DT) conforme loi tunisienne
              </span>
            }
            noPad
          >
            <Table head={["Tranche de revenu net imposable", "Taux", "Assiette Tranche (DT/an)", "IRPP Annuel", "IRPP Mensuel"]}>
              {tranchesCalcul.map((t, idx) => (
                <tr key={idx} className={t.slice > 0 ? "font-semibold" : "text-muted-foreground opacity-70"}>
                  <td>{t.max === Infinity ? `Plus de ${t.min.toLocaleString("fr-FR")} DT` : `De ${t.min.toLocaleString("fr-FR")} DT à ${t.max.toLocaleString("fr-FR")} DT`}</td>
                  <td>{t.rate} %</td>
                  <td className="text-right">{t.slice.toFixed(3)}</td>
                  <td className="text-right">{t.taxAnnual.toFixed(3)}</td>
                  <td className="text-right text-destructive">{t.taxMonthly.toFixed(3)}</td>
                </tr>
              ))}
              <tr className="bg-secondary/70 font-bold">
                <td colSpan={2}>TOTAL IRPP CALCULÉ</td>
                <td className="text-right">{simAnnualNetTaxable.toFixed(3)} DT</td>
                <td className="text-right">{simAnnualIrpp.toFixed(3)} DT</td>
                <td className="text-right text-destructive">{simMonthlyIrpp.toFixed(3)} DT</td>
              </tr>
            </Table>
          </Panel>

          {/* RECALCUL EN TEMPS RÉEL */}
          <Panel title="📊 Résultat du Recalcul Instantané en Temps Réel" subtitle="Simulation avec les taux modulables">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-secondary/60 p-3">
                <div className="text-[11px] font-bold text-muted-foreground">1. SALAIRE BRUT</div>
                <div className="text-[18px] font-extrabold text-foreground">{simGross.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-red-50 p-3 border border-red-100">
                <div className="text-[11px] font-bold text-red-700">2. CNSS SALARIÉ ({customRates.cnssEmployeeRate}%)</div>
                <div className="text-[18px] font-extrabold text-destructive">-{simCnssEmployee.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
                <div className="text-[11px] font-bold text-emerald-700">3. BRUT IMPOSABLE</div>
                <div className="text-[18px] font-extrabold text-emerald-800">{simTaxableGross.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-secondary/60 p-3">
                <div className="text-[11px] font-bold text-muted-foreground">4. NET IMPOSABLE MENSUEL</div>
                <div className="text-[18px] font-extrabold text-foreground">{simMonthlyNetTaxable.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-red-50 p-3 border border-red-100">
                <div className="text-[11px] font-bold text-red-700">5. IRPP RETENU MENSUEL</div>
                <div className="text-[18px] font-extrabold text-destructive">-{simMonthlyIrpp.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-red-50 p-3 border border-red-100">
                <div className="text-[11px] font-bold text-red-700">6. CSS MENSUELLE ({customRates.cssRate}%)</div>
                <div className="text-[18px] font-extrabold text-destructive">-{simMonthlyCss.toFixed(3)} DT</div>
              </div>
              <div className="rounded-lg bg-primary p-3 text-primary-foreground sm:col-span-2">
                <div className="text-[11px] text-muted-foreground uppercase font-bold text-gold">NET À PAYER SALARIÉ</div>
                <div className="text-[22px] font-black text-white">{simNet.toFixed(3)} TND</div>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 flex justify-between items-center text-[12.5px]">
              <div>
                <span className="font-bold text-foreground">Charges Patronales Totales : </span>
                <span className="text-muted-foreground">CNSS employeur + Accident travail + FOPROLOS + 3 Assurances patronales (Décès 0,5%, Invalidité 0,784%, Maladie 0,482%)</span>
              </div>
              <span className="font-extrabold text-foreground text-[15px]">{simTotalEmployerCharges.toFixed(3)} DT</span>
            </div>
          </Panel>
        </div>
      )}

      {/* Modale de lancement de cycle */}
      <Modal open={open} onClose={() => setOpen(false)} title="Lancer un cycle de paie" wide>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Période">
            <input type="month" className="erp-input" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <div className="rounded-lg bg-gold-soft/50 p-3 text-[12px] leading-relaxed">
            <p className="font-semibold text-[hsl(38_72%_30%)]">Taux et Barèmes de Paie Harmonises</p>
            <p className="mt-1 text-muted-foreground">
              CNSS salarié {customRates.cnssEmployeeRate} % · CNSS employeur {customRates.cnssEmployerRate + customRates.workAccidentRate} % · CSS {customRates.cssRate} % · Assurances patronales 1,766 % (Décès 0,5 %, Invalidité 0,784 %, Maladie 0,482 %) · IRPP 8 tranches
            </p>
          </div>
        </div>

        <div className="max-h-[340px] overflow-y-auto rounded-lg border border-border">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Salarié</th>
                <th className="text-right">Brut</th>
                <th className="text-right">CNSS</th>
                <th className="text-right">CSS</th>
                <th className="text-right">IRPP</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.emp.id}>
                  <td className="font-medium">
                    {p.emp.firstName} {p.emp.lastName}
                    {p.emp.headOfFamily && <span className="ml-1.5 text-[10px] text-gold">CF</span>}
                  </td>
                  <td className="text-right"><Money value={p.gross} /></td>
                  <td className="text-right"><Money value={p.cnssEmployee} /></td>
                  <td className="text-right"><Money value={p.css} /></td>
                  <td className="text-right"><Money value={p.irpp} /></td>
                  <td className="text-right"><Money value={p.net} bold /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-[12.5px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total brut</span>
            <Money value={totals.gross} bold />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net à payer</span>
            <Money value={totals.net} bold />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Charges patronales (CNSS 17,07 % + 3 Assurances 1,766 %)</span>
            <Money value={totals.cnssR} bold />
          </div>
        </div>

        {create.error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">{create.error.message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="erp-btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button className="erp-btn-gold" onClick={generate} disabled={create.isPending || preview.length === 0}>
            {create.isPending ? "Calcul…" : `Générer ${preview.length} bulletin(s)`}
          </button>
        </div>
      </Modal>
    </>
  );
}
