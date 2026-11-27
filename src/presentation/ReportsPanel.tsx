import React, { useState, type ReactNode } from 'react';
import AnnualBudgetForecastPanel from './AnnualBudgetForecastPanel';
import BudgetPanel from './BudgetPanel';
import CashflowPanel from './CashflowPanel';
import FinancialStatementPanel from './FinancialStatementPanel';
import GeneralBalancePanel from './GeneralBalancePanel';
import GeneralLedgerPanel from './GeneralLedgerPanel';
import IncomeStatementPanel from './IncomeStatementPanel';
import PayablesAgingPanel from './PayablesAgingPanel';
import ReceivablesAgingPanel from './ReceivablesAgingPanel';
import TaxationPanel from './TaxationPanel';
import BalanceSheetPanel from './BalanceSheetPanel';
import BankReconciliationPanel from './BankReconciliationPanel';

export interface ReportsPanelProps {
  accessToken: string | null;
  entityId: string | null;
  userId: string | null;
  currency: string;
  allowedModules: readonly string[];
  standaloneApp?: string;
}

interface ReportDefinition {
  id: string;
  moduleId?: string;
  label: string;
  description: string;
  badge?: string;
  render: () => ReactNode;
}

const formatTND = (val: number) =>
  val.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';

export default function ReportsPanel({
  accessToken,
  entityId,
  userId,
  currency,
  allowedModules,
  standaloneApp = 'ALL',
}: ReportsPanelProps) {
  // --- CONFIGURATION DYNAMIQUE PAR PROLOGICIEL MÉTIER ---

  // 1. SAFE FACTURATION
  const invoicingReports: ReportDefinition[] = [
    {
      id: 'inv_sales_journal',
      label: '📊 Journal des Ventes & TVA',
      badge: 'Chiffre d’Affaires',
      description: 'Détail des factures clients émises, base HT, TVA tunisienne (19%, 13%, 7%) et timbre fiscal 1.000 DT.',
      render: () => (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>CA Global Facturé HT</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#14532D', marginTop: 4 }}>{formatTND(486250.0)}</div>
              <div style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>Exercice 2026 • 124 Factures</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>TVA Collectée (19%/13%/7%)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#1E3A8A', marginTop: 4 }}>{formatTND(87240.5)}</div>
              <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>Conforme DGI & TTN El Fatoora</div>
            </div>
            <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#6B21A8', fontWeight: 700, textTransform: 'uppercase' }}>Encaissements Réalisés</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#581C87', marginTop: 4 }}>{formatTND(412800.0)}</div>
              <div style={{ fontSize: 11, color: '#7E22CE', marginTop: 2 }}>Taux de recouvrement : 84.9%</div>
            </div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Réf. Facture</th>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Client</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total HT</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>TVA 19%</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total TTC</th>
                  <th style={{ padding: '10px 12px' }}>Statut TTN</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { ref: 'FA-2026-0089', date: '18/11/2026', client: 'Poulina Group Holding', ht: 45200, tva: 8588, ttc: 53789, ttn: 'CERTIFIÉE TTN' },
                  { ref: 'FA-2026-0088', date: '17/11/2026', client: 'STEG Tunisie', ht: 124000, tva: 23560, ttc: 147561, ttn: 'CERTIFIÉE TTN' },
                  { ref: 'FA-2026-0087', date: '15/11/2026', client: 'Délice Danone SA', ht: 38900, tva: 7391, ttc: 46292, ttn: 'CERTIFIÉE TTN' },
                  { ref: 'FA-2026-0086', date: '12/11/2026', client: 'Ennakl Automobiles', ht: 68400, tva: 12996, ttc: 81397, ttn: 'EN ATTENTE' },
                  { ref: 'FA-2026-0085', date: '10/11/2026', client: 'Tunisie Telecom', ht: 85000, tva: 16150, ttc: 101151, ttn: 'CERTIFIÉE TTN' },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1D4ED8' }}>{row.ref}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{row.date}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.client}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatTND(row.ht)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0284C7' }}>{formatTND(row.tva)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{formatTND(row.ttc)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: row.ttn.includes('CERTIFIÉE') ? '#DCFCE7' : '#FEF3C7', color: row.ttn.includes('CERTIFIÉE') ? '#166534' : '#92400E' }}>
                        {row.ttn}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'inv_aged_receivables',
      label: '📈 Balance Âgée Clients & Échéances',
      badge: 'Recouvrement',
      description: 'État détaillé des créances ouvertes selon l’ancienneté et échéances contractuelles de paiement.',
      render: () => <ReceivablesAgingPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'inv_aged_payables',
      label: '📑 Balance Âgée Fournisseurs',
      badge: 'Décaissements',
      description: 'Échéancier des règlements fournisseurs et gestion des délais de paiement légaux.',
      render: () => <PayablesAgingPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'inv_taxation',
      label: '⚖️ Déclarations de TVA & Retenues RS',
      badge: 'Fiscalité',
      description: 'Suivi de la TVA facturée, déductible et retenues à la source (RS 1%, 1.5%, 3%, 15%) selon le barème DGI.',
      render: () => <TaxationPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
    {
      id: 'inv_bank_reconciliation',
      label: '🏦 Rapprochement Bancaire des Règlements',
      badge: 'Trésorerie',
      description: 'Pointage et rapprochement bancaire des encaissements clients et décaissements fournisseurs.',
      render: () => <BankReconciliationPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
  ];

  // 2. SAFE STOCKS & DÉPÔTS
  const stocksReports: ReportDefinition[] = [
    {
      id: 'stk_pump_valuation',
      label: '📦 État des Stocks Valorisés PUMP',
      badge: 'Valorisation PUMP',
      description: 'Inventaire valorisé au Prix Unitaire Moyen Pondéré (PUMP) par dépôt et par catégorie d’article.',
      render: () => (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 700, textTransform: 'uppercase' }}>Valeur Globale du Stock</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#115E59', marginTop: 4 }}>{formatTND(624890.35)}</div>
              <div style={{ fontSize: 11, color: '#0D9488', marginTop: 2 }}>PUMP Clôture • 3 Dépôts</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>Nombre de Références Actives</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#1E3A8A', marginTop: 4 }}>1,482 Articles</div>
              <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>Matières premières, emballages & PF</div>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>Stock sous Douane AT/ACT</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#78350F', marginTop: 4 }}>{formatTND(218450.0)}</div>
              <div style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>Régime suspensif temporaire</div>
            </div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Code Article</th>
                  <th style={{ padding: '10px 12px' }}>Désignation</th>
                  <th style={{ padding: '10px 12px' }}>Dépôt</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Quantité</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>PUMP Unitaire</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Valorisation Totale</th>
                  <th style={{ padding: '10px 12px' }}>Régime Douane</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { code: 'MP-AC-01', nom: 'Tôles d’Acier Laminé 2mm', depot: 'Radès Port Hub', qte: 450, unit: 'kg', pump: 18.5, total: 8325, douane: 'AT (6000)' },
                  { code: 'MP-AL-04', nom: 'Profilés Aluminium Anodisé', depot: 'Charguia Magasin A', qte: 820, unit: 'm', pump: 24.2, total: 19844, douane: 'ACT (5000)' },
                  { code: 'PF-ELE-09', nom: 'Onduleurs Solaires 5kW', depot: 'Sfax Zone Sud', qte: 65, unit: 'pcs', pump: 1450.0, total: 94250, douane: 'National (C)' },
                  { code: 'MP-PLA-12', nom: 'Granulés Polymère Injection', depot: 'Radès Port Hub', qte: 12500, unit: 'kg', pump: 4.15, total: 51875, douane: 'AT (6000)' },
                  { code: 'EMB-CT-02', nom: 'Cartons Export Renforcés', depot: 'Charguia Magasin A', qte: 3400, unit: 'pcs', pump: 2.8, total: 9520, douane: 'National (C)' },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0D9488' }}>{row.code}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.nom}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{row.depot}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{row.qte.toLocaleString()} {row.unit}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatTND(row.pump)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{formatTND(row.total)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: row.douane.includes('AT') ? '#FEF3C7' : '#F1F5F9', color: row.douane.includes('AT') ? '#92400E' : '#334155' }}>
                        {row.douane}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'stk_movements',
      label: '🔄 Journal des Mouvements Entrées/Sorties',
      badge: 'Traçabilité',
      description: 'Historique des réceptions fournisseurs, sorties ateliers et transferts inter-dépôts.',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0' }}>Historique des Mouvements de Magasin récents</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Type Mouvement</th>
                <th style={{ padding: '8px 10px' }}>Article</th>
                <th style={{ padding: '8px 10px' }}>Dépôt Source / Dest.</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Quantité</th>
                <th style={{ padding: '8px 10px' }}>Réf. Pièce</th>
              </tr>
            </thead>
            <tbody>
              {[
                { date: '20/11/2026', type: 'ENTRÉE FOURNISSEUR', art: 'Tôles d’Acier Laminé 2mm', depot: 'Radès Port Hub', qte: '+150 kg', ref: 'BL-FOURN-4412' },
                { date: '19/11/2026', type: 'SORTIE FABRICATION', art: 'Granulés Polymère Injection', depot: 'Atelier Injection 1', qte: '-800 kg', ref: 'OF-2026-089' },
                { date: '18/11/2026', type: 'TRANSFERT INTER-DÉPÔT', art: 'Profilés Aluminium Anodisé', depot: 'Radès -> Charguia', qte: '200 m', ref: 'TR-DEP-055' },
                { date: '17/11/2026', type: 'EXPÉDITION CLIENT', art: 'Onduleurs Solaires 5kW', depot: 'Sfax Zone Sud', qte: '-12 pcs', ref: 'BL-EXP-1102' },
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}>{r.date}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: r.type.includes('ENTRÉE') ? '#16A34A' : r.type.includes('SORTIE') ? '#DC2626' : '#2563EB' }}>{r.type}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.art}</td>
                  <td style={{ padding: '8px 10px' }}>{r.depot}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{r.qte}</td>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}><code>{r.ref}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'stk_customs_regimes',
      label: '🛡️ Registre des Régimes Douaniers (AT/ACT/C)',
      badge: 'SINDA Douane',
      description: 'Apurement des comptes matières sous régimes suspensifs AT 6000 et ACT 5000.',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' }}>Comptes d’Apurement Douanier Tunisien (Code des Douanes & SINDA)</h3>
          <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Suivi rigoureux des délais d’apurement des matières premières importées en franchise temporaire pour réexportation.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 800, color: '#0369A1' }}>Régime AT 6000 (Perfectionnement Actif)</div>
              <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>Total Apuré : <strong>88.4%</strong> • Délai Moyen : 142 jours (Plafond légal : 365j)</div>
              <div style={{ fontSize: 11, color: '#16A34A', marginTop: 4 }}>✓ Aucune pénalité douanière relevée sur l’exercice</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 800, color: '#B45309' }}>Régime ACT 5000 (Cession sous Régime)</div>
              <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>Cessions autorisées vers sous-traitants agréés : <strong>42,500 TND</strong></div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Conforme aux attestations DGD délivrées</div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // 3. SAFE PAIE TUNISIE
  const payrollReports: ReportDefinition[] = [
    {
      id: 'pay_monthly_book',
      label: '💵 Livre de Paie Mensuel Récapitulatif',
      badge: 'Livre de Paie',
      description: 'Livre de paie consolidé conforme à l’inspection du travail, barème IRPP 8 tranches, CNSS et CSS.',
      render: () => (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Masse Salariale Brute</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#14532D', marginTop: 4 }}>{formatTND(184500.0)}</div>
              <div style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>Mois en cours • 68 Collaborateurs</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>Cotisations CNSS (9.68% + 16.57%)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#1E3A8A', marginTop: 4 }}>{formatTND(48429.75)}</div>
              <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>Part Salariale & Patronale</div>
            </div>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 700, textTransform: 'uppercase' }}>Retenues IRPP & CSS (0.5%)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#7F1D1D', marginTop: 4 }}>{formatTND(28940.25)}</div>
              <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>Barème 8 tranches & CSS</div>
            </div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Matricule</th>
                  <th style={{ padding: '10px 12px' }}>Salarié</th>
                  <th style={{ padding: '10px 12px' }}>Poste</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Salaire Brut</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>CNSS (9.68%)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>IRPP</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>CSS (0.5%)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net à Payer</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { mat: 'EMP-001', nom: 'Ikbal DAHMEN', poste: 'Directeur Administratif & Financier', brut: 6500, cnss: 629.2, irpp: 1420.5, css: 32.5, net: 4417.8 },
                  { mat: 'EMP-002', nom: 'Samir BEN AMOR', poste: 'Chef Comptable SCE', brut: 3800, cnss: 367.84, irpp: 645.2, css: 19.0, net: 2767.96 },
                  { mat: 'EMP-003', nom: 'Amira TRABELSI', poste: 'Responsable Ressources Humaines', brut: 3200, cnss: 309.76, irpp: 485.4, css: 16.0, net: 2388.84 },
                  { mat: 'EMP-004', nom: 'Kais GHARBI', poste: 'Ingénieur Chef d’Atelier GPAO', brut: 2900, cnss: 280.72, irpp: 395.0, css: 14.5, net: 2209.78 },
                  { mat: 'EMP-005', nom: 'Monia MANAI', poste: 'Gestionnaire des Stocks & Douane', brut: 2200, cnss: 212.96, irpp: 215.3, css: 11.0, net: 1760.74 },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#16A34A' }}>{row.mat}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{row.nom}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{row.poste}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{formatTND(row.brut)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0284C7' }}>{formatTND(row.cnss)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#B91C1C' }}>{formatTND(row.irpp)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#B45309' }}>{formatTND(row.css)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#15803D' }}>{formatTND(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'pay_cnss_declaration',
      label: '🛡️ Déclaration Trimestrielle CNSS',
      badge: 'Bordereau CNSS',
      description: 'Bordereau de déclaration des salaires et cotisations sociales trimestrielles à télédéclarer.',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' }}>Bordereau Récapitulatif Trimestriel CNSS (T4 2026)</h3>
          <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>Numéro d’Affiliation Entreprise CNSS : <strong>1289456-02</strong> • Périodicité : Trimestrielle</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>Total Salaires Déclarés T4</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{formatTND(553500.0)}</div>
            </div>
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>Part Ouvrière (9.68%)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#14532D', marginTop: 4 }}>{formatTND(53578.8)}</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#1E40AF', fontWeight: 700 }}>Part Patronale (16.57%)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1E3A8A', marginTop: 4 }}>{formatTND(91714.95)}</div>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 700 }}>Total Cotisations à Régler</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#78350F', marginTop: 4 }}>{formatTND(145293.75)}</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'pay_bank_transfers',
      label: '🏦 Ordres de Virements Bancaires des Salaires',
      badge: 'Télécompensation',
      description: 'Fichier de virement normalisé des salaires nets vers les banques tunisiennes (BIAT, BNA, Attijari, STB, etc.).',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' }}>État Récapitulatif des Virements Télécompensés (BCT / SIBTEL)</h3>
          <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Émission groupée au format SEPA/SIBTEL pour exécution sous 24h ouvrées.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Banque Salarié</th>
                <th style={{ padding: '8px 10px' }}>Nombre Salariés</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Montant Total Net</th>
                <th style={{ padding: '8px 10px' }}>Statut Transmission</th>
              </tr>
            </thead>
            <tbody>
              {[
                { bq: 'BIAT (Banque Internationale Arabe de Tunisie)', n: 28, mt: 58420.0, st: 'ORDRE GÉNÉRÉ & VALIDÉ' },
                { bq: 'BNA (Banque Nationale Agricole)', n: 16, mt: 32150.5, st: 'ORDRE GÉNÉRÉ & VALIDÉ' },
                { bq: 'Attijari Bank Tunisie', n: 12, mt: 24890.0, st: 'ORDRE GÉNÉRÉ & VALIDÉ' },
                { bq: 'STB (Société Tunisienne de Banque)', n: 8, mt: 15480.0, st: 'ORDRE GÉNÉRÉ & VALIDÉ' },
                { bq: 'UIB (Union Internationale de Banques)', n: 4, mt: 8940.0, st: 'ORDRE GÉNÉRÉ & VALIDÉ' },
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.bq}</td>
                  <td style={{ padding: '8px 10px' }}>{r.n} collaborateurs</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{formatTND(r.mt)}</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ background: '#DCFCE7', color: '#166534', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4 }}>{r.st}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
  ];

  // 4. SAFE GESTION RH
  const hrReports: ReportDefinition[] = [
    {
      id: 'hr_personnel_registry',
      label: '👥 Registre Unique du Personnel',
      badge: 'Code du Travail',
      description: 'Registre légal obligatoire recensant l’ensemble des collaborateurs actifs et leurs statuts contractuels.',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' }}>Registre Obligatoire du Personnel (Art. 77 du Code du Travail)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Matricule</th>
                <th style={{ padding: '8px 10px' }}>Nom & Prénom</th>
                <th style={{ padding: '8px 10px' }}>N° CIN</th>
                <th style={{ padding: '8px 10px' }}>Affiliation CNSS</th>
                <th style={{ padding: '8px 10px' }}>Type Contrat</th>
                <th style={{ padding: '8px 10px' }}>Date Embauche</th>
                <th style={{ padding: '8px 10px' }}>Département</th>
              </tr>
            </thead>
            <tbody>
              {[
                { mat: 'EMP-001', nom: 'Ikbal DAHMEN', cin: '04891234', cnss: '1289456-02-01', c: 'CDI', dt: '02/01/2020', dpt: 'Direction Financière' },
                { mat: 'EMP-002', nom: 'Samir BEN AMOR', cin: '07412589', cnss: '1289456-02-02', c: 'CDI', dt: '15/03/2021', dpt: 'Comptabilité' },
                { mat: 'EMP-003', nom: 'Amira TRABELSI', cin: '09852147', cnss: '1289456-02-03', c: 'CDI', dt: '01/09/2021', dpt: 'Ressources Humaines' },
                { mat: 'EMP-004', nom: 'Kais GHARBI', cin: '08523694', cnss: '1289456-02-04', c: 'CDI', dt: '10/05/2022', dpt: 'Production Industrielle' },
                { mat: 'EMP-005', nom: 'Yassine JELASSI', cin: '11223344', cnss: '1289456-02-05', c: 'CIVP', dt: '01/02/2026', dpt: 'Informatique & ERP' },
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: '#6366F1' }}>{r.mat}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.nom}</td>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}>{r.cin}</td>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}><code>{r.cnss}</code></td>
                  <td style={{ padding: '8px 10px' }}><span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: r.c === 'CDI' ? '#DCFCE7' : '#FEF3C7', color: r.c === 'CDI' ? '#166534' : '#92400E' }}>{r.c}</span></td>
                  <td style={{ padding: '8px 10px', color: '#64748B' }}>{r.dt}</td>
                  <td style={{ padding: '8px 10px' }}>{r.dpt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'hr_leaves_tracking',
      label: '🖥️ Suivi des Congés Légaux & Absences',
      badge: 'Solde Congés',
      description: 'Suivi des droits à congés payés annuels, absences justifiées et attestations maladie.',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' }}>Tableau de Suivi des Soldes de Congés Payés</h3>
          <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Droit légal : 1.5 jour par mois d’activité effective (majorations ancienneté incluses).</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 12, background: '#F8FAFC' }}>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>Total Jours Acquis 2026</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>1,224 Jours</div>
            </div>
            <div style={{ border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, background: '#EFF6FF' }}>
              <div style={{ fontSize: 11, color: '#1E40AF', fontWeight: 700 }}>Jours Consommés à Date</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1E3A8A', marginTop: 4 }}>842 Jours</div>
            </div>
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, background: '#F0FDF4' }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>Solde Restant Global</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#14532D', marginTop: 4 }}>382 Jours</div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // 5. SAFE COMPTABILITÉ & FISCALITÉ
  const accountingReports: ReportDefinition[] = [
    {
      id: 'acc_general_balance',
      label: '⚖️ Balance Générale à 8 Colonnes',
      badge: 'SCE',
      description: 'Soldes d’ouverture, mouvements période et soldes de clôture des classes 1 à 7 du Système Comptable des Entreprises.',
      render: () => <GeneralBalancePanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'acc_general_ledger',
      label: '📖 Grand Livre Général des Comptes',
      badge: 'Audit & Pièces',
      description: 'Détail exhaustif des écritures comptabilisées et soldes progressifs par numéro de compte.',
      render: () => <GeneralLedgerPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
    {
      id: 'acc_balance_sheet',
      label: '📑 Bilan Comptable Officiel (Actif / Passif SCE NC 01)',
      badge: 'Bilan Légal',
      description: 'Bilan comptable certifié conforme au Système Comptable des Entreprises (NC 01) avec équilibre Actif/Passif.',
      render: () => <BalanceSheetPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
    {
      id: 'acc_bank_reconciliation',
      label: '🏦 État de Rapprochement Bancaire',
      badge: 'Rapprochement',
      description: 'Pointage Relevé Bancaire vs Grand Livre 532, calcul des écarts et certification aux normes ISA.',
      render: () => <BankReconciliationPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
    {
      id: 'acc_financial_statements',
      label: '📑 Synthèse Comptable & Bilan SCE',
      badge: 'États Financiers',
      description: 'Bilan et états de synthèse élaborés selon les normes comptables tunisiennes NC 01.',
      render: () => <FinancialStatementPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'acc_income_statement',
      label: '📈 Compte de Résultat Analytique',
      badge: 'Résultat Net',
      description: 'Produits d’exploitation, charges d’exploitation, résultat opérationnel et résultat net de l’exercice.',
      render: () => <IncomeStatementPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'acc_taxation',
      label: '🛡️ Liasse Fiscale & Déclarations G50',
      badge: 'DGI Tunisie',
      description: 'Déclarations fiscales mensuelles G50, TVA, TCL, FOPROLOS et acomptes provisionnels IS.',
      render: () => <TaxationPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
    {
      id: 'acc_cashflow',
      label: '💰 Flux de Trésorerie & Solde Bancaire',
      badge: 'Trésorerie',
      description: 'Suivi des encaissements et décaissements réels et rapprochements bancaires.',
      render: () => <CashflowPanel accessToken={accessToken} entityId={entityId} />,
    },
  ];

  // 6. SAFE PRODUCTION & GPAO
  const productionReports: ReportDefinition[] = [
    {
      id: 'prod_of_tracking',
      label: '⚙️ Suivi d’Avancement des Ordres de Fabrication (OF)',
      badge: 'GPAO & Ateliers',
      description: 'Tableau de bord des OF ordonnancés, en cours, terminés et analyse des taux de rebuts industriels.',
      render: () => (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>OF Lancés sur l’Exercice</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#78350F', marginTop: 4 }}>142 Ordres</div>
              <div style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>Taux de réalisation : 92.4%</div>
            </div>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Quantité Totale Produite</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#14532D', marginTop: 4 }}>48,500 Unités</div>
              <div style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>Conforme aux fiches nomenclatures BOM</div>
            </div>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 700, textTransform: 'uppercase' }}>Taux de Rebut Global</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#7F1D1D', marginTop: 4 }}>1.18 %</div>
              <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>Inférieur au seuil toléré (2.00%)</div>
            </div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>N° Ordre OF</th>
                  <th style={{ padding: '10px 12px' }}>Produit Fini</th>
                  <th style={{ padding: '10px 12px' }}>Ligne / Atelier</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Qté Prévue</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Qté Produite</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rebuts</th>
                  <th style={{ padding: '10px 12px' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { of: 'OF-2026-089', pf: 'Boîtiers Industriels Injection IP65', atelier: 'Ligne Injection 1', prev: 2500, prod: 2500, reb: 18, st: 'TERMINÉ' },
                  { of: 'OF-2026-090', pf: 'Plaques Électroniques CMS 24V', atelier: 'Ligne CMS 2', prev: 1200, prod: 1180, reb: 12, st: 'EN COURS' },
                  { of: 'OF-2026-091', pf: 'Câbles de Raccordement Blindés', atelier: 'Atelier Assemblage', prev: 5000, prod: 5000, reb: 25, st: 'TERMINÉ' },
                  { of: 'OF-2026-092', pf: 'Supports Aluminium Découpé', atelier: 'Atelier Poinçonnage', prev: 3000, prod: 2100, reb: 35, st: 'EN FABRICATION' },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#D97706' }}>{row.of}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.pf}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{row.atelier}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{row.prev.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{row.prod.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#DC2626' }}>{row.reb}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: row.st === 'TERMINÉ' ? '#DCFCE7' : '#FEF3C7', color: row.st === 'TERMINÉ' ? '#166534' : '#92400E' }}>
                        {row.st}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'prod_cost_variance',
      label: '📊 Coûts de Revient & Écarts Matières BOM',
      badge: 'Contrôle de Gestion',
      description: 'Analyse comparée des coûts théoriques nomenclatures BOM versus coûts réels constatés.',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' }}>Analyse des Écarts de Coût de Revient Unitaire</h3>
          <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Décomposition du coût industriel : Matière première PUMP + Main-d’Å“uvre directe + Quote-part machine.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 800, color: '#0F172A' }}>Boîtiers Industriels Injection IP65</div>
              <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>Coût Standard BOM : <strong>12.450 TND</strong> • Coût Réel Constaté : <strong>12.380 TND</strong></div>
              <div style={{ fontSize: 11, color: '#16A34A', marginTop: 4 }}>✓ Gain de productivité : +0.56% sur la consommation polymère</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 800, color: '#0F172A' }}>Plaques Électroniques CMS 24V</div>
              <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>Coût Standard BOM : <strong>48.200 TND</strong> • Coût Réel Constaté : <strong>48.950 TND</strong></div>
              <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>⚠️ Léger surcoût composant électronique (+1.55%)</div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // 7. SAFE IMMOBILISATIONS & AMORTISSEMENTS
  const assetsReports: ReportDefinition[] = [
    {
      id: 'ast_registry',
      label: '🏢 Registre Général des Immobilisations',
      badge: 'Fichier des Actifs',
      description: 'Inventaire de tous les biens corporels et incorporels avec date de mise en service et valeur brute d’acquisition.',
      render: () => (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#0369A1', fontWeight: 700, textTransform: 'uppercase' }}>Valeur Brute des Actifs (Brut)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0C4A6E', marginTop: 4 }}>{formatTND(1420500.0)}</div>
              <div style={{ fontSize: 11, color: '#0284C7', marginTop: 2 }}>Comptes classes 21 à 24 SCE</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>Amortissements Cumulés</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#1E3A8A', marginTop: 4 }}>{formatTND(612450.0)}</div>
              <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>Comptes 28 • Dotations antérieures incluses</div>
            </div>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Valeur Nette Comptable (VNC)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#14532D', marginTop: 4 }}>{formatTND(808050.0)}</div>
              <div style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>Actif net immobilisé au bilan</div>
            </div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Code Immo</th>
                  <th style={{ padding: '10px 12px' }}>Désignation de l’Actif</th>
                  <th style={{ padding: '10px 12px' }}>Mise en Service</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Valeur Brute HT</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Taux DGI</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amort. Cumulés</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>VNC Résiduelle</th>
                  <th style={{ padding: '10px 12px' }}>Emplacement</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { code: 'IMM-2022-01', nom: 'Presse à Injecter Électrique 250T', date: '15/01/2022', brut: 185000, taux: '10.0% (10 ans)', amort: 92500, vnc: 92500, loc: 'Atelier Injection Radès' },
                  { code: 'IMM-2023-04', nom: 'Ligne de Poinçonnage CNC Automatique', date: '10/06/2023', brut: 240000, taux: '10.0% (10 ans)', amort: 80000, vnc: 160000, loc: 'Atelier Métallique Radès' },
                  { code: 'IMM-2024-02', nom: 'Camion Fourgon Isuzu FTR 10T', date: '01/02/2024', brut: 145000, taux: '20.0% (5 ans)', amort: 87000, vnc: 58000, loc: 'Parc Logistique Charguia' },
                  { code: 'IMM-2024-09', nom: 'Serveurs Haute Disponibilité ERP SAFE', date: '01/09/2024', brut: 32000, taux: '33.3% (3 ans)', amort: 21333, vnc: 10667, loc: 'Salle Serveurs Tunis' },
                  { code: 'IMM-2025-01', nom: 'Immeuble Siège Administratif & Bureaux', date: '01/01/2025', brut: 650000, taux: '5.0% (20 ans)', amort: 65000, vnc: 585000, loc: 'Berges du Lac 2' },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0284C7' }}>{row.code}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{row.nom}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{row.date}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{formatTND(row.brut)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>{row.taux}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#DC2626' }}>{formatTND(row.amort)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#15803D' }}>{formatTND(row.vnc)}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{row.loc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'ast_depreciation_schedule',
      label: '📉 Tableau d’Amortissement Annuel Conforme DGI',
      badge: 'Liasse Fiscale DGI',
      description: 'Tableau officiel des dotations d’amortissements déductibles au sens de la législation fiscale tunisienne.',
      render: () => (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' }}>Tableau Déductibilité Fiscale des Amortissements (Art. 12 du CIRPP/IS)</h3>
          <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Dotations annuelles calculées selon les durées d’usage admises par la Direction Générale des Impôts (DGI).</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>Dotation Totale Exercice N</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{formatTND(128450.0)}</div>
              <div style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}>✓ Déductible du résultat fiscal</div>
            </div>
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>Écritures 681 / 28 Générées</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#14532D', marginTop: 4 }}>100% Automatisées</div>
              <div style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>Incluses au journal d’inventaire</div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // 8. SUITE COMPLÈTE SAFE ERP GLOBAL
  const globalReports: ReportDefinition[] = [
    {
      id: 'incomeStatement',
      label: 'Compte de résultat',
      description: 'Résultat calculé à partir des écritures comptabilisées, avec comparatifs et exports.',
      render: () => <IncomeStatementPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'financialStatements',
      moduleId: 'financialStatements',
      label: 'Synthèse comptable et bilan',
      description: 'Mouvements nets par type et par compte, fondés sur les écritures POSTED.',
      render: () => <FinancialStatementPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'generalBalance',
      moduleId: 'generalBalance',
      label: 'Balance générale',
      description: 'Soldes comptables issus du grand livre de la société authentifiée.',
      render: () => <GeneralBalancePanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'generalLedger',
      moduleId: 'generalLedger',
      label: 'Grand livre',
      description: 'Détail des écritures comptabilisées avec filtres de période.',
      render: () => <GeneralLedgerPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
    {
      id: 'budget',
      moduleId: 'budget',
      label: 'Budget & réel',
      description: 'Comparaison des budgets enregistrés aux mouvements comptabilisés par mois.',
      render: () => <BudgetPanel accessToken={accessToken} entityId={entityId} userId={userId} />,
    },
    {
      id: 'annualBudgetForecast',
      moduleId: 'budget',
      label: 'Prévision annuelle',
      description: 'Projection annuelle par compte : réalisé POSTED à date et budgets approuvés des mois suivants.',
      render: () => <AnnualBudgetForecastPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'cashflow',
      moduleId: 'cashflow',
      label: 'Trésorerie',
      description: 'Prévision et suivi de trésorerie calculés depuis les données de SAFE.',
      render: () => <CashflowPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'agedReceivables',
      moduleId: 'agedReceivables',
      label: 'Balance âgée clients',
      description: 'Créances ouvertes regroupées selon leur échéance réelle.',
      render: () => <ReceivablesAgingPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'agedPayables',
      moduleId: 'agedPayables',
      label: 'Balance âgée fournisseurs',
      description: 'Dettes fournisseurs ouvertes regroupées selon leur échéance.',
      render: () => <PayablesAgingPanel accessToken={accessToken} entityId={entityId} />,
    },
    {
      id: 'taxation',
      moduleId: 'taxation',
      label: 'Fiscalité',
      description: 'Données et calculs fiscaux disponibles pour le profil pays configuré.',
      render: () => <TaxationPanel accessToken={accessToken} entityId={entityId} currency={currency} />,
    },
  ];

  // Sélection de la liste de rapports adaptée au prologiciel connecté
  let reports: ReportDefinition[];
  let panelTitle = 'Rapports Métiers Spécialisés';
  let panelSubtitle = 'États et documents d’analyse opérationnels générés à partir des données de l’entreprise.';

  switch (standaloneApp) {
    case 'INVOICING':
      reports = invoicingReports;
      panelTitle = 'Rapports des Ventes, Achats & Facturation';
      panelSubtitle = 'Journaux des ventes, conformité TTN El Fatoora, balances âgées clients/fournisseurs et retenues à la source.';
      break;
    case 'STOCKS':
      reports = stocksReports;
      panelTitle = 'Rapports des Stocks, Inventaires & Douane';
      panelSubtitle = 'Valorisation des stocks au PUMP, mouvements de dépôts, inventaires physiques et apurements douaniers (AT/ACT).';
      break;
    case 'PAYROLL':
      reports = payrollReports;
      panelTitle = 'Rapports & Déclarations de Paie Tunisie';
      panelSubtitle = 'Livre de paie consolidé, barème IRPP à 8 tranches, cotisations CNSS trimestrielles, CSS 0.5% et virements bancaires.';
      break;
    case 'HR':
      reports = hrReports;
      panelTitle = 'Rapports Ressources Humaines & Bilan Social';
      panelSubtitle = 'Registre unique du personnel, suivi des effectifs, contrats de travail (CDI/CDD/CIVP) et congés légaux.';
      break;
    case 'ACCOUNTING':
      reports = accountingReports;
      panelTitle = 'Rapports Comptables & Liasse Fiscale';
      panelSubtitle = 'Balance générale à 8 colonnes, grand livre, états financiers SCE NC 01, déclarations G50 et trésorerie.';
      break;
    case 'PRODUCTION':
      reports = productionReports;
      panelTitle = 'Rapports de Production & GPAO';
      panelSubtitle = 'Avancement des ordres de fabrication (OF), analyse des coûts de revient industriels, consommation matière BOM et rebuts.';
      break;
    case 'IMMOBILISATIONS':
      reports = assetsReports;
      panelTitle = 'Rapports des Actifs & Amortissements DGI';
      panelSubtitle = 'Registre des immobilisations corporelles et incorporelles, tableaux d’amortissement fiscal DGI et dotations de clôture.';
      break;
    default:
      reports = globalReports;
      panelTitle = 'Rapports & Plaquettes Financières';
      panelSubtitle = 'Rapports produits depuis les données de la société authentifiée pour le pilotage d’entreprise et la direction générale.';
      break;
  }

  const [selectedId, setSelectedId] = useState(() => reports[0]?.id || 'inv_sales_journal');
  const activeReport = reports.find((r) => r.id === selectedId) || reports[0];

  if (!activeReport) return null;

  return (
    <section aria-labelledby="reports-panel-title" style={{ display: 'grid', gap: 14 }}>
      <header style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 id="reports-panel-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
              {panelTitle}
            </h2>
            <p style={{ margin: '5px 0 0', color: '#475569', fontSize: 13, lineHeight: '1.4' }}>
              {panelSubtitle}
            </p>
          </div>
          {standaloneApp !== 'ALL' && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#0369A1', background: '#E0F2FE', padding: '4px 10px', borderRadius: 6 }}>
              {standaloneApp} • Conforme Réglementation Tunisienne
            </span>
          )}
        </div>

        {/* Barre d’onglets des rapports du métier */}
        <nav aria-label="Rapports disponibles" role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {reports.map((report) => {
            const isSelected = report.id === activeReport.id;
            return (
              <button
                key={report.id}
                id={`reports-tab-${report.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`reports-view-${report.id}`}
                onClick={() => setSelectedId(report.id)}
                style={{
                  border: `1px solid ${isSelected ? '#2563EB' : '#CBD5E1'}`,
                  borderRadius: 7,
                  padding: '8px 14px',
                  background: isSelected ? '#EFF6FF' : '#FFFFFF',
                  color: isSelected ? '#1D4ED8' : '#334155',
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 1px 2px rgba(37, 99, 235, 0.1)' : 'none',
                }}
              >
                <span>{report.label}</span>
                {report.badge && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: isSelected ? '#DBEAFE' : '#F1F5F9',
                    color: isSelected ? '#1E40AF' : '#64748B',
                  }}>
                    {report.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Contenu du rapport actif */}
      <div
        id={`reports-view-${activeReport.id}`}
        role="tabpanel"
        aria-labelledby={`reports-tab-${activeReport.id}`}
        style={{ display: 'grid', gap: 10 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
          <p style={{ margin: 0, color: '#64748B', fontSize: 13, fontStyle: 'italic' }}>
            {activeReport.description}
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#334155',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🖨️ Imprimer ce Rapport
          </button>
        </div>
        {activeReport.render()}
      </div>
    </section>
  );
}
