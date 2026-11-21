import React, { useEffect, useMemo, useState } from 'react';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportToPowerPoint,
  type ExportColumn,
} from './exportUtils';

interface JournalLine {
  entryNumber: string;
  accountType: string | null;
  debit: number;
  credit: number;
}

interface InvoiceRow {
  totalAmount: number;
  status: string;
  currencyCode: string | null;
  functionalCurrencyCode: string | null;
}

interface OperationalSnapshot {
  snapshotDate: string;
  stock: { lowStockItems: number; monitoredItems: number; unmonitoredItems: number; invalidItems: number };
  purchases: {
    ordersAwaitingReview: number;
    overdueApprovedOrders: number;
    approvedOrdersMissingExpectedDate: number;
  };
  production: { draftOrders: number };
  maintenance: { overdueOpenOrders: number; openOrders: number };
  quality: {
    highSeverityOpenFindings: number;
    overdueOpenFindings: number;
    overdueActions: number;
    openFindingsMissingDueDate: number;
    openActionsMissingDueDate: number;
  };
  hr: {
    pendingLeaveRequests: number;
    expiredEmployeeDocuments: number;
    documentsExpiringWithin30Days: number;
    documentsMissingValidityDate: number;
  };
}

export interface DecisionData {
  entity: { code: string; countryCode: string; currencyCode: string };
  journalLines: JournalLine[];
  salesInvoices: InvoiceRow[];
  purchaseInvoices: InvoiceRow[];
  cashflow: {
    totals: { closingBalance: number | null };
    diagnostics: { invalidJournalLineCount: number; mappedAccountCount: number; totalsAvailable: boolean };
  };
  operational?: OperationalSnapshot;
}

interface Recommendation {
  priority: 'Élevée' | 'À suivre' | 'Information';
  domain: string;
  indicator: string;
  finding: string;
  action: string;
  source: string;
}

