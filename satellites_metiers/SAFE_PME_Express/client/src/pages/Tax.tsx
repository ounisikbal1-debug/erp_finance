import { useMemo, useState } from "react";
import { trpc } from "@/_core/trpc";
import { Badge, EmptyState, Field, Loading, Money, PageHeader, Panel, Table } from "@/components/primitives";
import {
  CNSS_EMPLOYEE_RATE,
  CNSS_EMPLOYER_RATE,
  CSS_RATE,
  IRPP_BRACKETS,
  IRPP_DEPENDENT_DEDUCTION,
  IRPP_HEAD_OF_FAMILY_DEDUCTION,
  IS_INSTALLMENT_RATE,
  IS_RATES,
  TCL_RATES_BP,
  VAT_RATES,
  computeIrppAnnual,
  computeIrppMonthly,
  currentPeriod,
  fmtTND,
  parseTND,
  periodLabel,
} from "../../../shared/fiscal";

const KIND_TONE: Record<string, string> = {
  TVA: "info",
  IS: "gold",
  ACOMPTE: "gold",
  TCL: "muted",
  IRPP: "success",
  RS: "danger",
};

export default function Tax() {
  const dash = trpc.dashboard.get.useQuery();
  const company = trpc.company.get.useQuery();
  const decls = trpc.tax.list.useQuery();
  const tStatus = trpc.transmission.status.useQuery();
  const history = trpc.transmission.history.useQuery();
  const utils = trpc.useUtils();
  const sendDecl = trpc.transmission.sendDeclaration.useMutation({
    onSuccess: () => {
      utils.transmission.history.invalidate();
      utils.tax.list.invalidate();
    },
  });
  const ttnReady = tStatus.data?.find((s) => s.platform === "ttn")?.configured ?? false;

  const d = dash.data;
  const c = company.data;

  // â”€â”€ TVA du mois â”€â”€
  const vatCollected = d?.revenueVat ?? 0;
  const vatDeductible = d?.purchaseVat ?? 0;
  const vatNet = vatCollected - vatDeductible;

  // â”€â”€ IS estimÃ© â”€â”€
  const resultat = (d?.revenueHt ?? 0) - (d?.purchaseHt ?? 0) - (d?.payrollGross ?? 0) - (d?.assetsAccumulated ?? 0);
  const isRate = c?.isRate ?? 15;
  const isDue = resultat > 0 ? Math.round((resultat * isRate) / 100) : 0;
  const acompte = Math.round((isDue * IS_INSTALLMENT_RATE) / 100);

  // â”€â”€ TCL â”€â”€
  const tclBase = c ? 0 : 0;
  const tclRateBp = c?.tclRateBp ?? 10;
  const tclDue = Math.round((tclBase * tclRateBp) / 10000);

  const [simAmount, setSimAmount] = useState("1500");
  const [simFamily, setSimFamily] = useState({ headOfFamily: true, children: 2 });
  const simMonthly = useMemo(
    () =>
      computeIrppMonthly(parseTND(simAmount), {
        headOfFamily: simFamily.headOfFamily,
        children: simFamily.children,
      }),
    [simAmount, simFamily],
  );

  const [annualAmount, setAnnualAmount] = useState("48000");
  const annual = useMemo(() => computeIrppAnnual(parseTND(annualAmount)), [annualAmount]);

  return (
    <>
      <PageHeader
        title="FiscalitÃ© & social"
        subtitle="TVA Â· TCL Â· IS Â· IRPP Â· CNSS Â· retenues Ã  la source â€” rÃ©glementation tunisienne"
      />

      {/* Bandeau des taux en vigueur */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <div className="erp-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TVA</p>
          <p className="num mt-1 text-[15px] font-semibold">{VAT_RATES.join(" / ")} %</p>
        </div>
        <div className="erp-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CNSS salariÃ©</p>
          <p className="num mt-1 text-[15px] font-semibold text-navy">{CNSS_EMPLOYEE_RATE} %</p>
        </div>
        <div className="erp-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CNSS employeur</p>
          <p className="num mt-1 text-[15px] font-semibold text-navy">{CNSS_EMPLOYER_RATE} %</p>
        </div>
        <div className="erp-card border-gold/40 bg-gold-soft/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(38_72%_32%)]">CSS</p>
          <p className="num mt-1 text-[15px] font-semibold text-[hsl(38_72%_28%)]">{CSS_RATE} %</p>
        </div>
        <div className="erp-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">IS</p>
          <p className="num mt-1 text-[15px] font-semibold">{IS_RATES.join(" / ")} %</p>
        </div>
        <div className="erp-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TCL</p>
          <p className="num mt-1 text-[15px] font-semibold">{TCL_RATES_BP.map((b) => (b / 10).toFixed(1)).join(" / ")} %</p>
        </div>
      </div>

      {/* TVA / IS / TCL */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="TVA â€” pÃ©riode en cours" subtitle={`DÃ©claration ${periodLabel(currentPeriod())}`}>
          <div className="space-y-2 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">TVA collectÃ©e</span>
              <Money value={vatCollected} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TVA dÃ©ductible</span>
              <Money value={vatDeductible} />
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-semibold">TVA nette</span>
              <Money value={vatNet} bold />
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-info-soft p-2.5 text-[11px] leading-relaxed text-info">
            DÃ©pÃ´t avant le 28 du mois suivant (rÃ©gime rÃ©el). CrÃ©dit reportable si la TVA dÃ©ductible excÃ¨de la
            collectÃ©e.
          </p>
        </Panel>

        <Panel title="ImpÃ´t sur les sociÃ©tÃ©s" subtitle={`Taux appliquÃ© : ${isRate} %`}>
          <div className="space-y-2 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">RÃ©sultat estimÃ©</span>
              <Money value={resultat} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IS dÃ» ({isRate} %)</span>
              <Money value={isDue} />
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-semibold">Acompte provisionnel (30 %)</span>
              <Money value={acompte} bold />
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-gold-soft/60 p-2.5 text-[11px] leading-relaxed text-[hsl(38_72%_30%)]">
            3 acomptes provisionnels de 30 % de l'IS de rÃ©fÃ©rence, exigibles en juin, septembre et dÃ©cembre.
            Minimum d'impÃ´t : 0,2 % du chiffre d'affaires (plafonnÃ©).
          </p>
        </Panel>

        <Panel title="TCL & retenues" subtitle="Taxe sur les locaux Â· retenue Ã  la source">
          <div className="space-y-2 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">TCL ({(tclRateBp / 10).toFixed(1)} %)</span>
              <Money value={tclDue} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Retenue Ã  la source</span>
              <span className="text-muted-foreground">1 % / 3 %</span>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-secondary/70 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            TCL assise sur la valeur locative des locaux professionnels. La retenue Ã  la source s'applique aux
            prestations de services et honoraires versÃ©s Ã  des tiers.
          </p>
        </Panel>
      </div>

      {/* Simulateurs IRPP */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Simulateur IRPP mensuel" subtitle="Retenue Ã  la source sur salaire">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Salaire net imposable (TND)">
              <input className="erp-input" value={simAmount} onChange={(e) => setSimAmount(e.target.value)} />
            </Field>
            <Field label="Personnes Ã  charge">
              <input
                type="number"
                className="erp-input"
                value={simFamily.children}
                onChange={(e) => setSimFamily({ ...simFamily, children: Number(e.target.value) })}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={simFamily.headOfFamily}
                onChange={(e) => setSimFamily({ ...simFamily, headOfFamily: e.target.checked })}
                className="size-4 accent-[hsl(45_65%_47%)]"
              />
              Chef de famille
            </label>
          </div>
          <div className="mt-3 space-y-1.5 rounded-lg bg-gold-soft/50 p-3 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base imposable annualisÃ©e</span>
              <span className="num">{fmtTND(simMonthly.annualTaxable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IRPP annuel avant abattement</span>
              <span className="num">{fmtTND(simMonthly.detail.reduce((s, x) => s + x.tax, 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IRPP annuel aprÃ¨s abattements</span>
              <span className="num">{fmtTND(simMonthly.annual)}</span>
            </div>
            <div className="flex justify-between border-t border-gold/30 pt-1.5">
              <span className="font-semibold">Retenue mensuelle</span>
              <span className="num text-[15px] font-semibold text-[hsl(38_72%_28%)]">{fmtTND(simMonthly.monthly)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Abattement chef de famille {IRPP_HEAD_OF_FAMILY_DEDUCTION} TND/an Â· {IRPP_DEPENDENT_DEDUCTION} TND par
            personne Ã  charge.
          </p>
        </Panel>

        <Panel title="BarÃ¨me IRPP annuel" subtitle="8 tranches â€” 0 % Ã  40 %">
          <div className="space-y-1">
            {IRPP_BRACKETS.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-[11px] text-muted-foreground">{i + 1}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-secondary">
                  <div
                    className="h-full rounded bg-gradient-to-r from-navy to-gold"
                    style={{ width: `${(b.rate / 40) * 100}%` }}
                  />
                </div>
                <span className="num w-24 text-right text-[11.5px] text-muted-foreground">
                  {b.from.toLocaleString("fr-FR")} â€“ {b.to === null ? "âˆž" : b.to.toLocaleString("fr-FR")}
                </span>
                <span className="num w-10 text-right text-[12px] font-semibold">{b.rate} %</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Simulateur IRPP annuel */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Simulateur IRPP annuel" subtitle="Revenu net imposable â†’ impÃ´t dÃ»">
          <Field label="Revenu net imposable annuel (TND)">
            <input className="erp-input" value={annualAmount} onChange={(e) => setAnnualAmount(e.target.value)} />
          </Field>
          <div className="mt-3 space-y-1">
            {annual.detail.map((dt, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-secondary/50 px-2.5 py-1.5 text-[12px]">
                <span className="text-muted-foreground">
                  {dt.rate} % sur {fmtTND(dt.base)}
                </span>
                <span className="num font-semibold">{fmtTND(dt.tax)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between rounded-lg bg-gold-soft/60 px-3 py-2 text-[13px]">
            <span className="font-semibold">IRPP annuel dÃ»</span>
            <span className="num font-semibold text-[hsl(38_72%_28%)]">{fmtTND(annual.total)}</span>
          </div>
        </Panel>

        <Panel title="DÃ©clarations" subtitle="Ã‰chÃ©ances et suivi" noPad>
          {decls.isLoading ? (
            <Loading />
          ) : (decls.data ?? []).length === 0 ? (
            <EmptyState
              icon="â—ˆ"
              title="Aucune dÃ©claration gÃ©nÃ©rÃ©e"
              description="Les dÃ©clarations de TVA, d'IS, de TCL et d'acomptes apparaÃ®tront ici avec leurs Ã©chÃ©ances, prÃªtes Ã  Ãªtre transmises Ã  la TÃ©lÃ©dÃ©claration TTN."
            />
          ) : (
            <Table head={["Type", "PÃ©riode", "Ã‰chÃ©ance", "Base", "Montant", "Statut", ""]}>
              {(decls.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Badge tone={KIND_TONE[r.kind] ?? "muted"}>{r.kind}</Badge>
                  </td>
                  <td>{periodLabel(r.period)}</td>
                  <td className="text-muted-foreground">{new Date(r.dueDate).toLocaleDateString("fr-FR")}</td>
                  <td className="text-right"><Money value={r.baseAmount} /></td>
                  <td className="text-right"><Money value={r.taxAmount} bold /></td>
                  <td>
                    <Badge tone={r.status === "payee" ? "success" : r.status === "declaree" ? "info" : "muted"}>
                      {r.status === "payee" ? "PayÃ©e" : r.status === "declaree" ? "DÃ©clarÃ©e" : "Ã€ dÃ©clarer"}
                    </Badge>
                  </td>
                  <td className="text-right">
                    <button
                      className="erp-btn-ghost h-7 px-2 text-[11px]"
                      onClick={() => sendDecl.mutate({ declarationId: r.id })}
                      disabled={sendDecl.isPending}
                      title={
                        ttnReady
                          ? "Transmettre Ã  la TÃ©lÃ©dÃ©claration TTN"
                          : "TTN non configurÃ©e â€” ajoutez TTN_API_URL et TTN_API_KEY dans Web Admin â†’ Secrets"
                      }
                    >
                      Transmettre
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <Panel title="Transmission TTN & e-Fatoura" subtitle="Liaison directe aux plateformes" className="mt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(tStatus.data ?? []).map((s) => (
            <div
              key={s.platform}
              className={
                s.configured
                  ? "rounded-lg border border-success/30 bg-success-soft/50 p-3"
                  : "rounded-lg border border-border bg-secondary/40 p-3"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-navy">{s.label}</p>
                <Badge tone={s.configured ? "success" : "muted"}>
                  {s.configured ? "ConnectÃ©e" : "Non configurÃ©e"}
                </Badge>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {s.platform === "ttn"
                  ? "Envoi direct des dÃ©clarations (TVA, IS, TCL, acomptes) Ã  la TÃ©lÃ©dÃ©claration."
                  : "Envoi direct des factures de vente au format Ã©lectronique e-Fatoura."}
              </p>
              {!s.configured && (
                <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">
                  {s.platform === "ttn" ? "TTN_API_URL Â· TTN_API_KEY" : "EFATOURA_API_URL Â· EFATOURA_API_KEY"}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-gold-soft/50 p-2.5 text-[11px] leading-relaxed text-[hsl(38_72%_30%)]">
          Les identifiants se saisissent dans <strong>Web Admin â†’ Secrets</strong> (une valeur pour l'aperÃ§u, une
          pour la production). Tant qu'une plateforme n'est pas configurÃ©e, l'ERP refuse l'envoi et l'indique
          clairement â€” aucun envoi n'est simulÃ©.
        </p>
      </Panel>

      <Panel title="Journal des transmissions" subtitle="Historique des envois vers TTN et e-Fatoura" className="mt-4" noPad>
        {history.isLoading ? (
          <Loading />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState
            icon="â‡„"
            title="Aucune transmission"
            description="Chaque envoi vers la TÃ©lÃ©dÃ©claration ou e-Fatoura est journalisÃ© ici avec son statut, sa rÃ©fÃ©rence et le message renvoyÃ© par la plateforme."
          />
        ) : (
          <Table head={["Date", "Plateforme", "Objet", "Statut", "RÃ©fÃ©rence", "Message"]}>
            {(history.data ?? []).map((h) => (
              <tr key={h.id}>
                <td className="text-muted-foreground">
                  {new Date(h.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td>
                  <Badge tone={h.platform === "ttn" ? "info" : "gold"}>
                    {h.platform === "ttn" ? "TTN" : "e-Fatoura"}
                  </Badge>
                </td>
                <td className="font-mono text-[12px]">{h.subjectLabel}</td>
                <td>
                  <Badge
                    tone={
                      h.status === "envoye"
                        ? "success"
                        : h.status === "non_configure"
                          ? "muted"
                          : "danger"
                    }
                  >
                    {h.status === "envoye"
                      ? "EnvoyÃ©"
                      : h.status === "non_configure"
                        ? "Non configurÃ©"
                        : h.status === "refuse"
                          ? "RefusÃ©"
                          : "RÃ©seau"}
                  </Badge>
                </td>
                <td className="font-mono text-[11.5px] text-muted-foreground">{h.reference || "â€”"}</td>
                <td className="max-w-[320px] text-[11.5px] text-muted-foreground">{h.message}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="Obligations fiscales tunisiennes" subtitle="RepÃ¨res de conformitÃ©" className="mt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              t: "TVA",
              rows: [
                ["Taux", "19 % Â· 13 % Â· 7 % Â· 0 %"],
                ["DÃ©pÃ´t", "Avant le 28 du mois suivant"],
                ["RÃ©gime", c?.taxRegime === "reel" ? "RÃ©el" : "Forfaitaire"],
              ],
            },
            {
              t: "IRPP",
              rows: [
                ["Tranches", "8 â€” de 0 % Ã  40 %"],
                ["Abattement", "Chef de famille + charges"],
                ["Retenue", "Mensuelle Ã  la source"],
              ],
            },
            {
              t: "CNSS / CSS",
              rows: [
                ["SalariÃ©", `${CNSS_EMPLOYEE_RATE} %`],
                ["Employeur", `${CNSS_EMPLOYER_RATE} %`],
                ["CSS", `${CSS_RATE} %`],
              ],
            },
            {
              t: "IS",
              rows: [
                ["Taux", `${IS_RATES.join(" % / ")} %`],
                ["Acomptes", "3 Ã— 30 %"],
                ["Minimum", "0,2 % du CA"],
              ],
            },
            {
              t: "TCL",
              rows: [
                ["Assiette", "Valeur locative"],
                ["Taux", "0,1 % Â· 0,2 % (hÃ´tels)"],
                ["PÃ©riodicitÃ©", "Annuelle"],
              ],
            },
            {
              t: "Timbre fiscal",
              rows: [
                ["Facture", "1,000 TND"],
                ["Retenue source", "1 % / 3 %"],
                ["Export", "GÃ©nÃ©ration CSV / PDF"],
              ],
            },
          ].map((card) => (
            <div key={card.t} className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[12px] font-semibold text-navy">{card.t}</p>
              <dl className="mt-2 space-y-1">
                {card.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-[11.5px]">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="num text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Les dÃ©clarations sont gÃ©nÃ©rÃ©es et exportables ; aucune transmission automatique Ã  la TÃ©lÃ©dÃ©claration TTN
          n'est effectuÃ©e.
        </p>
      </Panel>
    </>
  );
}