const columns: ExportColumn[] = [
  { header: 'Priorité', key: 'priority' },
  { header: 'Domaine', key: 'domain' },
  { header: 'Indicateur', key: 'indicator' },
  { header: 'Constat', key: 'finding' },
  { header: 'Action proposée', key: 'action' },
  { header: 'Source', key: 'source' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRows<T>(value: unknown, isRow: (row: unknown) => row is T, label: string): T[] {
  if (!isRecord(value) || !Array.isArray(value.rows) || !value.rows.every(isRow)) {
    throw new Error(`Les données du rapport ${label} sont invalides.`);
  }
  return value.rows;
}

function isJournalLine(value: unknown): value is JournalLine {
  return isRecord(value)
    && typeof value.entryNumber === 'string'
    && (typeof value.accountType === 'string' || value.accountType === null)
    && typeof value.debit === 'number' && Number.isFinite(value.debit)
    && typeof value.credit === 'number' && Number.isFinite(value.credit);
}

function isInvoice(value: unknown): value is InvoiceRow {
  return isRecord(value)
    && typeof value.totalAmount === 'number' && Number.isFinite(value.totalAmount)
    && typeof value.status === 'string'
    && (typeof value.currencyCode === 'string' || value.currencyCode === null)
    && (typeof value.functionalCurrencyCode === 'string' || value.functionalCurrencyCode === null);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidMillimeAmount(value: number): boolean {
  const millimes = Math.round(value * 1000);
  return Number.isFinite(value)
    && Number.isSafeInteger(millimes)
    && Math.abs(value * 1000 - millimes) <= 1e-7;
}

function isValidAmount(value: number): boolean {
  return value >= 0 && isValidMillimeAmount(value);
}

function isOperationalSnapshot(value: unknown): value is OperationalSnapshot {
  return isRecord(value)
    && isCalendarDate(value.snapshotDate)
    && isRecord(value.stock)
    && isNonNegativeInteger(value.stock.lowStockItems)
    && isNonNegativeInteger(value.stock.monitoredItems)
    && isNonNegativeInteger(value.stock.unmonitoredItems)
    && isNonNegativeInteger(value.stock.invalidItems)
    && value.stock.lowStockItems <= value.stock.monitoredItems
    && isRecord(value.purchases)
    && isNonNegativeInteger(value.purchases.ordersAwaitingReview)
    && isNonNegativeInteger(value.purchases.overdueApprovedOrders)
    && isNonNegativeInteger(value.purchases.approvedOrdersMissingExpectedDate)
    && isRecord(value.production)
    && isNonNegativeInteger(value.production.draftOrders)
    && isRecord(value.maintenance)
    && isNonNegativeInteger(value.maintenance.overdueOpenOrders)
    && isNonNegativeInteger(value.maintenance.openOrders)
    && value.maintenance.overdueOpenOrders <= value.maintenance.openOrders
    && isRecord(value.quality)
    && isNonNegativeInteger(value.quality.highSeverityOpenFindings)
    && isNonNegativeInteger(value.quality.overdueOpenFindings)
    && isNonNegativeInteger(value.quality.overdueActions)
    && isNonNegativeInteger(value.quality.openFindingsMissingDueDate)
    && isNonNegativeInteger(value.quality.openActionsMissingDueDate)
    && isRecord(value.hr)
    && isNonNegativeInteger(value.hr.pendingLeaveRequests)
    && isNonNegativeInteger(value.hr.expiredEmployeeDocuments)
    && isNonNegativeInteger(value.hr.documentsExpiringWithin30Days)
    && isNonNegativeInteger(value.hr.documentsMissingValidityDate);
}

function formatAmount(value: number, currency: string) {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
}

export function buildRecommendations(data: DecisionData, period: string): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const knownAccountTypes = new Set(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']);
  const invalidJournalLines = data.journalLines.filter((line) => (
    !line.entryNumber.trim()
    || !isValidAmount(line.debit)
    || !isValidAmount(line.credit)
    || (line.debit > 0 && line.credit > 0)
    || (line.debit === 0 && line.credit === 0)
  )).length;
  const entryBalances = new Map<string, { debit: number; credit: number; invalid: boolean }>();
  for (const line of data.journalLines) {
    const balance = entryBalances.get(line.entryNumber) ?? { debit: 0, credit: 0, invalid: false };
    const debitMillimes = Math.round(line.debit * 1000);
    const creditMillimes = Math.round(line.credit * 1000);
    balance.debit += debitMillimes;
    balance.credit += creditMillimes;
    balance.invalid ||= !Number.isSafeInteger(balance.debit) || !Number.isSafeInteger(balance.credit);
    entryBalances.set(line.entryNumber, balance);
  }
  const unbalancedEntries = [...entryBalances.values()].filter((balance) => (
    balance.invalid || balance.debit !== balance.credit
  )).length;
  const unclassifiedJournalLines = data.journalLines.filter((line) => (
    line.accountType === null || !knownAccountTypes.has(line.accountType)
  )).length;
  const revenueLines = data.journalLines.filter((line) => line.accountType === 'Revenue');
  const expenseLines = data.journalLines.filter((line) => line.accountType === 'Expense');
  const revenue = revenueLines.reduce((sum, line) => sum + line.credit - line.debit, 0);
  const expenses = expenseLines.reduce((sum, line) => sum + line.debit - line.credit, 0);
  const sales = data.salesInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const purchases = data.purchaseInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const invalidSalesInvoices = data.salesInvoices.filter((invoice) => (
    !isValidAmount(invoice.totalAmount)
    || !['ISSUED', 'PAID'].includes(invoice.status)
    || (invoice.functionalCurrencyCode ?? invoice.currencyCode) !== data.entity.currencyCode
  )).length;
  const invalidPurchaseInvoices = data.purchaseInvoices.filter((invoice) => (
    !isValidAmount(invoice.totalAmount)
    || invoice.status !== 'POSTED'
    || (invoice.functionalCurrencyCode ?? invoice.currencyCode) !== data.entity.currencyCode
  )).length;
  const sourcePeriod = `Période ${period}`;

  if (data.journalLines.length === 0) {
    recommendations.push({
      priority: 'Information',
      domain: 'Finance',
      indicator: 'Écritures POSTED',
      finding: 'Aucune ligne comptable validée n’est disponible pour la période.',
      action: 'Compléter la saisie et la validation comptables avant de s’appuyer sur les indicateurs financiers.',
      source: `Grand livre BI · ${sourcePeriod}`,
    });
  } else if (invalidJournalLines > 0 || unclassifiedJournalLines > 0 || unbalancedEntries > 0
    || revenueLines.length === 0 || expenseLines.length === 0
    || !isValidMillimeAmount(revenue) || !isValidMillimeAmount(expenses)) {
    recommendations.push({
      priority: invalidJournalLines > 0 || unclassifiedJournalLines > 0 || unbalancedEntries > 0 ? 'Élevée' : 'Information',
      domain: 'Qualité des données',
      indicator: 'Complétude du mouvement produits - charges',
      finding: [
        `${invalidJournalLines} ligne(s) comptable(s) invalides`,
        `${unclassifiedJournalLines} ligne(s) sans type de compte reconnu`,
        `${unbalancedEntries} écriture(s) déséquilibrée(s) ou hors précision sûre`,
        `${revenueLines.length} ligne(s) Revenue`,
        `${expenseLines.length} ligne(s) Expense`,
      ].join('; ') + '.',
      action: 'Le mouvement net n’est pas calculé tant que les lignes ne sont pas valides et classées et que les deux catégories de comptes ne sont pas représentées.',
      source: `Écritures POSTED du grand livre BI · ${sourcePeriod}`,
    });
  } else {
    const netResult = revenue - expenses;
    if (!isValidMillimeAmount(netResult)) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Qualité des données',
        indicator: 'Complétude du mouvement produits - charges',
        finding: 'Le total produits - charges dépasse la précision numérique calculable.',
        action: 'Vérifier les écritures agrégées avant de calculer ou d’interpréter un résultat de période.',
        source: `Écritures POSTED classées Revenue/Expense · ${sourcePeriod}`,
      });
    } else if (netResult < 0) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Finance',
        indicator: 'Mouvement net produits - charges',
        finding: `Déficit comptable de ${formatAmount(Math.abs(netResult), data.entity.currencyCode)}.`,
        action: 'Analyser les principaux comptes de charges et la marge par activité avant d’engager de nouvelles dépenses.',
        source: `Écritures POSTED classées Revenue/Expense · ${sourcePeriod}`,
      });
    } else {
      recommendations.push({
        priority: 'Information',
        domain: 'Finance',
        indicator: 'Mouvement net produits - charges',
        finding: `Solde comptable positif de ${formatAmount(netResult, data.entity.currencyCode)}.`,
        action: 'Suivre l’évolution avec les périodes précédentes et vérifier séparément la trésorerie disponible.',
        source: `Écritures POSTED classées Revenue/Expense · ${sourcePeriod}`,
      });
    }

  }

  if (data.salesInvoices.length === 0 || data.purchaseInvoices.length === 0
    || invalidSalesInvoices > 0 || invalidPurchaseInvoices > 0
    || !isValidMillimeAmount(sales) || !isValidMillimeAmount(purchases)) {
    recommendations.push({
      priority: 'Information',
      domain: 'Achats & ventes',
      indicator: 'Couverture des factures',
      finding: `Factures ventes utilisables : ${data.salesInvoices.length - invalidSalesInvoices}/${data.salesInvoices.length}; factures fournisseurs POSTED utilisables : ${data.purchaseInvoices.length - invalidPurchaseInvoices}/${data.purchaseInvoices.length}.`,
      action: 'La comparaison des volumes est omise faute de factures des deux côtés ou de montants/statuts valides; vérifier la complétude des pièces du périmètre et leur comptabilisation.',
      source: `Factures BI et achats POSTED · ${sourcePeriod}`,
    });
  } else if (purchases > sales) {
    recommendations.push({
      priority: 'À suivre',
      domain: 'Achats',
      indicator: 'Achats fournisseurs / ventes',
      finding: `Le total des achats fournisseurs POSTED (${formatAmount(purchases, data.entity.currencyCode)}) dépasse le total des factures de vente (${formatAmount(sales, data.entity.currencyCode)}).`,
      action: 'Examiner les achats exceptionnels, le calendrier de réception et la cohérence des périodes; ce ratio ne constitue pas une marge.',
      source: `Factures fournisseurs POSTED et factures de vente émises · ${sourcePeriod}`,
    });
  }

  if (data.cashflow.diagnostics.invalidJournalLineCount > 0) {
    recommendations.push({
      priority: 'Élevée',
      domain: 'Qualité des données',
      indicator: 'Lignes comptables invalides',
      finding: `${data.cashflow.diagnostics.invalidJournalLineCount} ligne(s) invalide(s) empêchent de considérer les totaux de trésorerie comme fiables.`,
      action: 'Corriger les écritures concernées puis recalculer les rapports avant toute décision de paiement ou financement.',
      source: `Diagnostics trésorerie · ${sourcePeriod}`,
    });
  } else if (data.cashflow.diagnostics.totalsAvailable
    && data.cashflow.diagnostics.mappedAccountCount > 0
    && data.cashflow.totals.closingBalance !== null
    && isValidMillimeAmount(data.cashflow.totals.closingBalance)) {
    const closingBalance = data.cashflow.totals.closingBalance;
    if (closingBalance < 0) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Trésorerie',
        indicator: 'Solde de clôture comptable',
        finding: `Solde négatif de ${formatAmount(Math.abs(closingBalance), data.entity.currencyCode)}.`,
        action: 'Rapprocher le solde avec les relevés bancaires et réexaminer les échéances d’encaissement et de paiement.',
        source: `Comptes de trésorerie mappés · ${sourcePeriod}`,
      });
    }
  } else {
    recommendations.push({
      priority: 'Information',
      domain: 'Trésorerie',
      indicator: 'Complétude des soldes de trésorerie',
      finding: data.cashflow.diagnostics.mappedAccountCount === 0
        ? 'Aucun compte de trésorerie n’est mappé pour cette société; le solde de clôture n’est pas calculable.'
        : 'Le solde de clôture est indisponible ou les totaux de trésorerie ne sont pas fiables.',
      action: 'Configurer les comptes de trésorerie dans le mapping pays et corriger les éventuelles lignes invalides avant d’interpréter un solde.',
      source: `Diagnostics du rapport de trésorerie · ${sourcePeriod}`,
    });
  }

  const operational = data.operational;
  if (operational) {
    const snapshotSource = `Instantané opérationnel du ${operational.snapshotDate}`;
    if (operational.stock.unmonitoredItems > 0 || operational.stock.invalidItems > 0) {
      recommendations.push({
        priority: 'Information',
        domain: 'Qualité des données',
        indicator: 'Couverture des seuils de stock',
        finding: `${operational.stock.unmonitoredItems} article(s) sans seuil minimum et ${operational.stock.invalidItems} article(s) avec des quantités ou seuils invalides; ${operational.stock.monitoredItems} article(s) sont surveillés avec des données valides.`,
        action: 'Compléter les seuils et corriger les quantités invalides avant de considérer l’analyse des besoins comme exhaustive.',
        source: snapshotSource,
      });
    }
    if (operational.stock.lowStockItems > 0
      && operational.stock.unmonitoredItems === 0
      && operational.stock.invalidItems === 0) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Stocks',
        indicator: 'Articles sous le stock minimum',
        finding: `${operational.stock.lowStockItems} article(s) sur ${operational.stock.monitoredItems} suivi(s) sont sous leur seuil minimum.`,
        action: 'Vérifier les besoins, commandes ouvertes et dépôts concernés avant de déclencher un réapprovisionnement.',
        source: snapshotSource,
      });
    }
    if (operational.purchases.approvedOrdersMissingExpectedDate > 0) {
      recommendations.push({
        priority: 'Information',
        domain: 'Qualité des données',
        indicator: 'Dates attendues des commandes manquantes',
        finding: `${operational.purchases.approvedOrdersMissingExpectedDate} commande(s) approuvée(s) n’ont pas de date attendue.`,
        action: 'Compléter les dates attendues avant de considérer le suivi des retards fournisseurs comme exhaustif.',
        source: snapshotSource,
      });
    }
    if (operational.purchases.overdueApprovedOrders > 0
      && operational.purchases.approvedOrdersMissingExpectedDate === 0) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Achats',
        indicator: 'Commandes approuvées en retard',
        finding: `${operational.purchases.overdueApprovedOrders} commande(s) fournisseur(s) approuvée(s) ont dépassé leur date attendue.`,
        action: 'Contacter les fournisseurs et mettre à jour les dates attendues ou le plan d’approvisionnement.',
        source: snapshotSource,
      });
    }
    if (operational.purchases.ordersAwaitingReview > 0) {
      recommendations.push({
        priority: 'À suivre',
        domain: 'Achats',
        indicator: 'Commandes à contrôler',
        finding: `${operational.purchases.ordersAwaitingReview} commande(s) fournisseur(s) attend(ent) une revue.`,
        action: 'Faire contrôler les demandes avant approbation et engagement fournisseur.',
        source: snapshotSource,
      });
    }
    if (operational.production.draftOrders > 0) {
      recommendations.push({
        priority: 'À suivre',
        domain: 'Production',
        indicator: 'Ordres de fabrication en brouillon',
        finding: `${operational.production.draftOrders} ordre(s) de fabrication restent en brouillon.`,
        action: 'Vérifier disponibilité matière, dépôt, rebuts et coûts avant de confirmer ou annuler les ordres.',
        source: snapshotSource,
      });
    }
    if (operational.maintenance.overdueOpenOrders > 0) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Maintenance',
        indicator: 'Interventions en retard',
        finding: `${operational.maintenance.overdueOpenOrders} intervention(s) ouverte(s) ont dépassé leur date planifiée sur ${operational.maintenance.openOrders}.`,
        action: 'Évaluer l’impact sur la disponibilité des équipements et replanifier ou terminer les interventions.',
        source: snapshotSource,
      });
    }
    if (operational.quality.openFindingsMissingDueDate > 0 || operational.quality.openActionsMissingDueDate > 0) {
      recommendations.push({
        priority: 'Information',
        domain: 'Qualité des données',
        indicator: 'Échéances de non-conformité / CAPA incomplètes',
        finding: `${operational.quality.openFindingsMissingDueDate} dossier(s) ouvert(s) sans échéance et ${operational.quality.openActionsMissingDueDate} action(s) CAPA ouverte(s) sans échéance.`,
        action: 'Compléter les échéances manquantes avant de considérer le suivi des retards qualité comme complet.',
        source: snapshotSource,
      });
    }
    if (operational.quality.highSeverityOpenFindings > 0
      || (operational.quality.overdueActions > 0 && operational.quality.openActionsMissingDueDate === 0)) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Qualité',
        indicator: 'Non-conformités sévères ou actions CAPA échues',
        finding: `${operational.quality.highSeverityOpenFindings} dossier(s) ouvert(s) de gravité élevée/critique${operational.quality.openActionsMissingDueDate === 0 ? ` et ${operational.quality.overdueActions} action(s) CAPA échue(s)` : ''}.`,
        action: 'Prioriser le confinement, l’analyse de cause et la vérification des actions correctives avant clôture.',
        source: snapshotSource,
      });
    } else if (operational.quality.overdueOpenFindings > 0 && operational.quality.openFindingsMissingDueDate === 0) {
      recommendations.push({
        priority: 'À suivre',
        domain: 'Qualité',
        indicator: 'Non-conformités échues',
        finding: `${operational.quality.overdueOpenFindings} dossier(s) de non-conformité ouvert(s) ont dépassé leur échéance.`,
        action: 'Revoir les responsables, causes et échéances des actions CAPA.',
        source: snapshotSource,
      });
    }
    if (operational.hr.documentsMissingValidityDate > 0) {
      recommendations.push({
        priority: 'Information',
        domain: 'Qualité des données',
        indicator: 'Dates de validité RH manquantes',
        finding: `${operational.hr.documentsMissingValidityDate} document(s) actif(s) ne comportent pas de date de validité.`,
        action: 'Compléter les dates de validité avant de considérer le contrôle des expirations RH comme exhaustif.',
        source: snapshotSource,
      });
    }
    if (operational.hr.expiredEmployeeDocuments > 0 && operational.hr.documentsMissingValidityDate === 0) {
      recommendations.push({
        priority: 'Élevée',
        domain: 'Ressources humaines',
        indicator: 'Documents employés expirés',
        finding: `${operational.hr.expiredEmployeeDocuments} document(s) actif(s) ont une date de validité dépassée.`,
        action: 'Vérifier les pièces concernées avec les responsables RH et mettre à jour leurs métadonnées de validité.',
        source: snapshotSource,
      });
    }
    if ((operational.hr.documentsExpiringWithin30Days > 0 && operational.hr.documentsMissingValidityDate === 0)
      || operational.hr.pendingLeaveRequests > 0) {
      recommendations.push({
        priority: 'À suivre',
        domain: 'Ressources humaines',
        indicator: 'Échéances et demandes à traiter',
        finding: `${operational.hr.documentsMissingValidityDate === 0 ? `${operational.hr.documentsExpiringWithin30Days} document(s) expirent sous 30 jours` : 'Expiration des documents non calculable, dates de validité incomplètes'}; ${operational.hr.pendingLeaveRequests} demande(s) de congé attend(ent) une revue.`,
        action: 'Planifier le renouvellement des pièces lorsque les dates sont complètes et traiter les demandes de congé en attente.',
        source: snapshotSource,
      });
    }
  }

  return recommendations;
}

export default function DecisionSupportPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<DecisionData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !entityId) {
      setData(null);
      setError('Une société et une session authentifiée sont requises pour calculer les recommandations.');
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const [year, month] = period.split('-').map(Number);
        const from = `${period}-01`;
        const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        const headers = { Authorization: `Bearer ${accessToken}` };
        const endpoints = [
          `/api/bi/journal-lines?from=${from}&to=${to}`,
          `/api/bi/sales-invoices?from=${from}&to=${to}`,
          `/api/bi/purchase-invoices?from=${from}&to=${to}`,
          `/api/cashflow/data?period=${period}`,
          '/api/ai/operational-insights',
        ];
        const responses = await Promise.all(endpoints.map((url) => fetch(url, { headers, signal: controller.signal })));
        const payloads: unknown[] = await Promise.all(responses.map(async (response) => {
          const value: unknown = await response.json();
          if (!response.ok) {
            const message = isRecord(value) && typeof value.error === 'string' ? value.error : 'Le rapport requis est indisponible.';
            throw new Error(message);
          }
          return value;
        }));
        const [journalPayload, salesPayload, purchasesPayload, cashflowPayload, operationalPayload] = payloads;
        const journalLines = parseRows(journalPayload, isJournalLine, 'comptable');
        const salesInvoices = parseRows(salesPayload, isInvoice, 'des ventes');
        const purchaseInvoices = parseRows(purchasesPayload, isInvoice, 'des achats');
        if (!isRecord(journalPayload) || !isRecord(journalPayload.entity)
          || typeof journalPayload.entity.code !== 'string'
          || typeof journalPayload.entity.countryCode !== 'string'
          || typeof journalPayload.entity.currencyCode !== 'string') {
          throw new Error('Les informations de société du rapport BI sont invalides.');
        }
        if (!isRecord(cashflowPayload) || !isRecord(cashflowPayload.totals)
          || (cashflowPayload.totals.closingBalance !== null
            && (typeof cashflowPayload.totals.closingBalance !== 'number' || !Number.isFinite(cashflowPayload.totals.closingBalance)))
          || !isRecord(cashflowPayload.diagnostics)
          || !isNonNegativeInteger(cashflowPayload.diagnostics.invalidJournalLineCount)
          || !isNonNegativeInteger(cashflowPayload.diagnostics.mappedAccountCount)
          || typeof cashflowPayload.diagnostics.totalsAvailable !== 'boolean') {
          throw new Error('Les diagnostics de trésorerie sont invalides.');
        }
        if (!isOperationalSnapshot(operationalPayload)) {
          throw new Error('Les indicateurs opérationnels sont invalides.');
        }
        setData({
          entity: journalPayload.entity as DecisionData['entity'],
          journalLines,
          salesInvoices,
          purchaseInvoices,
          cashflow: {
            totals: { closingBalance: cashflowPayload.totals.closingBalance as number | null },
            diagnostics: {
              invalidJournalLineCount: cashflowPayload.diagnostics.invalidJournalLineCount,
              mappedAccountCount: cashflowPayload.diagnostics.mappedAccountCount,
              totalsAvailable: cashflowPayload.diagnostics.totalsAvailable,
            },
          },
          operational: operationalPayload,
        });
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setData(null);
        setError(requestError instanceof Error ? requestError.message : 'Impossible de calculer les recommandations.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [accessToken, entityId, period]);

  const recommendations = useMemo(() => data ? buildRecommendations(data, period) : [], [data, period]);
  const metadata = data ? {
    moduleName: 'Aide à la décision',
    companyName: data.entity.code,
    currency: data.entity.currencyCode,
    customDate: period,
  } : null;

  return (
    <section style={{ display: 'grid', gap: 14, color: '#0F172A' }}>
      <header style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <h2 style={{ margin: 0 }}>Aide à la décision</h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
            Recommandations calculées à partir des écritures POSTED, des factures, des soldes de trésorerie et des indicateurs opérationnels agrégés; aucune action n’est exécutée automatiquement.
          </p>
        </div>
        <label style={{ display: 'grid', gap: 4, fontWeight: 700 }}>Période
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
      </header>
      {error && <div role="alert" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 8, padding: 12 }}>{error}</div>}
      {loading && <div role="status">Calcul des indicateurs de décision…</div>}
      {data && metadata && (
        <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <button type="button" disabled={!recommendations.length} onClick={() => exportToExcel('Aide_decision', columns, recommendations, metadata)}>Excel .xlsx</button>
            <button type="button" disabled={!recommendations.length} onClick={() => exportToCSV('Aide_decision', columns, recommendations, metadata)}>CSV</button>
            <button type="button" disabled={!recommendations.length} onClick={() => exportToPDF('Aide à la décision', columns, recommendations, metadata)}>PDF / imprimer</button>
            <button type="button" disabled={!recommendations.length} onClick={() => void exportToPowerPoint('Aide_decision', columns, recommendations, metadata)}>PowerPoint</button>
          </div>
          {recommendations.length === 0
            ? <p role="status">Aucune recommandation n’a été déclenchée par les indicateurs calculés pour cette période.</p>
            : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                  {['Priorité', 'Domaine', 'Indicateur', 'Constat', 'Action proposée', 'Source'].map((heading) => <th key={heading} style={{ padding: 8 }}>{heading}</th>)}
                </tr></thead>
                <tbody>{recommendations.map((recommendation, index) => (
                  <tr key={`${recommendation.domain}-${index}`} style={{ borderBottom: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                    <td style={{ padding: 8, fontWeight: 700 }}>{recommendation.priority}</td>
                    <td style={{ padding: 8 }}>{recommendation.domain}</td>
                    <td style={{ padding: 8 }}>{recommendation.indicator}</td>
                    <td style={{ padding: 8 }}>{recommendation.finding}</td>
                    <td style={{ padding: 8 }}>{recommendation.action}</td>
                    <td style={{ padding: 8, color: '#475569' }}>{recommendation.source}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
          <p style={{ color: '#64748B', fontSize: 12, marginBottom: 0 }}>
            Les comparaisons de factures mesurent des volumes de pièces et non des soldes dus ou une marge. Les recommandations sont des aides de pilotage, à vérifier avec les données opérationnelles détaillées.
          </p>
        </section>
      )}
    </section>
  );
}
