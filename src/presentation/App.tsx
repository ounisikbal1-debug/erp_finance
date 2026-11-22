import React, { useEffect, useState, useMemo } from 'react';
import { SESSION_IDLE_TIMEOUT_SECONDS } from '../shared/session';
import AnomaliesPanel from './AnomaliesPanel';
import PayrollSimulationPanel from './PayrollSimulationPanel';
import CountryConfigurationPanel from './CountryConfigurationPanel';
import WorkbookReadinessPanel from './WorkbookReadinessPanel';
import TaxationPanel from './TaxationPanel';
import GeneralBalancePanel from './GeneralBalancePanel';
import GeneralLedgerPanel from './GeneralLedgerPanel';
import FinancialStatementPanel from './FinancialStatementPanel';
import PurchasesPanel from './PurchasesPanel';
import ProductionPanel from './ProductionPanel';
import SalesInvoicesPanel from './SalesInvoicesPanel';
import DashboardPanel from './DashboardPanel';
import BudgetPanel from './BudgetPanel';
import CashflowPanel from './CashflowPanel';
import FxRevaluationPanel from './FxRevaluationPanel';
import ConsolidationPanel from './ConsolidationPanel';
import IntercompanyPanel from './IntercompanyPanel';
import StocksPanel from './StocksPanel';
import EmployeesPanel from './EmployeesPanel';
import HrWorkflowsPanel from './HrWorkflowsPanel';
import PayablesAgingPanel from './PayablesAgingPanel';
import MonthlyClosePanel from './MonthlyClosePanel';
import EquipmentMaintenancePanel from './EquipmentMaintenancePanel';
import ProjectManagementPanel from './ProjectManagementPanel';
import PublicTendersPanel from './PublicTendersPanel';
import CustomsRegimePanel from './CustomsRegimePanel';
import QualityPanel from './QualityPanel';
import IncomeStatementPanel from './IncomeStatementPanel';
import ReportsPanel from './ReportsPanel';
import DecisionSupportPanel from './DecisionSupportPanel';
import ReceivablesAgingPanel from './ReceivablesAgingPanel';
import ControllingPanel from './ControllingPanel';
import AccessPoliciesPanel from './AccessPoliciesPanel';
import MasterDataImportPanel from './MasterDataImportPanel';
import AssetsManagementPanel from './AssetsManagementPanel';
import ProfitCentersPanel from './ProfitCentersPanel';
import AnalyticalAllocationRulesPanel from './AnalyticalAllocationRulesPanel';
import MrpPlanningPanel from './MrpPlanningPanel';
import GovernanceSodPanel from './GovernanceSodPanel';
import TunisianEInvoicePanel from './TunisianEInvoicePanel';
import {
  exportToCSV,
  exportToExcel,
  exportMultiSheetExcel,
  exportToPDF,
  exportToPowerPoint,
  getImputedDate,
  ExcelSheetData,
  ExportColumn,
} from './exportUtils';
import {
  applyInterfaceLanguageToDocument,
  getHtmlLanguage,
  InterfaceLanguageProvider,
  isRightToLeft,
  translateCategory,
  translateInterfaceText,
  translateModuleLabel,
  translateRole,
  type InterfaceLanguage,
} from './localization';
import {
  readInitialInterfaceLanguage,
  saveInterfaceLanguagePreference,
} from './language-preference';
import { parseLoginResponse } from './login-response';
import { LOGIN_ACCOUNT_TYPES, type LoginAccountType } from '../shared/login-account-types';

// ==========================================
// PALETTE VISUELLE & RÈGLES DESIGN SYSTEM
// ==========================================
// Règle Graphiques : Bleu, Turquoise, Ambre, Violet, Gris
export const CHART_COLORS = {
  blue: '#2563EB',      // 1. Bleu
  turquoise: '#06B6D4', // 2. Turquoise
  amber: '#F59E0B',     // 3. Ambre
  purple: '#8B5CF6',    // 4. Violet
  gray: '#6B7280',      // 5. Gris
};

export const CHART_PALETTE = ['#2563EB', '#06B6D4', '#F59E0B', '#8B5CF6', '#6B7280'];

// Helper Badge de Statut : Associe TOUJOURS Couleur + Icône + Libellé
export function renderStatusBadge(status: string) {
  const s = (status || '').toLowerCase();
  
  // Payée / Validé / Conforme / Actif / En stock
  if (s.includes('pay') || s.includes('valid') || s.includes('conforme') || s.includes('actif') || s.includes('en stock')) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: '#DCFCE7',
          color: '#15803D',
          border: '1px solid #86EFAC',
          padding: '3px 8px',
          borderRadius: '20px',
          fontSize: '0.72rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <span>✓</span>
        <span>{status}</span>
      </span>
    );
  }

  // En attente / Réappro / Partiel
  if (s.includes('attente') || s.includes('réappro') || s.includes('partiel') || s.includes('en cours')) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: '#FEF3C7',
          color: '#B45309',
          border: '1px solid #FCD34D',
          padding: '3px 8px',
          borderRadius: '20px',
          fontSize: '0.72rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <span>⏳</span>
        <span>{status}</span>
      </span>
    );
  }

  // En retard / Échue / Rupture / Alerte / Dépassement
  if (s.includes('retard') || s.includes('échu') || s.includes('rupture') || s.includes('alerte') || s.includes('dépass')) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: '#FEE2E2',
          color: '#B91C1C',
          border: '1px solid #FCA5A5',
          padding: '3px 8px',
          borderRadius: '20px',
          fontSize: '0.72rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <span>⚠️</span>
        <span>{status}</span>
      </span>
    );
  }

  // Brouillon / Inactif / Autre (Gris neutre)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: '#F1F5F9',
        color: '#475569',
        border: '1px solid #CBD5E1',
        padding: '3px 8px',
        borderRadius: '20px',
        fontSize: '0.72rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span>📝</span>
      <span>{status || 'Brouillon'}</span>
    </span>
  );
}

// ==========================================
// TYPES & RBAC
// ==========================================
export type Language = InterfaceLanguage;
export type Currency = 'TND' | 'EUR' | 'USD';
export type CompanySector = 'MULTINATIONAL' | 'SME' | 'ARTISAN' | 'AGRICULTURAL';
export type UserRole = 'ADMIN' | 'FINANCIAL_MANAGER' | 'ACCOUNTANT' | 'HR_MANAGER' | 'SALES_OFFICER' | 'LOGISTICS_MGR';

interface GlobalAdminConsolidationGroup {
  id: string;
  name: string;
  reportingCurrencyCode: string;
  ownerEntityId: string;
  ownerEntityName: string;
  ownerEntityCode: string;
}

interface GlobalAdminEntity {
  id: string;
  name: string;
  code: string;
  consolidationGroups: Array<{
    id: string;
    name: string;
    reportingCurrencyCode: string;
  }>;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseGlobalAdminEntities(value: unknown): GlobalAdminEntity[] {
  if (!isJsonRecord(value) || !Array.isArray(value.entities)) {
    throw new Error('La liste des sociétés est invalide.');
  }
  return value.entities.map((entity): GlobalAdminEntity => {
    if (!isJsonRecord(entity) || typeof entity.id !== 'string'
      || typeof entity.name !== 'string' || typeof entity.code !== 'string') {
      throw new Error('La liste des sociétés contient une entrée invalide.');
    }
    const rawConsolidationGroups = entity.consolidationGroups === undefined
      ? []
      : entity.consolidationGroups;
    if (!Array.isArray(rawConsolidationGroups)) {
      throw new Error('La liste des groupes consolidés contient une entrée invalide.');
    }
    return {
      id: entity.id,
      name: entity.name,
      code: entity.code,
      consolidationGroups: rawConsolidationGroups.map((group) => {
        if (!isJsonRecord(group) || typeof group.id !== 'string'
          || typeof group.name !== 'string' || typeof group.reportingCurrencyCode !== 'string') {
          throw new Error('La liste des groupes consolidés contient une entrée invalide.');
        }
        return {
          id: group.id,
          name: group.name,
          reportingCurrencyCode: group.reportingCurrencyCode,
        };
      }),
    };
  });
}

function getApiErrorMessage(value: unknown, fallback: string): string {
  return isJsonRecord(value) && typeof value.error === 'string' ? value.error : fallback;
}

export type NavModule =
  | 'dashboard'
  | 'budget'
  | 'cashflow'
  | 'fxRevaluation'
  | 'financialStatements'
  | 'consolidation'
  | 'intercompany'
  | 'monthlyClose'
  | 'controlling'
  | 'generalBalance'
  | 'generalLedger'
  | 'accountingEntry'
  | 'bankReconciliation'
  | 'agedReceivables'
  | 'agedPayables'
  | 'taxation'
  | 'anomalies'
  | 'payrollEngine'
  | 'hrDeep'
  | 'hrWorkflows'
  | 'hrTraining'
  | 'purchases'
  | 'stocks'
  | 'sales'
  | 'tunisianEInvoices'
  | 'turnover'
  | 'incomeStatement'
  | 'logistics'
  | 'activities'
  | 'maintenance'
  | 'projects'
  | 'tenders'
  | 'customsRegimes'
  | 'quality'
  | 'generalServices'
  | 'securityAccess'
  | 'generalSettings'
  | 'parameters'
  | 'workbookControls'
  | 'decisionSupport'
  | 'reportsExport'
  | 'assetsManagement'
  | 'profitCenters'
  | 'mrpPlanning'
  | 'governanceSod';

export interface SubsidiaryEntity {
  id: string;
  code: string;
  name: string;
  currency: Currency;
  sector: CompanySector;
  country: string;
  city: string;
  taxId: string;
  shareholding: number;
  manager: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  grade: string;
  assignedEntityId: string;
}

interface LoginEntityOption {
  id: string;
  name: string;
  code: string;
}

// Interfaces Métier Détaillées
export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  supplierCode: string;
  accountNumber: string; // Ex: 401100 s'associe automatiquement
  supplierName: string;
  dueDate: string;
  amountHT: number;
  vatRate: number;
  vatAmount: number;
  amountTTC: number;
  status: 'Payée' | 'En attente' | 'En retard' | 'Brouillon';
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  clientCode: string;
  accountNumber: string; // Ex: 411100 s'associe automatiquement
  clientName: string;
  dueDate: string;
  amountHT: number;
  vatRate: number;
  vatAmount: number;
  amountTTC: number;
  status: 'Payée' | 'En attente' | 'En retard' | 'Brouillon';
}

export interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  contractType: 'CDI' | 'CDD' | 'CIVP' | 'Contrat Karama';
  entryDate: string;
  seniority: string;
  salary: number;
  paidLeaveBalance: number;
  rttBalance: number;
  gpecScore: string;
  status: 'Actif' | 'En congé' | 'En période d’essai';
}

export interface BudgetLine {
  id: string;
  code: string;
  name: string;
  type: 'OPEX' | 'CAPEX';
  category: string;
  initialBudget: number;
  revisedBudget: number;
  actual: number;
  variance: number;
  variancePct: number;
  status: 'Conforme' | 'En attente' | 'Dépassement';
}

export interface GeneralLedgerOperation {
  id: string;
  date: string;
  journal: string;
  pieceNum: string;
  accountNum: string;
  accountName: string;
  label: string;
  debit: number;
  credit: number;
  runningBalance: number;
  lettrage: string;
  status: 'Lettré' | 'Non lettré';
}

export interface AccountingVoucherLine {
  id: string;
  account: string;
  accountName: string;
  label: string;
  debit: number;
  credit: number;
}

export interface AccountingVoucherHeader {
  voucherNumber: string;
  date: string;
  journal: string;
  reference: string;
  generalLabel: string;
  entityCode: string;
}

// Entités du Groupe
export const SUBSIDIARIES: SubsidiaryEntity[] = [
  { id: 'GRP00', code: 'SAFE-GRP', name: 'SAFE Holding Consolidé', currency: 'TND', sector: 'MULTINATIONAL', country: 'Tunisie', city: 'Tunis Lac II', taxId: '0001234/A/P/M/000', shareholding: 100, manager: 'Sami Mansour' },
  { id: 'TN01', code: 'SAFE-TN01', name: 'SAFE Tunisie Industrie Plastique', currency: 'TND', sector: 'SME', country: 'Tunisie', city: 'Ben Arous', taxId: '0459871/B/A/M/000', shareholding: 100, manager: 'Karim Jaziri' },
  { id: 'FR01', code: 'SAFE-FR01', name: 'SAFE France Distribution Europe', currency: 'EUR', sector: 'SME', country: 'France', city: 'Lyon Part-Dieu', taxId: 'FR-889012456', shareholding: 85, manager: 'Jean-Luc Moreau' },
  { id: 'AG01', code: 'SAFE-AG01', name: 'SAFE Agro Sfax Export', currency: 'TND', sector: 'AGRICULTURAL', country: 'Tunisie', city: 'Sfax Route Gabès', taxId: '0894561/C/N/M/000', shareholding: 90, manager: 'Mounir Triki' },
  { id: 'AR01', code: 'SAFE-AR01', name: 'SAFE Métallurgie & Ateliers Ariana', currency: 'TND', sector: 'ARTISAN', country: 'Tunisie', city: 'Ariana Charguia II', taxId: '0712399/D/A/P/000', shareholding: 75, manager: 'Hédi Bouazizi' },
];

export const SYSTEM_USERS: UserProfile[] = [
  { id: 'USR-01', name: 'Sami Mansour', email: 's.mansour@safe-holding.com', role: 'ADMIN', title: 'Président Directeur Général (CEO)', grade: 'Direction Générale Hors Classe', assignedEntityId: 'GRP00' },
  { id: 'USR-02', name: 'Nadia Khemir', email: 'n.khemir@safe-holding.com', role: 'FINANCIAL_MANAGER', title: 'Directeur Financier Groupe (CFO)', grade: 'Cadre Dirigeant Principal', assignedEntityId: 'GRP00' },
  { id: 'USR-03', name: 'Yosra Chaabane', email: 'y.chaabane@safe-tn.com', role: 'HR_MANAGER', title: 'Directrice des Ressources Humaines (DRH)', grade: 'Cadre Supérieur', assignedEntityId: 'TN01' },
  { id: 'USR-04', name: 'Mohamed Ali Triki', email: 'ma.triki@safe-tn.com', role: 'SALES_OFFICER', title: 'Directeur Commercial & Export', grade: 'Cadre Commercial Senior', assignedEntityId: 'TN01' },
  { id: 'USR-05', name: 'Slim Ben Amor', email: 's.benamor@safe-tn.com', role: 'LOGISTICS_MGR', title: 'Responsable Supply Chain & Entrepôts', grade: 'Cadre Logistique Opérationnel', assignedEntityId: 'TN01' },
  { id: 'USR-06', name: 'Amira Gharbi', email: 'a.gharbi@safe-tn.com', role: 'SALES_OFFICER', title: 'Chargée de comptes clients', grade: 'Accès ventes et recouvrement', assignedEntityId: 'TN01' },
  { id: 'USR-07', name: 'Walid Ben Salem', email: 'w.bensalem@safe-tn.com', role: 'ACCOUNTANT', title: 'Chargé de comptes fournisseurs', grade: 'Accès comptabilité et achats', assignedEntityId: 'TN01' },
];

// Configuration des 27 Modules du Système
// Remarque : "approfondie" retiré du module RH, libellé exact : "Ressources Humaines & Talents"
export const ALL_MODULES_CONFIG: Array<{ id: NavModule; label: string; icon: string; category: string }> = [
  // PILOTAGE & FINANCES
  { id: 'dashboard', label: 'Tableaux de bord', icon: '/icons/dashboard.png', category: 'PILOTAGE' },
  { id: 'budget', label: 'Budget & Forecast', icon: '🎯', category: 'PILOTAGE' },
  { id: 'cashflow', label: 'Cash-Flow & Trésorerie', icon: '/icons/cashflow.png', category: 'PILOTAGE' },
  { id: 'decisionSupport', label: 'Aide à la Décision', icon: '🧭', category: 'PILOTAGE' },
  { id: 'profitCenters', label: 'Centres de Profit (Contrôle analytique SAFE)', icon: '📈', category: 'PILOTAGE' },
  { id: 'fxRevaluation', label: 'Réévaluation des devises', icon: '💱', category: 'PILOTAGE' },
  { id: 'financialStatements', label: 'Mouvements comptables', icon: '📑', category: 'PILOTAGE' },
  { id: 'consolidation', label: 'Consolidation Groupe', icon: '🌐', category: 'PILOTAGE' },
  { id: 'intercompany', label: 'Transactions intercompagnies', icon: '🔁', category: 'PILOTAGE' },
  { id: 'monthlyClose', label: 'Clôture mensuelle', icon: '🗓️', category: 'PILOTAGE' },
  { id: 'controlling', label: 'Contrôle de gestion', icon: '/icons/dashboard.png', category: 'PILOTAGE' },

  // COMPTABILITÉ & ÉCRITURES
  { id: 'generalBalance', label: 'Balance Générale des Comptes', icon: '/icons/comptabilite.png', category: 'COMPTABILITÉ' },
  { id: 'generalLedger', label: 'Grand Livre Général (GL)', icon: '📖', category: 'COMPTABILITÉ' },
  { id: 'assetsManagement', label: 'Immobilisations (Immobilisations SAFE)', icon: '/icons/immobilisations.png', category: 'COMPTABILITÉ' },
  { id: 'accountingEntry', label: 'Saisie Comptable Horizontale', icon: '✍️', category: 'COMPTABILITÉ' },
  { id: 'agedReceivables', label: 'Balance Âgée Clients', icon: '👥', category: 'COMPTABILITÉ' },
  { id: 'agedPayables', label: 'Balance Âgée Fournisseurs', icon: '/icons/stocks.png', category: 'COMPTABILITÉ' },
  { id: 'taxation', label: 'Déclarations Fiscales (G50)', icon: '/icons/comptabilite.png', category: 'COMPTABILITÉ' },
  { id: 'anomalies', label: 'Anomalies financières', icon: '🔎', category: 'COMPTABILITÉ' },

  // CAPITAL HUMAIN
  { id: 'payrollEngine', label: 'Gestion de la Paie & Salaires', icon: '/icons/paie.png', category: 'CAPITAL HUMAIN' },
  { id: 'hrDeep', label: 'Ressources Humaines & Talents', icon: '/icons/rh.png', category: 'CAPITAL HUMAIN' },
  { id: 'hrWorkflows', label: 'Documents, recrutement & frais', icon: '📁', category: 'CAPITAL HUMAIN' },

  // OPÉRATIONS & SUPPLY CHAIN
  { id: 'purchases', label: 'Achats & Fournisseurs', icon: '🛒', category: 'OPÉRATIONS' },
  { id: 'stocks', label: 'Stocks & Entrepôts (MM)', icon: '/icons/stocks.png', category: 'OPÉRATIONS' },
  { id: 'mrpPlanning', label: 'Planification Besoins MRP (Planification SAFE)', icon: '/icons/production.png', category: 'OPÉRATIONS' },
  { id: 'sales', label: 'Ventes & Facturation', icon: '/icons/facturation.png', category: 'OPÉRATIONS' },
  { id: 'tunisianEInvoices', label: 'E-Factures TTN (El Fatoora)', icon: '🇹🇳', category: 'OPÉRATIONS' },
  { id: 'incomeStatement', label: 'Compte de Résultat (P&L)', icon: '📉', category: 'OPÉRATIONS' },
  { id: 'activities', label: 'Activités Opérationnelles & Métiers', icon: '/icons/industrie.png', category: 'OPÉRATIONS' },
  { id: 'maintenance', label: 'Maintenance des équipements', icon: '🛠️', category: 'OPÉRATIONS' },
  { id: 'projects', label: 'Projets & chantiers', icon: '📋', category: 'OPÉRATIONS' },
  { id: 'tenders', label: 'Marchés publics', icon: '📑', category: 'OPÉRATIONS' },
  { id: 'customsRegimes', label: 'Régimes douaniers AT / ACT', icon: '/icons/stocks.png', category: 'OPÉRATIONS' },
  { id: 'quality', label: 'Qualité & actions CAPA', icon: '✅', category: 'OPÉRATIONS' },

  // PARAMÈTRES & GOUVERNANCE
  { id: 'governanceSod', label: 'Gouvernance & SoD (Gouvernance SAFE)', icon: '🛡️', category: 'PARAMÈTRES' },
  { id: 'securityAccess', label: 'Sécurité & Droits d’Accès (RBAC)', icon: '🛡️', category: 'PARAMÈTRES' },
  { id: 'parameters', label: 'Paramètres Fiscaux & Barèmes IRPP', icon: '/icons/comptabilite.png', category: 'PARAMÈTRES' },
  { id: 'workbookControls', label: 'Préparation du classeur', icon: '🧩', category: 'PARAMÈTRES' },
  { id: 'reportsExport', label: 'Rapports & Plaquettes Financières', icon: '📂', category: 'PARAMÈTRES' },
];

export type SafeStandaloneAppId =
  | 'ALL'
  | 'INVOICING'
  | 'STOCKS'
  | 'PAYROLL'
  | 'HR'
  | 'ACCOUNTING'
  | 'PRODUCTION'
  | 'IMMOBILISATIONS';

export interface StandaloneAppConfig {
  id: SafeStandaloneAppId;
  name: string;
  shortName: string;
  tagline: string;
  icon: string;
  badge: string;
  accentColor: string;
  modules: NavModule[];
  defaultModule: NavModule;
  reportModuleLabel: string;
  reportModuleCategory: string;
  reportModuleIcon: string;
}

export const STANDALONE_APPS: Record<SafeStandaloneAppId, StandaloneAppConfig> = {
  ALL: {
    id: 'ALL',
    name: 'SAFE ERP Global (Suite Complète)',
    shortName: 'ERP Complet',
    tagline: 'Suite intégrée de gestion d’entreprise multi-entités et multi-pays (Tous les 28 modules)',
    icon: '🌐',
    badge: 'Enterprise Suite 360°',
    accentColor: '#1D4ED8',
    modules: ALL_MODULES_CONFIG.map((m) => m.id),
    defaultModule: 'dashboard',
    reportModuleLabel: 'Rapports & Plaquettes Financières',
    reportModuleCategory: 'PARAMÈTRES',
    reportModuleIcon: '📂',
  },
  INVOICING: {
    id: 'INVOICING',
    name: 'SAFE Facturation (Achat & Vente)',
    shortName: 'SAFE Facturation',
    tagline: 'Facturation achats/ventes, conformité TTN El Fatoora, retenues à la source RS, créances & dettes',
    icon: '/icons/facturation.png',
    badge: 'TTN & TVA Tunisienne',
    accentColor: '#E11D48',
    modules: ['sales', 'purchases', 'tunisianEInvoices', 'agedReceivables', 'agedPayables', 'taxation', 'reportsExport'],
    defaultModule: 'sales',
    reportModuleLabel: 'Rapports des Ventes & Facturation',
    reportModuleCategory: 'FACTURATION & VENTES',
    reportModuleIcon: '/icons/facturation.png',
  },
  STOCKS: {
    id: 'STOCKS',
    name: 'SAFE Gestion des Stocks & Dépôts',
    shortName: 'SAFE Stocks',
    tagline: 'Entrepôts multi-dépôts, mouvements, inventaires, valorisation PUMP, régimes douaniers AT/ACT',
    icon: '/icons/stocks.png',
    badge: 'PUMP & Douane AT/ACT',
    accentColor: '#0D9488',
    modules: ['stocks', 'mrpPlanning', 'customsRegimes', 'purchases', 'reportsExport'],
    defaultModule: 'stocks',
    reportModuleLabel: 'Rapports des Stocks & Mouvements',
    reportModuleCategory: 'STOCKS & MAGASINS',
    reportModuleIcon: '/icons/stocks.png',
  },
  PAYROLL: {
    id: 'PAYROLL',
    name: 'SAFE Paie (Paie Tunisienne & Salaires)',
    shortName: 'SAFE Paie',
    tagline: 'Moteur de paie tunisien, barème IRPP 8 tranches, CNSS 9.68%, FOPROLOS, CSS 0.5% & fiches de paie',
    icon: '/icons/paie.png',
    badge: 'IRPP & CNSS 2026',
    accentColor: '#16A34A',
    modules: ['payrollEngine', 'hrDeep', 'hrWorkflows', 'reportsExport'],
    defaultModule: 'payrollEngine',
    reportModuleLabel: 'Rapports & Déclarations de Paie',
    reportModuleCategory: 'PAIE & SALAIRES',
    reportModuleIcon: '/icons/paie.png',
  },
  HR: {
    id: 'HR',
    name: 'SAFE Gestion RH (Capital Humain & Contrats)',
    shortName: 'SAFE RH',
    tagline: 'Dossiers collaborateurs, contrats CDI/CDD/CIVP, suivi congés légaux, médecine du travail & GPEC',
    icon: '/icons/rh.png',
    badge: 'Code du Travail Tunisien',
    accentColor: '#6366F1',
    modules: ['hrDeep', 'hrWorkflows', 'hrTraining', 'quality', 'reportsExport'],
    defaultModule: 'hrDeep',
    reportModuleLabel: 'Rapports RH & Bilan Social',
    reportModuleCategory: 'RESSOURCES HUMAINES',
    reportModuleIcon: '/icons/rh.png',
  },
  ACCOUNTING: {
    id: 'ACCOUNTING',
    name: 'SAFE Comptabilité & Fiscalité',
    shortName: 'SAFE Comptabilité',
    tagline: 'Système Comptable des Entreprises (SCE), Grand Livre, Balance 8 colonnes, Déclarations G50, Rapprochement bancaire',
    icon: '/icons/comptabilite.png',
    badge: 'SCE & Liasse Fiscale G50',
    accentColor: '#1E3A8A',
    modules: [
      'generalBalance',
      'generalLedger',
      'accountingEntry',
      'taxation',
      'financialStatements',
      'bankReconciliation',
      'cashflow',
      'monthlyClose',
      'controlling',
      'anomalies',
      'incomeStatement',
      'reportsExport',
    ],
    defaultModule: 'generalBalance',
    reportModuleLabel: 'Rapports Comptables & Liasse Fiscale',
    reportModuleCategory: 'COMPTABILITÉ & FISCALITÉ',
    reportModuleIcon: '/icons/comptabilite.png',
  },
  PRODUCTION: {
    id: 'PRODUCTION',
    name: 'SAFE Production & GPAO',
    shortName: 'SAFE Production',
    tagline: 'Nomenclatures BOM, Ordres de Fabrication (OF), Planification MRP & Maintenance des équipements',
    icon: '/icons/production.png',
    badge: 'Industrie & Fabrication',
    accentColor: '#D97706',
    modules: ['activities', 'mrpPlanning', 'stocks', 'maintenance', 'quality', 'reportsExport'],
    defaultModule: 'activities',
    reportModuleLabel: 'Rapports de Production & GPAO',
    reportModuleCategory: 'PRODUCTION & GPAO',
    reportModuleIcon: '/icons/production.png',
  },
  IMMOBILISATIONS: {
    id: 'IMMOBILISATIONS',
    name: 'SAFE Immobilisations & Amortissements',
    shortName: 'SAFE Immobilisations',
    tagline: 'Gestion des actifs corporels & incorporels, tableaux d’amortissements linéaires/dégressifs (DGI Tunisie)',
    icon: '/icons/immobilisations.png',
    badge: 'Norme SCE & Fiscalité DGI',
    accentColor: '#0284C7',
    modules: ['assetsManagement', 'accountingEntry', 'generalBalance', 'controlling', 'reportsExport'],
    defaultModule: 'assetsManagement',
    reportModuleLabel: 'Rapports des Actifs & Amortissements',
    reportModuleCategory: 'IMMOBILISATIONS',
    reportModuleIcon: '/icons/immobilisations.png',
  },
};

function parseNavigationState(hash: string): { module: NavModule | null; app: SafeStandaloneAppId | null } {
  const appMatch = /^#\/app\/([a-z0-9_-]+)$/i.exec(hash);
  if (appMatch) {
    const key = appMatch[1].toLowerCase();
    let appId: SafeStandaloneAppId = 'ALL';
    if (key === 'facturation' || key === 'invoicing' || key === 'facture') appId = 'INVOICING';
    else if (key === 'stocks' || key === 'stock' || key === 'magasins') appId = 'STOCKS';
    else if (key === 'paie' || key === 'payroll' || key === 'salaire') appId = 'PAYROLL';
    else if (key === 'rh' || key === 'hr' || key === 'grh') appId = 'HR';
    else if (key === 'comptabilite' || key === 'compta' || key === 'accounting') appId = 'ACCOUNTING';
    else if (key === 'production' || key === 'gpao' || key === 'industrie') appId = 'PRODUCTION';
    else if (key === 'immobilisations' || key === 'immo' || key === 'assets') appId = 'IMMOBILISATIONS';
    return { module: STANDALONE_APPS[appId].defaultModule, app: appId };
  }

  const moduleMatch = /^#\/modules\/([A-Za-z0-9_-]+)$/.exec(hash);
  if (moduleMatch) {
    const found = ALL_MODULES_CONFIG.find((module) => module.id === moduleMatch[1])?.id ?? null;
    return { module: found, app: null };
  }

  return { module: null, app: null };
}

function moduleFromHash(hash: string): NavModule | null {
  return parseNavigationState(hash).module;
}

function appFromHash(hash: string): SafeStandaloneAppId {
  return parseNavigationState(hash).app ?? 'ALL';
}

export const INITIAL_ROLE_PERMISSIONS: Record<UserRole, NavModule[]> = {
  ADMIN: ALL_MODULES_CONFIG.map((m) => m.id),
  FINANCIAL_MANAGER: ALL_MODULES_CONFIG.map((m) => m.id)
    .filter((id) => ![
      'activities',
      'maintenance',
      'securityAccess',
      'workbookControls',
      'consolidation',
      'payrollEngine',
      'hrDeep',
      'hrWorkflows',
      'quality',
      'parameters',
    ].includes(id)),
  ACCOUNTANT: [
    'dashboard',
    'decisionSupport',
    'financialStatements',
    'intercompany',
    'monthlyClose',
    'generalBalance',
    'generalLedger',
    'assetsManagement',
    'accountingEntry',
    'stocks',
    'purchases',
    'sales',
    'tunisianEInvoices',
    'taxation',
    'anomalies',
    'incomeStatement',
    'reportsExport',
  ],
  HR_MANAGER: ['dashboard', 'decisionSupport', 'payrollEngine', 'hrDeep', 'hrWorkflows', 'quality', 'reportsExport'],
  SALES_OFFICER: ['dashboard', 'decisionSupport', 'sales', 'tunisianEInvoices', 'agedReceivables', 'reportsExport'],
  LOGISTICS_MGR: ['dashboard', 'decisionSupport', 'stocks', 'mrpPlanning', 'activities', 'maintenance', 'customsRegimes', 'quality', 'reportsExport'],
};

// Profils Financiers par Filiale
export const FINANCIAL_PROFILES: Record<string, { turnover: number; ebitda: number; ebit: number; netResult: number; cash: number; bfr: number; frng: number; debt: number; equity: number; headcount: number }> = {
  GRP00: { turnover: 28450000, ebitda: 5690000, ebit: 4210000, netResult: 3120000, cash: 4890000, bfr: 3210000, frng: 5120000, debt: 4500000, equity: 18500000, headcount: 342 },
  TN01: { turnover: 15600000, ebitda: 3120000, ebit: 2340000, netResult: 1780000, cash: 2650000, bfr: 1840000, frng: 2950000, debt: 2400000, equity: 9800000, headcount: 186 },
  FR01: { turnover: 7950000, ebitda: 1590000, ebit: 1180000, netResult: 840000, cash: 1420000, bfr: 890000, frng: 1450000, debt: 1200000, equity: 5100000, headcount: 64 },
  AG01: { turnover: 3150000, ebitda: 630000, ebit: 440000, netResult: 320000, cash: 520000, bfr: 310000, frng: 480000, debt: 550000, equity: 2200000, headcount: 58 },
  AR01: { turnover: 1750000, ebitda: 350000, ebit: 250000, netResult: 180000, cash: 300000, bfr: 170000, frng: 240000, debt: 350000, equity: 1400000, headcount: 34 },
};

// Balance Générale 8 Colonnes
function generateDemoBalanceData(entityId: string, cur: string) {
  const mult = entityId === 'GRP00' ? 1.0 : entityId === 'TN01' ? 0.55 : entityId === 'FR01' ? 0.28 : entityId === 'AG01' ? 0.11 : 0.06;
  return [
    { account: '101000', label: 'Capital Social Souscrit et Appelé', openDeb: 0, openCred: Math.round(10000000 * mult), mvtDeb: 0, mvtCred: 0, closeDeb: 0, closeCred: Math.round(10000000 * mult) },
    { account: '111000', label: 'Réserves Légales & Statutaires', openDeb: 0, openCred: Math.round(1800000 * mult), mvtDeb: 0, mvtCred: Math.round(250000 * mult), closeDeb: 0, closeCred: Math.round(2050000 * mult) },
    { account: '164000', label: 'Emprunts Bancaires à Moyen/Long Terme', openDeb: 0, openCred: Math.round(4800000 * mult), mvtDeb: Math.round(600000 * mult), mvtCred: 0, closeDeb: 0, closeCred: Math.round(4200000 * mult) },
    { account: '215000', label: 'Installations Techniques & Outillage Industriel', openDeb: Math.round(7200000 * mult), openCred: 0, mvtDeb: Math.round(450000 * mult), mvtCred: 0, closeDeb: Math.round(7650000 * mult), closeCred: 0 },
    { account: '281500', label: 'Amortissements des Installations Techniques', openDeb: 0, openCred: Math.round(2400000 * mult), mvtDeb: 0, mvtCred: Math.round(420000 * mult), closeDeb: 0, closeCred: Math.round(2820000 * mult) },
    { account: '311000', label: 'Stocks de Matières Premières & Fournitures', openDeb: Math.round(2850000 * mult), openCred: 0, mvtDeb: Math.round(5120000 * mult), mvtCred: Math.round(4750000 * mult), closeDeb: Math.round(3220000 * mult), closeCred: 0 },
    { account: '401100', label: 'Fournisseurs d’Exploitation (Achats)', openDeb: 0, openCred: Math.round(3100000 * mult), mvtDeb: Math.round(4950000 * mult), mvtCred: Math.round(5200000 * mult), closeDeb: 0, closeCred: Math.round(3350000 * mult) },
    { account: '411100', label: 'Clients – Factures à Recouvrer', openDeb: Math.round(4200000 * mult), openCred: 0, mvtDeb: Math.round(8600000 * mult), mvtCred: Math.round(8100000 * mult), closeDeb: Math.round(4700000 * mult), closeCred: 0 },
    { account: '436660', label: 'État, TVA Déductible sur Achats 19%', openDeb: Math.round(320000 * mult), openCred: 0, mvtDeb: Math.round(980000 * mult), mvtCred: Math.round(890000 * mult), closeDeb: Math.round(410000 * mult), closeCred: 0 },
    { account: '436710', label: 'État, TVA Collectée sur Ventes 19%', openDeb: 0, openCred: Math.round(450000 * mult), mvtDeb: Math.round(1120000 * mult), mvtCred: Math.round(1350000 * mult), closeDeb: 0, closeCred: Math.round(680000 * mult) },
    { account: '532000', label: 'Banques Locales & Devises (STB/BIAT/BNA)', openDeb: Math.round(3800000 * mult), openCred: 0, mvtDeb: Math.round(9200000 * mult), mvtCred: Math.round(8400000 * mult), closeDeb: Math.round(4600000 * mult), closeCred: 0 },
    { account: '601000', label: 'Achats Consommés de Matières Premières', openDeb: 0, openCred: 0, mvtDeb: Math.round(6850000 * mult), mvtCred: 0, closeDeb: Math.round(6850000 * mult), closeCred: 0 },
    { account: '641000', label: 'Rémunérations du Personnel & Salaires', openDeb: 0, openCred: 0, mvtDeb: Math.round(3420000 * mult), mvtCred: 0, closeDeb: Math.round(3420000 * mult), closeCred: 0 },
    { account: '701000', label: 'Ventes de Produits Finis & Prestations', openDeb: 0, openCred: 0, mvtDeb: 0, mvtCred: Math.round(15800000 * mult), closeDeb: 0, closeCred: Math.round(15800000 * mult) },
  ];
}

// Initial Invoices Datasets
// Fixture de démonstration conservée, non utilisée par le module Achats connecté.
export const INITIAL_PURCHASE_INVOICES: PurchaseInvoice[] = [
  { id: 'PINV-01', invoiceNumber: 'FAC-F-8921', date: '28/10/2026', supplierCode: 'F-01', accountNumber: '401100', supplierName: 'PolyChem Tunisie SARL', dueDate: '27/11/2026', amountHT: 42150.000, vatRate: 19, vatAmount: 8008.500, amountTTC: 50158.500, status: 'Payée' },
  { id: 'PINV-02', invoiceNumber: 'FAC-F-8922', date: '25/10/2026', supplierCode: 'F-02', accountNumber: '401200', supplierName: 'SiderAciers Ariana', dueDate: '30/11/2026', amountHT: 28400.000, vatRate: 19, vatAmount: 5396.000, amountTTC: 33796.000, status: 'En attente' },
  { id: 'PINV-03', invoiceNumber: 'FAC-F-8923', date: '20/10/2026', supplierCode: 'F-03', accountNumber: '401300', supplierName: 'Cartonnages du Centre Sousse', dueDate: '15/10/2026', amountHT: 12500.000, vatRate: 19, vatAmount: 2375.000, amountTTC: 14875.000, status: 'En retard' },
  { id: 'PINV-04', invoiceNumber: 'FAC-F-8924', date: '18/10/2026', supplierCode: 'F-04', accountNumber: '401400', supplierName: 'ÉlectroMoteurs & Variateurs', dueDate: '18/11/2026', amountHT: 18900.000, vatRate: 19, vatAmount: 3591.000, amountTTC: 22491.000, status: 'Payée' },
  { id: 'PINV-05', invoiceNumber: 'FAC-F-8925', date: '15/10/2026', supplierCode: 'F-05', accountNumber: '401500', supplierName: 'HydroFluides Mécanique', dueDate: '15/12/2026', amountHT: 9600.000, vatRate: 19, vatAmount: 1824.000, amountTTC: 11424.000, status: 'Brouillon' },
  { id: 'PINV-06', invoiceNumber: 'FAC-F-8926', date: '10/10/2026', supplierCode: 'F-06', accountNumber: '401600', supplierName: 'Outillage & Moules Sfax', dueDate: '09/11/2026', amountHT: 34000.000, vatRate: 19, vatAmount: 6460.000, amountTTC: 40460.000, status: 'En attente' },
];

export const INITIAL_SALES_INVOICES: SalesInvoice[] = [
  { id: 'SINV-01', invoiceNumber: 'FAC-C-2026-081', date: '30/10/2026', clientCode: 'CLI-01', accountNumber: '411100', clientName: 'AutoParts Maghreb SA', dueDate: '30/11/2026', amountHT: 65400.000, vatRate: 19, vatAmount: 12426.000, amountTTC: 77826.000, status: 'Payée' },
  { id: 'SINV-02', invoiceNumber: 'FAC-C-2026-082', date: '27/10/2026', clientCode: 'CLI-02', accountNumber: '411200', clientName: 'Emballages Méditerranéens', dueDate: '26/11/2026', amountHT: 41200.000, vatRate: 19, vatAmount: 7828.000, amountTTC: 49028.000, status: 'En attente' },
  { id: 'SINV-03', invoiceNumber: 'FAC-C-2026-083', date: '22/10/2026', clientCode: 'CLI-03', accountNumber: '411300', clientName: 'AgroDistribution Sfaxienne', dueDate: '10/10/2026', amountHT: 32800.000, vatRate: 19, vatAmount: 6232.000, amountTTC: 39032.000, status: 'En retard' },
  { id: 'SINV-04', invoiceNumber: 'FAC-C-2026-084', date: '19/10/2026', clientCode: 'CLI-04', accountNumber: '411400', clientName: 'Laboratoires Pharmaceutiques Tunis', dueDate: '19/11/2026', amountHT: 88500.000, vatRate: 19, vatAmount: 16815.000, amountTTC: 105315.000, status: 'Payée' },
  { id: 'SINV-05', invoiceNumber: 'FAC-C-2026-085', date: '14/10/2026', clientCode: 'CLI-05', accountNumber: '411500', clientName: 'Société Bâtiment & Travaux Sahel', dueDate: '14/12/2026', amountHT: 19400.000, vatRate: 19, vatAmount: 3686.000, amountTTC: 23086.000, status: 'Brouillon' },
  { id: 'SINV-06', invoiceNumber: 'FAC-C-2026-086', date: '08/10/2026', clientCode: 'CLI-06', accountNumber: '411600', clientName: 'EuroDistribution SAS France', dueDate: '08/11/2026', amountHT: 112000.000, vatRate: 19, vatAmount: 21280.000, amountTTC: 133280.000, status: 'En attente' },
];

export const INITIAL_EMPLOYEES: Employee[] = [
  { id: 'EMP-01', name: 'Sami Mansour', position: 'Directeur Général', department: 'Direction Générale', contractType: 'CDI', entryDate: '15/01/2018', seniority: '8 ans', salary: 6500.000, paidLeaveBalance: 24, rttBalance: 6, gpecScore: 'Expert A+', status: 'Actif' },
  { id: 'EMP-02', name: 'Yosra Chaabane', position: 'Directrice des Ressources Humaines', department: 'RH', contractType: 'CDI', entryDate: '01/06/2019', seniority: '7 ans', salary: 4200.000, paidLeaveBalance: 18, rttBalance: 4, gpecScore: 'Expert A', status: 'Actif' },
  { id: 'EMP-03', name: 'Mohamed Ali Triki', position: 'Directeur Commercial', department: 'Ventes', contractType: 'CDI', entryDate: '10/03/2020', seniority: '6 ans', salary: 4692.557, paidLeaveBalance: 14, rttBalance: 5, gpecScore: 'Confirmé B+', status: 'Actif' },
  { id: 'EMP-04', name: 'Kais Ben Salem', position: 'Ingénieur Injection Plastique', department: 'Production', contractType: 'Contrat Karama', entryDate: '01/02/2024', seniority: '2 ans', salary: 2850.000, paidLeaveBalance: 12, rttBalance: 2, gpecScore: 'Confirmé B', status: 'Actif' },
  { id: 'EMP-05', name: 'Amel Ben Salah', position: 'Comptable Trésorerie', department: 'Finance', contractType: 'CDI', entryDate: '15/09/2021', seniority: '5 ans', salary: 2450.000, paidLeaveBalance: 16, rttBalance: 3, gpecScore: 'Confirmé B', status: 'Actif' },
  { id: 'EMP-06', name: 'Walid Guesmi', position: 'Technicien Régleur Moules', department: 'Maintenance', contractType: 'CDD', entryDate: '01/03/2025', seniority: '1 an', salary: 1750.000, paidLeaveBalance: 9, rttBalance: 1, gpecScore: 'Opérationnel C+', status: 'En période d’essai' },
  { id: 'EMP-07', name: 'Ines Bouzid', position: 'Chargée de Recrutement & GPEC', department: 'RH', contractType: 'CIVP', entryDate: '01/10/2025', seniority: '1 an', salary: 1200.000, paidLeaveBalance: 6, rttBalance: 0, gpecScore: 'Junior C', status: 'Actif' },
  { id: 'EMP-08', name: 'Tarek Jouini', position: 'Magasinier Cariste', department: 'Logistique', contractType: 'CDI', entryDate: '15/04/2022', seniority: '4 ans', salary: 1450.000, paidLeaveBalance: 20, rttBalance: 2, gpecScore: 'Opérationnel C+', status: 'En congé' },
];

export const INITIAL_BUDGET_LINES: BudgetLine[] = [
  { id: 'BUD-01', code: '601-EXP', name: 'Achats Matières Premières Plastique', type: 'OPEX', category: 'Approvisionnements', initialBudget: 4800000, revisedBudget: 5100000, actual: 4950000, variance: 150000, variancePct: 2.9, status: 'Conforme' },
  { id: 'BUD-02', code: '606-NRG', name: 'Électricité Haute Tension & Gaz Industriel', type: 'OPEX', category: 'Énergies & Utilités', initialBudget: 620000, revisedBudget: 650000, actual: 710000, variance: -60000, variancePct: -9.2, status: 'Dépassement' },
  { id: 'BUD-03', code: '641-SAL', name: 'Masse Salariale Brute et Primes', type: 'OPEX', category: 'Personnel', initialBudget: 3200000, revisedBudget: 3300000, actual: 3280000, variance: 20000, variancePct: 0.6, status: 'Conforme' },
  { id: 'BUD-04', code: '613-LOC', name: 'Loyers Hangars et Matériels Roulants', type: 'OPEX', category: 'Loyers & Charges', initialBudget: 380000, revisedBudget: 380000, actual: 375000, variance: 5000, variancePct: 1.3, status: 'Conforme' },
  { id: 'BUD-05', code: '622-HON', name: 'Honoraires Audit, Juridique et Conseil', type: 'OPEX', category: 'Prestations Externes', initialBudget: 140000, revisedBudget: 160000, actual: 155000, variance: 5000, variancePct: 3.1, status: 'Conforme' },
  { id: 'BUD-06', code: '215-MAC', name: 'Ligne Injection Plastique Engel 350T', type: 'CAPEX', category: 'Immobilisations Industrielles', initialBudget: 850000, revisedBudget: 890000, actual: 885000, variance: 5000, variancePct: 0.6, status: 'Conforme' },
  { id: 'BUD-07', code: '218-IT', name: 'Serveurs & Infrastructure Sécurité Réseau', type: 'CAPEX', category: 'Informatique & SI', initialBudget: 95000, revisedBudget: 95000, actual: 110000, variance: -15000, variancePct: -15.8, status: 'Dépassement' },
  { id: 'BUD-08', code: '625-DEV', name: 'Foires Internationales et Prospection Export', type: 'OPEX', category: 'Marketing & Ventes', initialBudget: 180000, revisedBudget: 210000, actual: 195000, variance: 15000, variancePct: 7.1, status: 'Conforme' },
];

export const INITIAL_GL_OPERATIONS: GeneralLedgerOperation[] = [
  { id: 'GL-01', date: '31/10/2026', journal: 'Achats', pieceNum: 'FAC-F-8921', accountNum: '601000', accountName: 'Achats Matières Premières Plastique', label: 'PolyChem Tunisie Polypropylène', debit: 42150.000, credit: 0, runningBalance: 6850000.000, lettrage: 'A1', status: 'Lettré' },
  { id: 'GL-02', date: '31/10/2026', journal: 'Achats', pieceNum: 'FAC-F-8921', accountNum: '436660', accountName: 'État, TVA Déductible 19%', label: 'TVA s/ Achats PolyChem', debit: 8008.500, credit: 0, runningBalance: 410000.000, lettrage: 'A1', status: 'Lettré' },
  { id: 'GL-03', date: '31/10/2026', journal: 'Achats', pieceNum: 'FAC-F-8921', accountNum: '401100', accountName: 'Fournisseurs d’Exploitation', label: 'PolyChem Facture TTC', debit: 0, credit: 50158.500, runningBalance: -3350000.000, lettrage: 'A1', status: 'Lettré' },
  { id: 'GL-04', date: '30/10/2026', journal: 'Ventes', pieceNum: 'FAC-C-081', accountNum: '411100', accountName: 'Clients Factures à Recouvrer', label: 'AutoParts Maghreb SA TTC', debit: 77826.000, credit: 0, runningBalance: 4700000.000, lettrage: 'V1', status: 'Lettré' },
  { id: 'GL-05', date: '30/10/2026', journal: 'Ventes', pieceNum: 'FAC-C-081', accountNum: '701000', accountName: 'Ventes Produits Finis', label: 'Ventes Pièces Plastiques HT', debit: 0, credit: 65400.000, runningBalance: -15800000.000, lettrage: 'V1', status: 'Lettré' },
  { id: 'GL-06', date: '30/10/2026', journal: 'Ventes', pieceNum: 'FAC-C-081', accountNum: '436710', accountName: 'État, TVA Collectée 19%', label: 'TVA s/ Ventes AutoParts', debit: 0, credit: 12426.000, runningBalance: -680000.000, lettrage: 'V1', status: 'Lettré' },
  { id: 'GL-07', date: '29/10/2026', journal: 'Banque', pieceNum: 'VIR-STB-09', accountNum: '532000', accountName: 'STB Banque', label: 'Règlement Fournisseur PolyChem', debit: 0, credit: 50158.500, runningBalance: 4600000.000, lettrage: 'B1', status: 'Lettré' },
  { id: 'GL-08', date: '29/10/2026', journal: 'Banque', pieceNum: 'VIR-STB-09', accountNum: '401100', accountName: 'Fournisseurs d’Exploitation', label: 'PolyChem Débit Règlement', debit: 50158.500, credit: 0, runningBalance: -3299841.500, lettrage: 'B1', status: 'Lettré' },
];

const isDevelopmentBuild = process.env.NODE_ENV !== 'production';

function FinanceDemoNotice({ moduleName }: { moduleName: string }) {
  if (!isDevelopmentBuild) return null;
  return (
    <div role="note" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', color: '#92400E', padding: '10px 12px', marginBottom: '12px' }}>
      Mode développement — {moduleName} affiche des données fictives de test, non chargées depuis l’entreprise et non persistées.
    </div>
  );
}

function FinanceDataUnavailable({ title, missingData }: { title: string; missingData: string }) {
  return (
    <section aria-labelledby="finance-data-unavailable-title" role="status" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '20px', color: '#334155' }}>
      <h2 id="finance-data-unavailable-title" style={{ marginTop: 0 }}>{title}</h2>
      <p>Cette vue n’est pas encore reliée à des données métier persistées; aucune valeur fictive n’est affichée dans ce build.</p>
      <p style={{ marginBottom: 0, color: '#64748B' }}>Données requises : {missingData}</p>
    </section>
  );
}

// ==========================================
// COMPOSANT PRINCIPAL SAFE ERP V4
// ==========================================
export const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(() => readInitialInterfaceLanguage());
  const [languagePreferenceWarning, setLanguagePreferenceWarning] = useState(false);
  const isArabic = isRightToLeft(language);
  const text = (key: Parameters<typeof translateInterfaceText>[1]) => translateInterfaceText(language, key);
  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setLanguagePreferenceWarning(!saveInterfaceLanguagePreference(nextLanguage));
  };
  useEffect(() => {
    applyInterfaceLanguageToDocument(document, language);
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = getHtmlLanguage(language);
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
  }, [isArabic, language]);

  // 1. États d'authentification & profil
  const [standaloneApp, setStandaloneApp] = useState<SafeStandaloneAppId>(
    () => appFromHash(window.location.hash),
  );
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isModuleHome, setIsModuleHome] = useState(() => appFromHash(window.location.hash) === 'ALL');
  const [moduleSearchQuery, setModuleSearchQuery] = useState('');
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [apiAccessToken, setApiAccessToken] = useState<string | null>(null);
  const [apiEntityId, setApiEntityId] = useState<string | null>(null);
  const [apiUserId, setApiUserId] = useState<string | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [globalAdminEntities, setGlobalAdminEntities] = useState<GlobalAdminEntity[]>([]);
  const [loginEntities, setLoginEntities] = useState<LoginEntityOption[]>([]);
  const [loginEntityId, setLoginEntityId] = useState('');
  const [loginOptionsLoading, setLoginOptionsLoading] = useState(true);
  const [loginOptionsError, setLoginOptionsError] = useState('');
  const [loginAccountType, setLoginAccountType] = useState<LoginAccountType>('ADMIN');
  const [activeGroupContext, setActiveGroupContext] = useState<GlobalAdminConsolidationGroup | null>(null);
  const [isChangingEntityContext, setIsChangingEntityContext] = useState(false);
  const [entityContextError, setEntityContextError] = useState('');
  const [voucherSaveMessage, setVoucherSaveMessage] = useState('');
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);
  const [voucherWorkflowNote, setVoucherWorkflowNote] = useState('');
  const [journalWorkflowNotes, setJournalWorkflowNotes] = useState<Record<string, string>>({});
  const [journalWorkflowBusyId, setJournalWorkflowBusyId] = useState('');
  const [recentJournalEntries, setRecentJournalEntries] = useState<Array<{
    id: string;
    entryNumber: string;
    date: string;
    description: string;
    status: string;
    reversesEntryId: string | null;
    reversedByEntry: { id: string; entryNumber: string; status: string } | null;
    createdByUsername: string | null;
    approvedByUsername: string | null;
    approvedAt: string | null;
    postedByUsername: string | null;
    postedAt: string | null;
    lines: Array<{ debit: number; credit: number }>;
    workflowEvents: Array<{ action: string; actorUsername: string; note: string; createdAt: string }>;
  }>>([]);
  const [journalLoadError, setJournalLoadError] = useState('');

  // 2. Navigation globale & Contexte
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('ADMIN');
  const [activeUser, setActiveUser] = useState<UserProfile>(SYSTEM_USERS[0]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('GRP00');
  const [currency, setCurrency] = useState<Currency>('TND');
  const [filterActivity, setFilterActivity] = useState<string>('ALL');
  const [activeModule, setActiveModule] = useState<NavModule>(
    () => {
      const parsed = parseNavigationState(window.location.hash);
      if (parsed.module) return parsed.module;
      const app = appFromHash(window.location.hash);
      return app !== 'ALL' ? STANDALONE_APPS[app].defaultModule : 'dashboard';
    },
  );
  const [isMasterImportOpen, setIsMasterImportOpen] = useState(false);
  const currentDateString = getImputedDate();

  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseNavigationState(window.location.hash);
      if (parsed.app) {
        setStandaloneApp(parsed.app);
        if (parsed.module) {
          setActiveModule(parsed.module);
          setIsModuleHome(false);
        }
      } else if (parsed.module) {
        setActiveModule(parsed.module);
        setIsModuleHome(false);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Thème d’affichage (Sobre Clair par défaut vs Fond Bleu Nuit sombre)
  const [theme, setTheme] = useState<'light' | 'night-blue'>(() => {
    try {
      return (localStorage.getItem('safe_theme') as 'light' | 'night-blue') || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      document.body.className = theme === 'night-blue' ? 'theme-night-blue' : '';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('safe_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    let active = true;
    const loadLoginEntities = async () => {
      setLoginOptionsLoading(true);
      setLoginOptionsError('');
      try {
        const response = await fetch('/api/auth/login-options');
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, 'Impossible de charger les entités.'));
        }
        if (!isJsonRecord(payload) || !Array.isArray(payload.entities)) {
          throw new Error('La liste des entités de connexion est invalide.');
        }
        const entities = payload.entities.map((entity): LoginEntityOption => {
          if (!isJsonRecord(entity) || typeof entity.id !== 'string'
            || typeof entity.name !== 'string' || typeof entity.code !== 'string') {
            throw new Error('La liste des entités de connexion contient une entrée invalide.');
          }
          return { id: entity.id, name: entity.name, code: entity.code };
        });
        if (!active) return;
        setLoginEntities(entities);
        const preferredEntity = entities.find((entity) => entity.code === 'TN01') ?? entities[0];
        setLoginEntityId((current) => entities.some((entity) => entity.id === current)
          ? current
          : preferredEntity?.id ?? '');
      } catch (error) {
        if (active) {
          setLoginOptionsError(error instanceof Error ? error.message : 'Impossible de charger les entités.');
        }
      } finally {
        if (active) setLoginOptionsLoading(false);
      }
    };
    void loadLoginEntities();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nav = parseNavigationState(window.location.hash);
    if (!nav.module) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#/modules/dashboard`,
      );
    }

    const handleHashChange = () => {
      const parsed = parseNavigationState(window.location.hash);
      if (parsed.module) {
        setActiveModule(parsed.module);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateToModule = (module: NavModule) => {
    if (window.location.hash !== `#/modules/${module}`) {
      window.history.pushState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#/modules/${module}`,
      );
    }
    setActiveModule(module);
  };

  // 3. Matrice de Sécurité & Droits d'Accès modifiables en direct
  const [rolePermissions, setRolePermissions] = useState<Record<UserRole, NavModule[]>>(INITIAL_ROLE_PERMISSIONS);
  const [modulesList, setModulesList] = useState(ALL_MODULES_CONFIG);
  const [systemUsersList, setSystemUsersList] = useState<UserProfile[]>(SYSTEM_USERS);

  // 5. Données Opérationnelles & Comptables en State Dynamique
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>(INITIAL_SALES_INVOICES);
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>(isDevelopmentBuild ? INITIAL_BUDGET_LINES : []);
  const [glOperations, setGlOperations] = useState<GeneralLedgerOperation[]>(INITIAL_GL_OPERATIONS);

  // 6. Saisie Comptable Horizontale (Ligne 1 = En-tête, Ligne 2+ = Lignes d'écritures)
  const [voucherHeader, setVoucherHeader] = useState<AccountingVoucherHeader>({
    voucherNumber: `OD-${new Date().getFullYear()}-${Date.now()}`,
    date: new Date().toLocaleDateString('fr-FR'),
    journal: 'Opérations diverses',
    reference: '',
    generalLabel: '',
    entityCode: '',
  });

  const [voucherLines, setVoucherLines] = useState<AccountingVoucherLine[]>([]);

  const [newLineAccount, setNewLineAccount] = useState('622000');
  const [newLineName, setNewLineName] = useState('Honoraires & Prestations Externes');
  const [newLineLabel, setNewLineLabel] = useState('Audit légal et conseil');
  const [newLineDebit, setNewLineDebit] = useState('0');
  const [newLineCredit, setNewLineCredit] = useState('0');

  // 7. Modals interactifs pour les ajouts
  const [isAddSaleModalOpen, setIsAddSaleModalOpen] = useState(false);
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [isAddBudgetModalOpen, setIsAddBudgetModalOpen] = useState(false);
  const [isAddModuleModalOpen, setIsAddModuleModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [systemHwId, setSystemHwId] = useState('HW-CHARGEMENT');
  const [systemLicInfo, setSystemLicInfo] = useState('Licence Active');
  const [licenseInputKey, setLicenseInputKey] = useState('');
  const [licenseActionMsg, setLicenseActionMsg] = useState('');

  // Récupération statut licence et Hardware ID
  useEffect(() => {
    fetch('/api/license/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.hardware_id) {
          setSystemHwId(data.hardware_id);
          setSystemLicInfo(data.info || (data.activated ? 'Licence Active' : 'Non Activé'));
        }
      })
      .catch(() => {
        setSystemHwId('HW-TUNISIE-LOCAL');
      });
  }, []);

  const handleActivateLicense = async () => {
    if (!licenseInputKey.trim()) {
      setLicenseActionMsg('Veuillez saisir une clé valide au format SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX.');
      return;
    }
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseInputKey.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLicenseActionMsg('✅ ' + data.message);
        setSystemLicInfo('Licence Active (Clé HMAC Validée)');
      } else {
        setLicenseActionMsg('❌ ' + (data.detail || data.message || 'Clé non valide pour cette machine'));
      }
    } catch {
      setLicenseActionMsg('❌ Erreur de communication serveur.');
    }
  };

  // Formulaires temporaires pour modals
  const [newSaleClientCode, setNewSaleClientCode] = useState('CLI-07');
  const [newSaleClientName, setNewSaleClientName] = useState('Société Plasturgie du Cap Bon');
  const [newSaleDueDate, setNewSaleDueDate] = useState('15/12/2026');
  const [newSaleAmountHT, setNewSaleAmountHT] = useState('28500');

  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpPosition, setNewEmpPosition] = useState('');
  const [newEmpDepartment, setNewEmpDepartment] = useState('Production');
  const [newEmpContract, setNewEmpContract] = useState<'CDI' | 'CDD' | 'CIVP' | 'Contrat Karama'>('CDI');
  const [newEmpSalary, setNewEmpSalary] = useState('2200');

  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleCategory, setNewModuleCategory] = useState('OPÉRATIONS');
  const [newModuleIcon, setNewModuleIcon] = useState('⚡');

  useEffect(() => {
    if (!isLoggedIn || !apiAccessToken) return;

    let active = true;
    let idleTimer: ReturnType<typeof setTimeout>;
    let lastHeartbeatAt = Date.now();

    const expireSession = () => {
      if (!active) return;
      active = false;
      setApiAccessToken(null);
      setApiEntityId(null);
      setApiUserId(null);
      setIsGlobalAdmin(false);
      setGlobalAdminEntities([]);
      setActiveGroupContext(null);
      setEntityContextError('');
      setRecentJournalEntries([]);
      setIsLoggedIn(false);
      setLoginError('Votre session a expiré après une heure d’inactivité. Veuillez vous reconnecter.');
    };

    const markActivity = () => {
      if (!active) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(expireSession, SESSION_IDLE_TIMEOUT_SECONDS * 1000);

      const now = Date.now();
      if (now - lastHeartbeatAt < 60_000) return;
      lastHeartbeatAt = now;
      void fetch('/api/auth/activity', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiAccessToken}` },
      }).then((response) => {
        if (!active) return;
        if (response.status === 401) {
          expireSession();
        } else if (!response.ok) {
          console.error(`Impossible de renouveler l’activité de session : HTTP ${response.status}`);
        }
      }).catch((error: unknown) => {
        if (active) console.error('Impossible de renouveler l’activité de session :', error);
      });
    };

    const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'] as const;
    idleTimer = setTimeout(expireSession, SESSION_IDLE_TIMEOUT_SECONDS * 1000);
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markActivity, { passive: true });
    }

    return () => {
      active = false;
      clearTimeout(idleTimer);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markActivity);
      }
    };
  }, [apiAccessToken, isLoggedIn]);

  // Entité courante & profil financier
  const currentEntity = SUBSIDIARIES.find((s) => s.id === selectedEntityId) || SUBSIDIARIES[0];
  const finProfile = FINANCIAL_PROFILES[selectedEntityId] || FINANCIAL_PROFILES.GRP00;
  const globalAdminGroups = globalAdminEntities.flatMap((entity) => entity.consolidationGroups.map((group) => ({
    ...group,
    ownerEntityId: entity.id,
    ownerEntityName: entity.name,
    ownerEntityCode: entity.code,
  })));
  const activeGlobalAdminEntity = globalAdminEntities.find((entity) => entity.id === apiEntityId);
  const activeContextName = activeGroupContext?.name
    ?? (isGlobalAdmin ? activeGlobalAdminEntity?.name ?? '' : currentEntity.name);
  const activeContextCode = activeGroupContext
    ? `${text('consolidatedGroups')} · ${activeGroupContext.ownerEntityCode}`
    : isGlobalAdmin ? activeGlobalAdminEntity?.code ?? '' : currentEntity.code;
  const moduleUsesGroupContext = Boolean(activeGroupContext && activeModule === 'consolidation');
  const activeEntityName = moduleUsesGroupContext
    ? activeGroupContext?.name ?? ''
    : isGlobalAdmin ? activeGlobalAdminEntity?.name ?? '' : currentEntity.name;
  const activeEntityCode = moduleUsesGroupContext
    ? 'GROUPE'
    : isGlobalAdmin ? activeGlobalAdminEntity?.code ?? '' : currentEntity.code;

  const switchGlobalAdminEntity = async (entityId: string): Promise<boolean> => {
    if (!isGlobalAdmin || !apiAccessToken || !entityId) return false;
    if (entityId === apiEntityId) {
      if (activeGroupContext) {
        setActiveGroupContext(null);
        navigateToModule('dashboard');
      }
      return true;
    }
    setIsChangingEntityContext(true);
    setEntityContextError('');
    try {
      const response = await fetch('/api/auth/entity-context', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entityId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Impossible de sélectionner cette société.'));
      }
      if (!isJsonRecord(payload) || typeof payload.accessToken !== 'string'
        || payload.entityId !== entityId) {
        throw new Error('La réponse de changement de société est invalide.');
      }

      setApiAccessToken(payload.accessToken);
      setApiEntityId(entityId);
      setActiveGroupContext(null);
      setRecentJournalEntries([]);
      setJournalLoadError('');
      navigateToModule('dashboard');

      try {
        const journalResponse = await fetch('/api/finance/journal-entries', {
          headers: { Authorization: `Bearer ${payload.accessToken}` },
        });
        const journalPayload = await journalResponse.json();
        if (!journalResponse.ok) {
          throw new Error(getApiErrorMessage(journalPayload, 'Impossible de charger le journal.'));
        }
        if (!Array.isArray(journalPayload)) {
          throw new Error('La réponse du journal comptable est invalide.');
        }
        setRecentJournalEntries(journalPayload);
      } catch (error) {
        setJournalLoadError(error instanceof Error ? error.message : 'Impossible de charger le journal comptable.');
      }
      return true;
    } catch (error) {
      setEntityContextError(error instanceof Error
        ? error.message
        : 'Impossible de sélectionner cette société.');
      return false;
    } finally {
      setIsChangingEntityContext(false);
    }
  };

  const switchGlobalAdminGroup = async (group: GlobalAdminConsolidationGroup) => {
    if (!isGlobalAdmin || !apiAccessToken) return;
    setIsChangingEntityContext(true);
    setEntityContextError('');
    try {
      if (group.ownerEntityId !== apiEntityId) {
        const ownerSelected = await switchGlobalAdminEntity(group.ownerEntityId);
        if (!ownerSelected) return;
      }
      setActiveGroupContext(group);
      navigateToModule('consolidation');
    } finally {
      setIsChangingEntityContext(false);
    }
  };

  const switchGlobalAdminContext = (selection: string) => {
    if (selection.startsWith('group:')) {
      const group = globalAdminGroups.find((item) => `group:${item.id}` === selection);
      if (!group) {
        setEntityContextError('Groupe consolidé introuvable dans les périmètres disponibles.');
        return;
      }
      void switchGlobalAdminGroup(group);
      return;
    }
    if (selection.startsWith('entity:')) {
      const entityId = selection.slice('entity:'.length);
      if (!globalAdminEntities.some((entity) => entity.id === entityId)) {
        setEntityContextError('Société introuvable dans les périmètres disponibles.');
        return;
      }
      void switchGlobalAdminEntity(entityId);
    }
  };

  // Gestion des permissions
  const hasAccess = (rolePermissions[currentUserRole] || []).includes(activeModule)
    && !(currentUserRole === 'ADMIN' && !isGlobalAdmin && activeModule === 'consolidation');

  const handleTogglePermission = (role: UserRole, modId: NavModule) => {
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'FINANCIAL_MANAGER') {
      alert("⚠️ Action non autorisée : Seuls l'Administrateur et le Directeur Financier (CFO) peuvent modifier la matrice des droits d'accès.");
      return;
    }
    const currentList = rolePermissions[role] || [];
    const updated = currentList.includes(modId)
      ? currentList.filter((m) => m !== modId)
      : [...currentList, modId];
    setRolePermissions((prev) => ({ ...prev, [role]: updated }));
  };

  // Actions d'ajout de données
  const handleAddVoucherLine = () => {
    const deb = parseFloat(newLineDebit) || 0;
    const cred = parseFloat(newLineCredit) || 0;
    if (deb === 0 && cred === 0) {
      alert('Veuillez saisir un montant au Débit ou au Crédit.');
      return;
    }
    const line: AccountingVoucherLine = {
      id: `L${voucherLines.length + 1}`,
      account: newLineAccount,
      accountName: newLineName,
      label: newLineLabel,
      debit: deb,
      credit: cred,
    };
    setVoucherLines([...voucherLines, line]);
    setVoucherSaveMessage('');
    setNewLineDebit('0');
    setNewLineCredit('0');
  };

  const totalDebit = voucherLines.reduce((acc, l) => acc + l.debit, 0);
  const totalCredit = voucherLines.reduce((acc, l) => acc + l.credit, 0);
  const voucherBalanceDiff = Number((totalDebit - totalCredit).toFixed(3));
  const isVoucherBalanced = voucherBalanceDiff === 0 && totalDebit > 0;

  const handleSaveVoucher = async () => {
    if (isSavingVoucher) return;
    if (!apiAccessToken || !apiEntityId) {
      setVoucherSaveMessage('Session API invalide. Déconnectez-vous puis reconnectez-vous.');
      return;
    }
    if (!isVoucherBalanced) {
      setVoucherSaveMessage(`Écriture non équilibrée : débit ${totalDebit.toLocaleString()} / crédit ${totalCredit.toLocaleString()}.`);
      return;
    }
    if (!voucherHeader.generalLabel.trim() || !voucherHeader.voucherNumber.trim()) {
      setVoucherSaveMessage('Le numéro et le libellé de l’écriture sont obligatoires.');
      return;
    }
    if (voucherWorkflowNote.trim().length < 5 || voucherWorkflowNote.trim().length > 500) {
      setVoucherSaveMessage('Ajoutez une note de préparation de 5 à 500 caractères pour la traçabilité.');
      return;
    }

    const [day, month, year] = voucherHeader.date.split('/');
    const entryDate = year && month && day
      ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      : voucherHeader.date;
    setIsSavingVoucher(true);
    setVoucherSaveMessage('');
    try {
      const response = await fetch('/api/finance/journal-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiAccessToken}`,
        },
        body: JSON.stringify({
          entryNumber: voucherHeader.voucherNumber,
          entityId: apiEntityId,
          date: entryDate,
          reference: voucherHeader.reference || undefined,
          description: voucherHeader.generalLabel,
          note: voucherWorkflowNote.trim(),
          lines: voucherLines.map((line) => ({
            accountCode: line.account,
            debit: line.debit,
            credit: line.credit,
            description: line.label || undefined,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'L’écriture n’a pas pu être enregistrée.');
      }

      setVoucherSaveMessage(`Écriture ${result.entryNumber} enregistrée à contrôler. Elle n’est pas encore comptabilisée.`);
      setRecentJournalEntries((entries) => [result, ...entries].slice(0, 20));
      setVoucherWorkflowNote('');
      setJournalLoadError('');
      setVoucherLines([]);
      setVoucherHeader((current) => ({
        ...current,
        voucherNumber: `OD-${new Date().getFullYear()}-${Date.now()}`,
        reference: '',
        generalLabel: '',
      }));
    } catch (error) {
      setVoucherSaveMessage(error instanceof Error ? error.message : 'Erreur lors de l’enregistrement de l’écriture.');
    } finally {
      setIsSavingVoucher(false);
    }
  };

  const runJournalWorkflow = async (entryId: string, action: 'approve' | 'reject' | 'post' | 'reverse') => {
    if (!apiAccessToken || journalWorkflowBusyId) return;
    setJournalWorkflowBusyId(entryId);
    setVoucherSaveMessage('');
    try {
      const response = await fetch(`/api/finance/journal-entries/${encodeURIComponent(entryId)}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiAccessToken}`,
        },
        body: JSON.stringify({ note: journalWorkflowNotes[entryId] ?? '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'La transition de l’écriture a échoué.');
      if (action === 'reverse') {
        setRecentJournalEntries((entries) => [
          result,
          ...entries.map((entry) => entry.id === result.reversesEntryId
            ? {
              ...entry,
              reversedByEntry: { id: result.id, entryNumber: result.entryNumber, status: result.status },
              workflowEvents: [...entry.workflowEvents, {
                action: 'REVERSAL_REQUESTED',
                actorUsername: activeUser.name,
                note: journalWorkflowNotes[entryId] ?? '',
                createdAt: new Date().toISOString(),
              }],
            }
            : entry),
        ]);
      } else {
        setRecentJournalEntries((entries) => entries.map((entry) => entry.id === entryId ? result : entry));
      }
      setJournalWorkflowNotes((notes) => ({ ...notes, [entryId]: '' }));
    } catch (error) {
      setVoucherSaveMessage(error instanceof Error ? error.message : 'La transition de l’écriture a échoué.');
    } finally {
      setJournalWorkflowBusyId('');
    }
  };

  // Calcul automatique du compte client à partir du code client
  const computeClientAccount = (clientCode: string) => {
    const numPart = clientCode.replace(/\D/g, '');
    const padded = numPart ? numPart.padStart(2, '0') : '01';
    return `411${padded}0`;
  };

  // Ajout d'une nouvelle facture client
  const handleCreateSalesInvoice = () => {
    const ht = parseFloat(newSaleAmountHT) || 0;
    const tva = Number((ht * 0.19).toFixed(3));
    const ttc = Number((ht + tva).toFixed(3));
    const autoAccount = computeClientAccount(newSaleClientCode);

    const newInv: SalesInvoice = {
      id: `SINV-${Date.now().toString().slice(-4)}`,
      invoiceNumber: `FAC-C-2026-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toLocaleDateString('fr-FR'),
      clientCode: newSaleClientCode.toUpperCase(),
      accountNumber: autoAccount,
      clientName: newSaleClientName,
      dueDate: newSaleDueDate,
      amountHT: ht,
      vatRate: 19,
      vatAmount: tva,
      amountTTC: ttc,
      status: 'En attente',
    };

    setSalesInvoices([newInv, ...salesInvoices]);
    setIsAddSaleModalOpen(false);
    alert(`✅ Facture Client [${newInv.invoiceNumber}] créée avec succès ! Compte client associé : ${autoAccount}.`);
  };

  // Ajout d'un salarié RH
  const handleCreateEmployee = () => {
    if (!newEmpName.trim()) {
      alert('Veuillez renseigner le nom du salarié.');
      return;
    }
    const sal = parseFloat(newEmpSalary) || 2000;
    const newEmp: Employee = {
      id: `EMP-${Date.now().toString().slice(-3)}`,
      name: newEmpName.trim(),
      position: newEmpPosition.trim() || 'Collaborateur',
      department: newEmpDepartment,
      contractType: newEmpContract,
      entryDate: new Date().toLocaleDateString('fr-FR'),
      seniority: 'Nouveau',
      salary: sal,
      paidLeaveBalance: 2.5,
      rttBalance: 1,
      gpecScore: 'Intégration B',
      status: 'Actif',
    };
    setEmployees([newEmp, ...employees]);
    setNewEmpName('');
    setNewEmpPosition('');
    setIsAddEmployeeModalOpen(false);
    alert(`✅ Salarié [${newEmp.name}] ajouté avec succès aux effectifs !`);
  };

  // ========================================================
  // BARRE D'OUTILS UNIVERSELLE DU DESIGN SYSTEM
  // RÈGLE : UN SEUL BOUTON BLEU PLEIN PAR ÉCRAN (ACTION PRINCIPALE)
  // LES AUTRES BOUTONS RESTENT EN RETRAIT (STYLE SOBRE / SOMBRE OU BLANC)
  // ========================================================
  const renderModuleToolbar = (
    moduleTitle: string,
    moduleDesc: string,
    exportCols: ExportColumn[],
    exportRows: any[],
    primaryAction?: { label: string; onClick: () => void; icon?: string; disabled?: boolean },
    kpis?: Array<{ label: string; value: string | number; change?: string }>
  ) => {
    return (
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '1.2rem 1.4rem',
          marginBottom: '1.2rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>{moduleTitle}</h1>
            <span style={{ fontSize: '0.72rem', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
              {activeEntityCode}
            </span>
            <span style={{ fontSize: '0.72rem', background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
              {currency}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
            {moduleDesc} • Imputation : <strong style={{ color: '#334155' }}>{currentDateString}</strong>
          </div>
        </div>

        {/* Boutons d'Action : Le bouton sombre reste en retrait, LE SEUL BOUTON BLEU PLEIN EST L'ACTION PRINCIPALE */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          {/* Boutons secondaires sobres (en retrait) */}
          {(activeModule === 'sales' || activeModule === 'purchases') && (
            <button
              type="button"
              disabled={!apiAccessToken || !apiEntityId}
              title={!apiAccessToken || !apiEntityId ? 'Une session authentifiée est requise.' : 'Importer des fiches de référentiel CSV ou XLSX.'}
              onClick={() => setIsMasterImportOpen(true)}
              style={{ background: '#FFFFFF', color: '#334155', border: '1px solid #CBD5E1', padding: '7px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: apiAccessToken && apiEntityId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              📥 Import CSV/XLSX
            </button>
          )}
          <button
            onClick={() => exportToExcel(moduleTitle, exportCols, exportRows, { moduleName: moduleTitle, companyName: activeEntityName, currency, customDate: currentDateString })}
            style={{ background: '#FFFFFF', color: '#047857', border: '1px solid #A7F3D0', padding: '7px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            📊 Excel
          </button>
          <button
            onClick={() => exportToPDF(moduleTitle, exportCols, exportRows, { moduleName: moduleTitle, language, companyName: activeEntityName, currency, customDate: currentDateString })}
            style={{ background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA', padding: '7px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            📄 PDF
          </button>
          <button
            onClick={() => exportToPowerPoint(moduleTitle, exportCols, exportRows, { moduleName: moduleTitle, companyName: activeEntityName, currency, customDate: currentDateString }, kpis)}
            style={{ background: '#FFFFFF', color: '#C2410C', border: '1px solid #FED7AA', padding: '7px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            📽️ PPTX
          </button>

          {/* L'ACTION PRINCIPALE : LE SEUL BOUTON BLEU PLEIN DE L'ÉCRAN */}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              style={{
                background: primaryAction.disabled ? '#94A3B8' : '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: primaryAction.disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
              }}
            >
              <span>{primaryAction.icon || '➕'}</span>
              <span>{primaryAction.label}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderGlobalAdminContextOptions = () => (
    <>
      <optgroup label={text('companies')}>
        {globalAdminEntities.map((entity) => (
          <option key={`entity:${entity.id}`} value={`entity:${entity.id}`}>
            {entity.name} ({entity.code})
          </option>
        ))}
      </optgroup>
      {globalAdminGroups.length > 0 && (
        <optgroup label={text('consolidatedGroups')}>
          {globalAdminGroups.map((group) => (
            <option key={`group:${group.id}`} value={`group:${group.id}`}>
              {group.name} — {group.ownerEntityName} ({group.ownerEntityCode})
            </option>
          ))}
        </optgroup>
      )}
    </>
  );

// Rendu dynamique de la vue selon activeModule
  const renderCurrentModuleView = () => {
    if (!hasAccess) {
      return (
        <div style={{ background: '#FFFFFF', border: '1px solid #FCA5A5', borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center', marginTop: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.4rem', color: '#DC2626', fontWeight: 800 }}>Accès Refusé • Habilitation Sécurité ISO 27001</h2>
          <p style={{ color: '#64748B', maxWidth: '540px', margin: '0.8rem auto 1.5rem', fontSize: '0.88rem' }}>
            Votre profil actuel (<strong>{activeUser.title}</strong> - Grade : <strong>{activeUser.grade}</strong>) ne dispose pas des privilèges nécessaires pour accéder au module <strong>{activeModule}</strong>.
          </p>
          <div style={{ display: 'inline-flex', gap: '10px' }}>
            <button onClick={() => navigateToModule('dashboard')} style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
              Retour au Tableau de Bord
            </button>
            {currentUserRole === 'ADMIN' && (
              <button onClick={() => navigateToModule('securityAccess')} style={{ background: '#FFFFFF', color: '#334155', border: '1px solid #CBD5E1', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                Consulter la matrice RBAC
              </button>
            )}
        </div>
      </div>
      );
    }

    if (isGlobalAdmin && !apiEntityId && activeModule !== 'securityAccess') {
      return (
        <section style={{ maxWidth: 760, margin: '3rem auto', padding: '2rem', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>{text('activeScope')}</h2>
          <p style={{ color: '#475569' }}>
            {globalAdminEntities.length
              ? text('selectCompanyForWork')
              : text('noCompaniesConfigured')}
          </p>
          {entityContextError && <p role="alert" style={{ color: '#B91C1C' }}>{entityContextError}</p>}
          {globalAdminEntities.length > 0 && (
            <label style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
              {text('chooseScope')}
              <select
                value=""
                disabled={isChangingEntityContext}
                onChange={(event) => switchGlobalAdminContext(event.target.value)}
              >
                <option value="">{text('chooseScope')}</option>
                {renderGlobalAdminContextOptions()}
              </select>
            </label>
          )}
        </section>
      );
    }

    const requestedModule: string = activeModule;
    if (requestedModule === 'hrDeep') {
      return <EmployeesPanel accessToken={apiAccessToken} />;
    }
    if (requestedModule === 'hrWorkflows') {
      return <HrWorkflowsPanel accessToken={apiAccessToken} />;
    }
    if (requestedModule === 'maintenance') {
      return <EquipmentMaintenancePanel accessToken={apiAccessToken} />;
    }
    if (requestedModule === 'projects') {
      return <ProjectManagementPanel accessToken={apiAccessToken} currency={currency} />;
    }
    if (requestedModule === 'tenders') {
      return <PublicTendersPanel accessToken={apiAccessToken} currency={currency} />;
    }
    if (requestedModule === 'customsRegimes') {
      return <CustomsRegimePanel accessToken={apiAccessToken} currency={currency} />;
    }
    if (requestedModule === 'quality') {
      return <QualityPanel accessToken={apiAccessToken} />;
    }
    if (requestedModule === 'securityAccess') {
      if (currentUserRole !== 'ADMIN') {
        return <p role="alert">La matrice des règles d’accès est réservée aux administrateurs.</p>;
      }
      return <AccessPoliciesPanel accessToken={apiAccessToken} isGroupAdmin={isGlobalAdmin} scopeEntityId={apiEntityId} />
    }
    if (requestedModule === 'reportsExport') {
      return <ReportsPanel
        accessToken={apiAccessToken}
        entityId={apiEntityId}
        userId={apiUserId}
        currency={currency}
        allowedModules={visibleModules.map((m) => m.id)}
        standaloneApp={standaloneApp}
      />;
    }
    switch (activeModule as NavModule) {
      // 1. TABLEAU DE BORD FINANCIER AVEC 5 GRAPHIQUES ORDONNÉS
      // RÈGLE COULEURS : 1. Bleu, 2. Turquoise, 3. Ambre, 4. Violet, 5. Gris
      case 'dashboard':
        return <DashboardPanel
          accessToken={apiAccessToken}
          entityId={apiEntityId}
          canExportFinancialDashboard={currentUserRole === 'ADMIN' || currentUserRole === 'FINANCIAL_MANAGER'}
        />;

      // 2. BUDGET & FORECAST DÉTAILLÉ
      case 'budget':
        return <BudgetPanel accessToken={apiAccessToken} entityId={apiEntityId} userId={apiUserId} />;

      // 3. TRÉSORERIE & CASH-FLOW DÉTAILLÉ
      case 'cashflow':
        return <CashflowPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'decisionSupport':
        return <DecisionSupportPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'fxRevaluation':
        return <FxRevaluationPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'financialStatements':
        return <FinancialStatementPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'incomeStatement':
        return <IncomeStatementPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'monthlyClose':
        return <MonthlyClosePanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      // 5. CONSOLIDATION GROUPE MULTI-ENTITÉS
      case 'consolidation':
        return <ConsolidationPanel
          accessToken={apiAccessToken}
          entityId={apiEntityId}
          activeGroupId={activeGroupContext?.id ?? null}
        />;

      case 'intercompany':
        return <IntercompanyPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'controlling':
        return <ControllingPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'generalBalance':
        return <GeneralBalancePanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'generalLedger':
        return <GeneralLedgerPanel accessToken={apiAccessToken} entityId={apiEntityId} currency={currency} />;

      // 8. SAISIE COMPTABLE HORIZONTALE PAR PIÈCE (LIGNE 1 = EN-TÊTE, LIGNE 2+ = LIGNES COMPTABLES)
      case 'accountingEntry': {
        return (
          <div>
            {renderModuleToolbar('Saisie Comptable Horizontale par Pièce', "Enregistrement structuré : 1ère ligne = En-tête, 2ème ligne et suivantes = Lignes d'imputation.", [
              { header: 'Compte', key: 'account' },
              { header: 'Intitulé', key: 'accountName' },
              { header: 'Libellé', key: 'label' },
              { header: 'Débit', key: 'debit' },
              { header: 'Crédit', key: 'credit' },
            ], voucherLines, { label: isSavingVoucher ? 'Enregistrement…' : 'Enregistrer la Pièce', onClick: () => {
              void handleSaveVoucher();
            }, icon: '💾' })}

            <label style={{ display: 'block', margin: '0 0 12px', color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>
              Note de préparation obligatoire
              <textarea
                value={voucherWorkflowNote}
                onChange={(event) => setVoucherWorkflowNote(event.target.value)}
                placeholder="Expliquez l’origine et l’objet de cette écriture (5–500 caractères)"
                rows={2}
                style={{ display: 'block', width: '100%', marginTop: '5px', padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
              />
            </label>
            {voucherSaveMessage && (
              <div role="status" style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '7px', background: voucherSaveMessage.includes('enregistrée à contrôler') ? '#F0FDF4' : '#FEF2F2', color: voucherSaveMessage.includes('enregistrée à contrôler') ? '#166534' : '#B91C1C', border: `1px solid ${voucherSaveMessage.includes('enregistrée à contrôler') ? '#BBF7D0' : '#FECACA'}` }}>
                {voucherSaveMessage}
              </div>
            )}
            {journalLoadError && (
              <div role="alert" style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '7px', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                Journal non chargé : {journalLoadError}
              </div>
            )}

            {/* LIGNE 1 : EN-TÊTE DE LA PIÈCE COMPTABLE */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1.4rem', marginBottom: '1.2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.8rem', color: '#2563EB', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                1ère LIGNE : EN-TÊTE GÉNÉRAL DE LA PIÈCE COMPTABLE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>N° Pièce</label>
                  <input
                    type="text"
                    value={voucherHeader.voucherNumber}
                    onChange={(e) => setVoucherHeader({ ...voucherHeader, voucherNumber: e.target.value })}
                    style={{ width: '100%', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', padding: '7px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>Date d'Imputation</label>
                  <input
                    type="text"
                    value={voucherHeader.date}
                    onChange={(e) => setVoucherHeader({ ...voucherHeader, date: e.target.value })}
                    style={{ width: '100%', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', padding: '7px 10px', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>Journal</label>
                  <select
                    value={voucherHeader.journal}
                    onChange={(e) => setVoucherHeader({ ...voucherHeader, journal: e.target.value })}
                    style={{ width: '100%', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', padding: '7px 10px', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' }}
                  >
                    <option value="Journal des Achats">Journal des Achats</option>
                    <option value="Journal des Ventes">Journal des Ventes</option>
                    <option value="Journal de Trésorerie / Banque">Journal de Trésorerie / Banque</option>
                    <option value="Opérations Diverses (OD)">Opérations Diverses (OD)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>Référence Justificative</label>
                  <input
                    type="text"
                    value={voucherHeader.reference}
                    onChange={(e) => setVoucherHeader({ ...voucherHeader, reference: e.target.value })}
                    style={{ width: '100%', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', padding: '7px 10px', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' }}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>Libellé Général de la Pièce</label>
                  <input
                    type="text"
                    value={voucherHeader.generalLabel}
                    onChange={(e) => setVoucherHeader({ ...voucherHeader, generalLabel: e.target.value })}
                    style={{ width: '100%', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', padding: '7px 10px', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' }}
                  />
                </div>
              </div>
            </div>

            {/* À PARTIR DE LA 2ÈME LIGNE : SAISIE DES LIGNES D'ÉCRITURES COMPTABLES */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '12px 14px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.85rem' }}>
                  À PARTIR DE LA 2ÈME LIGNE : DÉTAIL DES LIGNES D'ÉCRITURES COMPTABLES
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isVoucherBalanced ? '#15803D' : '#DC2626' }}>
                  {isVoucherBalanced ? '✓ Pièce Rigoureusement Équilibrée' : `⚠️ Déséquilibre : ${voucherBalanceDiff.toLocaleString()} ${currency}`}
                </span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '9px 12px' }}>Compte</th>
                    <th style={{ padding: '9px 12px' }}>Intitulé du Compte</th>
                    <th style={{ padding: '9px 12px' }}>Libellé d'Écriture</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Débit ({currency})</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Crédit ({currency})</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {voucherLines.map((line, idx) => (
                    <tr key={line.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#2563EB' }}>{line.account}</td>
                      <td style={{ padding: '8px 12px', color: '#1E293B', fontWeight: 600 }}>{line.accountName}</td>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>{line.label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: line.debit > 0 ? '#15803D' : '#94A3B8' }}>{line.debit ? line.debit.toLocaleString() : '-'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: line.credit > 0 ? '#B91C1C' : '#94A3B8' }}>{line.credit ? line.credit.toLocaleString() : '-'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => setVoucherLines(voucherLines.filter((l) => l.id !== line.id))}
                          style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Ligne d'ajout rapide */}
                  <tr style={{ background: '#EFF6FF', borderTop: '2px dashed #93C5FD' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        type="text"
                        value={newLineAccount}
                        onChange={(e) => setNewLineAccount(e.target.value)}
                        placeholder="N° Compte"
                        style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '5px 8px', borderRadius: '4px', fontSize: '0.78rem' }}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        type="text"
                        value={newLineName}
                        onChange={(e) => setNewLineName(e.target.value)}
                        placeholder="Intitulé"
                        style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '5px 8px', borderRadius: '4px', fontSize: '0.78rem' }}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        type="text"
                        value={newLineLabel}
                        onChange={(e) => setNewLineLabel(e.target.value)}
                        placeholder="Libellé"
                        style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '5px 8px', borderRadius: '4px', fontSize: '0.78rem' }}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        type="number"
                        value={newLineDebit}
                        onChange={(e) => setNewLineDebit(e.target.value)}
                        placeholder="0.000"
                        style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '5px 8px', borderRadius: '4px', fontSize: '0.78rem', textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        type="number"
                        value={newLineCredit}
                        onChange={(e) => setNewLineCredit(e.target.value)}
                        placeholder="0.000"
                        style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '5px 8px', borderRadius: '4px', fontSize: '0.78rem', textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        onClick={handleAddVoucherLine}
                        style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Ajouter Ligne
                      </button>
                    </td>
                  </tr>

                  {/* Ligne de Totalisation */}
                  <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 900 }}>
                    <td colSpan={3} style={{ padding: '10px 12px', color: '#0F172A' }}>TOTAUX DE LA PIÈCE COMPTABLE</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#15803D', fontSize: '0.9rem' }}>{totalDebit.toLocaleString()} {currency}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#B91C1C', fontSize: '0.9rem' }}>{totalCredit.toLocaleString()} {currency}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {isVoucherBalanced ? <span style={{ color: '#15803D' }}>✓ Équilibré</span> : <span style={{ color: '#DC2626' }}>Diff: {voucherBalanceDiff}</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <section aria-label="Workflow des écritures manuelles" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem', marginTop: '1.2rem' }}>
              <h2 style={{ margin: '0 0 0.4rem', color: '#0F172A', fontSize: '0.95rem' }}>Contrôle des écritures manuelles</h2>
              <p style={{ margin: '0 0 0.8rem', color: '#64748B', fontSize: '0.78rem' }}>
                Le préparateur, le contrôleur et le comptabilisateur doivent être trois identités distinctes. Les écritures en attente ne sont pas incluses aux états financiers.
              </p>
              {recentJournalEntries.filter((entry) => entry.status === 'TO_REVIEW' || entry.status === 'APPROVED').length === 0 ? (
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.82rem' }}>Aucune écriture en attente de contrôle ou de comptabilisation.</p>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {recentJournalEntries.filter((entry) => entry.status === 'TO_REVIEW' || entry.status === 'APPROVED').map((entry) => (
                    <article key={entry.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
                      <strong>{entry.entryNumber}</strong>
                      <span style={{ marginLeft: '8px', color: '#475569' }}>{entry.status === 'TO_REVIEW' ? 'À contrôler' : 'Approuvée — à comptabiliser'}</span>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>{entry.description} · préparée par {entry.createdByUsername ?? 'auteur historique inconnu'}</div>
                      {entry.workflowEvents.map((event, index) => (
                        <details key={`${event.action}-${index}`} style={{ marginTop: '4px', fontSize: '0.78rem' }}>
                          <summary>{event.action} par {event.actorUsername} · {new Date(event.createdAt).toLocaleString('fr-FR')}</summary>
                          <span>{event.note}</span>
                        </details>
                      ))}
                      <textarea
                        aria-label={`Note workflow ${entry.entryNumber}`}
                        value={journalWorkflowNotes[entry.id] ?? ''}
                        onChange={(event) => setJournalWorkflowNotes((notes) => ({ ...notes, [entry.id]: event.target.value }))}
                        placeholder="Note obligatoire (5–500 caractères)"
                        rows={2}
                        style={{ display: 'block', width: '100%', marginTop: '6px', padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                      />
                      {entry.status === 'TO_REVIEW' ? (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
                          <button type="button" disabled={Boolean(journalWorkflowBusyId) || (journalWorkflowNotes[entry.id] ?? '').trim().length < 5}
                            onClick={() => void runJournalWorkflow(entry.id, 'approve')}>Approuver</button>
                          <button type="button" disabled={Boolean(journalWorkflowBusyId) || (journalWorkflowNotes[entry.id] ?? '').trim().length < 5}
                            onClick={() => void runJournalWorkflow(entry.id, 'reject')}>Rejeter</button>
                        </div>
                      ) : (
                        <button type="button" disabled={Boolean(journalWorkflowBusyId) || (journalWorkflowNotes[entry.id] ?? '').trim().length < 5}
                          onClick={() => void runJournalWorkflow(entry.id, 'post')} style={{ marginTop: '5px' }}>
                          {journalWorkflowBusyId === entry.id ? 'Traitement…' : 'Comptabiliser'}
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section aria-label="Écritures comptabilisées" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem', marginTop: '1.2rem' }}>
              <h2 style={{ margin: '0 0 0.8rem', color: '#0F172A', fontSize: '0.95rem' }}>Écritures comptabilisées récentes</h2>
              {recentJournalEntries.filter((entry) => entry.status === 'POSTED').length === 0 ? (
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.82rem' }}>Aucune écriture enregistrée pour cette société.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '8px' }}>N° pièce</th>
                        <th style={{ padding: '8px' }}>Date</th>
                        <th style={{ padding: '8px' }}>Libellé</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Débit</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Crédit</th>
                        <th style={{ padding: '8px' }}>Correction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentJournalEntries.filter((entry) => entry.status === 'POSTED').map((entry) => {
                        const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
                        const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
                        return (
                          <tr key={entry.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px', fontWeight: 650 }}>{entry.entryNumber}</td>
                            <td style={{ padding: '8px' }}>{new Date(entry.date).toLocaleDateString('fr-FR')}</td>
                            <td style={{ padding: '8px' }}>{entry.description}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{debit.toLocaleString('fr-FR')}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{credit.toLocaleString('fr-FR')}</td>
                            <td style={{ padding: '8px', minWidth: '220px' }}>
                              {entry.reversedByEntry ? (
                                <span>Contrepassée par {entry.reversedByEntry.entryNumber} ({entry.reversedByEntry.status})</span>
                              ) : (
                                <>
                                  <textarea
                                    aria-label={`Motif de contrepassation ${entry.entryNumber}`}
                                    value={journalWorkflowNotes[entry.id] ?? ''}
                                    onChange={(event) => setJournalWorkflowNotes((notes) => ({ ...notes, [entry.id]: event.target.value }))}
                                    placeholder="Motif obligatoire (5–500 caractères)"
                                    rows={2}
                                    style={{ display: 'block', width: '100%', padding: '6px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                                  />
                                  <button type="button" disabled={Boolean(journalWorkflowBusyId) || (journalWorkflowNotes[entry.id] ?? '').trim().length < 5}
                                    onClick={() => void runJournalWorkflow(entry.id, 'reverse')} style={{ marginTop: '4px' }}>
                                    {journalWorkflowBusyId === entry.id ? 'Traitement…' : 'Demander la contrepassation'}
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        );
      }

      case 'purchases':
        return <PurchasesPanel accessToken={apiAccessToken} entityId={apiEntityId} userId={apiUserId} />;

      // 10. STOCKS & ARTICLES PERSISTÉS
      case 'stocks':
        return <StocksPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'sales':
        return <SalesInvoicesPanel accessToken={apiAccessToken} entityId={apiEntityId} currency={currency} />;

      case 'tunisianEInvoices':
        return <TunisianEInvoicePanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'agedReceivables':
        return <ReceivablesAgingPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'agedPayables':
        return <PayablesAgingPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      case 'activities':
        return <ProductionPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      // 12. RESSOURCES HUMAINES & TALENTS (SANS "APPROFONDIE" + BOUTON AJOUT SALARIÉ)
      case 'hrDeep': {
        return (
          <div>
            {renderModuleToolbar('Ressources Humaines & Talents', "Gestion des contrats de travail, suivi de l'ancienneté, soldes de congés et cartographie GPEC.", [
              { header: 'Matricule', key: 'id' },
              { header: 'Collaborateur', key: 'name' },
              { header: 'Poste', key: 'position' },
              { header: 'Département', key: 'department' },
              { header: 'Contrat', key: 'contractType' },
              { header: 'Entrée', key: 'entryDate' },
              { header: 'Ancienneté', key: 'seniority' },
              { header: 'Solde CP', key: 'paidLeaveBalance' },
              { header: 'Score GPEC', key: 'gpecScore' },
              { header: 'Statut', key: 'status' },
            ], employees, { label: 'Ajouter Salarié', onClick: () => setIsAddEmployeeModalOpen(true), icon: '👤' })}

            {/* Cartes KPI Blanches */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '1.2rem' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>Effectif Actif Total</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#2563EB', marginTop: '4px' }}>{employees.length} collaborateurs</div>
              </div>
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>Taux de Contrats CDI</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#06B6D4', marginTop: '4px' }}>75% CDI stables</div>
              </div>
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>Dispositifs d'Insertion</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#F59E0B', marginTop: '4px' }}>Contrat Karama & CIVP</div>
              </div>
            </div>

            {/* Tableau Employés (Zebra) */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '10px 12px' }}>Matricule</th>
                    <th style={{ padding: '10px 12px' }}>Nom & Prénom</th>
                    <th style={{ padding: '10px 12px' }}>Poste Officiel</th>
                    <th style={{ padding: '10px 12px' }}>Département</th>
                    <th style={{ padding: '10px 12px' }}>Type de Contrat</th>
                    <th style={{ padding: '10px 12px' }}>Ancienneté</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Solde CP (j)</th>
                    <th style={{ padding: '10px 12px' }}>Score GPEC</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, idx) => (
                    <tr key={emp.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#2563EB' }}>{emp.id}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0F172A' }}>{emp.name}</td>
                      <td style={{ padding: '9px 12px', color: '#1E293B', fontWeight: 600 }}>{emp.position}</td>
                      <td style={{ padding: '9px 12px', color: '#64748B' }}>{emp.department}</td>
                      <td style={{ padding: '9px 12px', color: '#06B6D4', fontWeight: 700 }}>{emp.contractType}</td>
                      <td style={{ padding: '9px 12px', color: '#64748B' }}>{emp.seniority}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#15803D' }}>{emp.paidLeaveBalance} j</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#8B5CF6' }}>{emp.gpecScore}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>{renderStatusBadge(emp.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // 13. SÉCURITÉ & MATRICE UTILISATEURS RBAC (AVEC MATRICE UTILISATEURS COMPLÈTE DEMANDÉE + CASES COCHABLES)
      case 'securityAccess': {
        return (
          <div>
            {renderModuleToolbar('Sécurité & Droits d’Accès (RBAC)', "Matrice complète des utilisateurs habilités et matrice de contrôle d'accès modifiable en direct.", [
              { header: 'Matricule', key: 'id' },
              { header: 'Utilisateur', key: 'name' },
              { header: 'Poste', key: 'title' },
              { header: 'Grade', key: 'grade' },
              { header: 'Rôle', key: 'role' },
              { header: 'Filiale', key: 'assignedEntityId' },
            ], systemUsersList, { label: 'Ajouter un Module', onClick: () => setIsAddModuleModalOpen(true), icon: '➕' })}

            {/* A. MATRICE COMPLÈTE DES UTILISATEURS SYSTÈME (DEMANDÉE EXPLICITEMENT) */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.6rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '12px 14px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem' }}>
                  👥 Matrice des Utilisateurs Habilités & Rôles de Sécurité
                </span>
                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>Normes ISO 27001 & Séparation des Pouvoirs</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '9px 12px' }}>ID Utilisateur</th>
                    <th style={{ padding: '9px 12px' }}>Nom & Prénom</th>
                    <th style={{ padding: '9px 12px' }}>Email Professionnel</th>
                    <th style={{ padding: '9px 12px' }}>Poste & Fonction</th>
                    <th style={{ padding: '9px 12px' }}>Grade de Sécurité</th>
                    <th style={{ padding: '9px 12px' }}>Filiale Assignée</th>
                    <th style={{ padding: '9px 12px' }}>Rôle RBAC</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {systemUsersList.map((usr, i) => (
                    <tr key={usr.id} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#2563EB' }}>{usr.id}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0F172A' }}>{usr.name}</td>
                      <td style={{ padding: '9px 12px', color: '#64748B' }}>{usr.email}</td>
                      <td style={{ padding: '9px 12px', color: '#1E293B', fontWeight: 600 }}>{usr.title}</td>
                      <td style={{ padding: '9px 12px', color: '#8B5CF6', fontWeight: 700 }}>{usr.grade}</td>
                      <td style={{ padding: '9px 12px', color: '#06B6D4', fontWeight: 600 }}>{usr.assignedEntityId}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: usr.role === 'ADMIN' ? '#2563EB' : usr.role === 'FINANCIAL_MANAGER' ? '#15803D' : '#334155' }}>{usr.role}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>{renderStatusBadge('Actif')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* B. MATRICE DES DROITS PAR MODULE (CASES À COCHER INTERACTIVES) */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '12px 14px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem' }}>
                  🛡️ Matrice des Droits d’Accès par Rôle (Modifiable en Direct pour Admin & CFO)
                </span>
                <span style={{ fontSize: '0.74rem', color: '#2563EB', fontWeight: 700 }}>
                  Profil actuel : {currentUserRole} ({activeUser.name})
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                      <th style={{ padding: '8px 10px' }}>Module SAFE_ERP</th>
                      <th style={{ padding: '8px 10px' }}>Catégorie</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Admin</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Directeur Financier</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Comptabilité</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>DRH / Paie</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Commercial</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Logistique</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulesList.map((m, idx) => (
                      <tr key={m.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F172A' }}>
                          <span style={{ marginRight: '6px' }}>
                            {m.icon && m.icon.startsWith('/') ? (
                              <img src={m.icon} alt="" style={{ width: '18px', height: '18px', objectFit: 'contain', verticalAlign: 'middle' }} />
                            ) : (
                              m.icon
                            )}
                          </span>
                          <span>{m.label}</span>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#64748B' }}>{m.category}</td>
                        {(['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT', 'HR_MANAGER', 'SALES_OFFICER', 'LOGISTICS_MGR'] as UserRole[]).map((r) => {
                          const isChecked = (rolePermissions[r] || []).includes(m.id);
                          return (
                            <td key={r} style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePermission(r, m.id)}
                                style={{ width: '16px', height: '16px', accentColor: '#2563EB', cursor: 'pointer' }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      }

      // 14. RAPPORTS & PLAQUETTES FINANCIÈRES (MODULE RAPPORT DEMANDÉ)
      case 'reportsExport': {
        return <ReportsPanel
          accessToken={apiAccessToken}
          entityId={apiEntityId}
          userId={apiUserId}
          currency={currency}
          allowedModules={visibleModules.map((m) => m.id)}
          standaloneApp={standaloneApp}
        />;
      }

      case 'taxation':
        return (
          <TaxationPanel
            accessToken={apiAccessToken}
            entityId={apiEntityId}
            currency={currency}
          />
        );

      case 'payrollEngine':
        return <PayrollSimulationPanel accessToken={apiAccessToken} />;

      case 'anomalies':
        return <AnomaliesPanel accessToken={apiAccessToken} />;

      case 'parameters':
        return <CountryConfigurationPanel accessToken={apiAccessToken} isAdmin={currentUserRole === 'ADMIN' || (currentUserRole as string) === 'DAF' || (currentUserRole as string) === 'COMPTABLE' || (currentUserRole as string) === 'AUDITEUR' || !currentUserRole} />;

      case 'workbookControls':
        return <WorkbookReadinessPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      // Immobilisations SAFE : Gestion des Immobilisations & Amortissements
      case 'assetsManagement':
        return <AssetsManagementPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      // Contrôle analytique SAFE : Centres de Profit & Répartition Analytique
      case 'profitCenters':
        return <><ProfitCentersPanel accessToken={apiAccessToken} entityId={apiEntityId} /><AnalyticalAllocationRulesPanel accessToken={apiAccessToken} entityId={apiEntityId} /></>;

      // Planification SAFE : Planification des Besoins Nets (MRP I / II)
      case 'mrpPlanning':
        return <MrpPlanningPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      // Gouvernance SAFE : Gouvernance, Séparation des Tâches & Délégations
      case 'governanceSod':
        return <GovernanceSodPanel accessToken={apiAccessToken} entityId={apiEntityId} />;

      // 17. AUTRES MODULES STANDARDS DU SYSTÈME (RENDUS PROPRES AVEC CARTES BLANCHES ET TABLEAUX ZEBRA)
      default: {
        return <FinanceDataUnavailable
          title={modulesList.find((module) => module.id === activeModule)?.label || activeModule}
          missingData="un parcours métier persistant et autorisé pour ce module."
        />;
        return (
          <div>
            {renderModuleToolbar(
              modulesList.find((m) => m.id === activeModule)?.label || activeModule,
              `Module opérationnel SAFE_ERP • Filiale ${activeEntityName}.`,
              [
                { header: 'Entité', key: 'ent' },
                { header: 'Devise', key: 'cur' },
                { header: 'Statut', key: 'st' },
              ],
              [{ ent: activeEntityName, cur: currency, st: 'Actif & Conforme' }],
              { label: 'Nouvelle Action', onClick: () => alert(`Action exécutée pour le module ${activeModule}.`), icon: '⚡' }
            )}

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1.6rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: '0 0 10px 0' }}>
                Données Opérationnelles Synchronisées • {activeEntityName}
              </h3>
              <p style={{ color: '#475569', fontSize: '0.85rem' }}>
                Chiffre d’Affaires Filiale : <strong style={{ color: '#2563EB' }}>{finProfile.turnover.toLocaleString()} {currency}</strong> • Trésorerie Nette : <strong style={{ color: '#06B6D4' }}>{finProfile.cash.toLocaleString()} {currency}</strong> • Effectif Global : <strong>{finProfile.headcount} collaborateurs</strong>.
              </p>
              <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                {renderStatusBadge('Validé')}
                {renderStatusBadge('En attente')}
                {renderStatusBadge('En retard')}
                {renderStatusBadge('Brouillon')}
              </div>
            </div>
          </div>
        );
      }
    }
  };

// Traitement de la connexion utilisateur
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginOptionsLoading || !loginEntityId) {
      setLoginError(loginOptionsLoading
        ? 'Veuillez attendre le chargement des entités.'
        : 'Choisissez une entité avant de vous connecter.');
      return;
    }
    if (!loginUsername.trim()) {
      setLoginError('Veuillez saisir votre nom d’utilisateur.');
      return;
    }
    if (!loginPassword.trim()) {
      setLoginError('Veuillez saisir votre mot de passe.');
      return;
    }
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
          entityId: loginEntityId,
          accountType: loginAccountType,
        }),
      });
      const result = await parseLoginResponse(response);

      const role = result.user?.role as UserRole | undefined;
      const selectedAccountType = LOGIN_ACCOUNT_TYPES.find((type) => type.value === loginAccountType);
      if (!selectedAccountType || selectedAccountType.role !== role) {
        throw new Error('Le type de compte choisi ne correspond pas au compte authentifié.');
      }
      const selectedProfileTitle = loginAccountType === 'CUSTOMER_ACCOUNTS_CLERK'
        ? 'Chargée de comptes clients'
        : loginAccountType === 'SUPPLIER_ACCOUNTS_CLERK'
          ? 'Chargé de comptes fournisseurs'
          : null;
      const profile = systemUsersList.find((user) => user.role === role
        && (!selectedProfileTitle || user.title === selectedProfileTitle))
        ?? systemUsersList.find((user) => user.role === role)
        ?? (role === 'ACCOUNTANT' && typeof result.user?.username === 'string'
          ? {
            id: 'USR-ACCOUNTANT',
            name: result.user.username,
            email: '',
            role,
            title: 'Comptabilité',
            grade: 'Accès comptable limité',
            assignedEntityId: 'TN01',
          }
          : undefined);
      if (!role || !profile) {
        throw new Error('Le profil retourné par le serveur est invalide.');
      }

      const isGlobalAdminAccount = role === 'ADMIN' && result.user.entityId === null;
      let availableEntities: GlobalAdminEntity[] = [];
      let accessToken = result.accessToken;
      if (isGlobalAdminAccount) {
        const entitiesResponse = await fetch('/api/auth/entities', {
          headers: { Authorization: `Bearer ${result.accessToken}` },
        });
        const entitiesPayload: unknown = await entitiesResponse.json();
        if (!entitiesResponse.ok) {
          throw new Error(getApiErrorMessage(entitiesPayload, 'Impossible de charger les sociétés.'));
        }
        availableEntities = parseGlobalAdminEntities(entitiesPayload);
        const selectedEntity = availableEntities.find((entity) => entity.id === loginEntityId);
        if (!selectedEntity) {
          throw new Error('L’entité choisie n’est pas accessible à ce compte.');
        }
        const contextResponse = await fetch('/api/auth/entity-context', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${result.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ entityId: loginEntityId }),
        });
        const contextPayload: unknown = await contextResponse.json();
        if (!contextResponse.ok) {
          throw new Error(getApiErrorMessage(contextPayload, 'Impossible de sélectionner cette entité.'));
        }
        if (!isJsonRecord(contextPayload) || typeof contextPayload.accessToken !== 'string'
          || contextPayload.entityId !== loginEntityId) {
          throw new Error('La réponse de sélection de l’entité est invalide.');
        }
        accessToken = contextPayload.accessToken;
      } else if (result.user.entityId !== loginEntityId) {
        throw new Error('L’entité choisie ne correspond pas au périmètre de ce compte.');
      }

      setApiAccessToken(accessToken);
      setApiEntityId(loginEntityId);
      setApiUserId(typeof result.user.id === 'string' ? result.user.id : null);
      setIsGlobalAdmin(isGlobalAdminAccount);
      setGlobalAdminEntities(availableEntities);
      setActiveGroupContext(null);
      setEntityContextError('');
      setCurrentUserRole(role);
      const authenticatedProfile = { ...profile, name: result.user.username, assignedEntityId: loginEntityId };
      setActiveUser(authenticatedProfile);
      setSelectedEntityId(loginEntityId);
      const sub = SUBSIDIARIES.find((item) => item.id === loginEntityId);
      if (sub) setCurrency(sub.currency);
      setRecentJournalEntries([]);
      setJournalLoadError('');
      if (!isGlobalAdminAccount
        && (role === 'ADMIN' || role === 'FINANCIAL_MANAGER' || role === 'ACCOUNTANT')) {
        try {
          const entriesResponse = await fetch('/api/finance/journal-entries', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const entriesResult = await entriesResponse.json();
          if (!entriesResponse.ok) {
            throw new Error(typeof entriesResult.error === 'string' ? entriesResult.error : 'Impossible de charger le journal.');
          }
          setRecentJournalEntries(entriesResult);
        } catch (error) {
          setJournalLoadError(error instanceof Error ? error.message : 'Impossible de charger le journal comptable.');
        }
      }
      if (standaloneApp !== 'ALL') {
        setIsModuleHome(false);
        setActiveModule(STANDALONE_APPS[standaloneApp].defaultModule);
      } else {
        setIsModuleHome(true);
      }
      setModuleSearchQuery('');
      setIsLoggedIn(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Échec de la connexion au serveur.';
      if (message === 'Identifiant, entité ou type de compte incorrect.') {
        setLoginError(loginUsername.trim().toLowerCase() === 'admin'
          ? 'Le mot de passe est reconnu, mais vérifiez le profil Administrateur et l’entité Safe Tunisie Industries SARL (TN01).'
          : 'Le mot de passe est reconnu, mais l’entité ou le type de compte choisi ne correspond pas à ce compte. Vérifiez ces deux sélections.');
      } else {
        setLoginError(message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loginAccountTypeLabel = (accountType: LoginAccountType) => {
    if (accountType === 'CUSTOMER_ACCOUNTS_CLERK') return text('customerAccountsClerk');
    if (accountType === 'SUPPLIER_ACCOUNTS_CLERK') return text('supplierAccountsClerk');
    const option = LOGIN_ACCOUNT_TYPES.find((item) => item.value === accountType);
    return option ? translateRole(language, option.role) : accountType;
  };

  const selectLoginProfile = (accountType: LoginAccountType) => {
    const option = LOGIN_ACCOUNT_TYPES.find((item) => item.value === accountType);
    if (!option) return;
    setLoginAccountType(accountType);
    setLoginUsername(option.username);
    setLoginPassword('');
    setLoginError('');
  };

  const todayFormatted = new Date().toLocaleDateString(isArabic ? 'ar-TN' : 'fr-TN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ==========================================
  // ÉCRAN DE CONNEXION SAFE ERP (SI DÉCONNECTÉ)
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div
        lang={getHtmlLanguage(language)}
        dir={isArabic ? 'rtl' : 'ltr'}
        style={{
          minHeight: '100vh',
          background: theme === 'night-blue' ? '#0A1128' : '#F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
          color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
            background: theme === 'night-blue' ? '#111C3A' : '#FFFFFF',
            border: `1px solid ${theme === 'night-blue' ? '#1E2D54' : '#E2E8F0'}`,
            borderRadius: '12px',
            padding: '2.5rem 2rem',
            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setTheme((curr) => (curr === 'night-blue' ? 'light' : 'night-blue'))}
              style={{
                background: theme === 'night-blue' ? '#1E293B' : '#F1F5F9',
                color: theme === 'night-blue' ? '#38BDF8' : '#0F172A',
                border: '1px solid #CBD5E1',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {theme === 'night-blue' ? '🌙 Fond Bleu Nuit' : '☀️ Affichage Sobre'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
              {text('language')}
              <select
              aria-label={text('language')}
              value={language}
              onChange={(event) => changeLanguage(event.target.value as Language)}
              style={{ padding: '6px 8px', border: '1px solid #CBD5E1', borderRadius: 6 }}
            >
              <option value="FR">{text('french')}</option>
              <option value="EN">{text('english')}</option>
              <option value="AR">{text('arabic')}</option>
            </select>
          </label>
          </div>
          {languagePreferenceWarning && (
            <p role="status" style={{ color: '#B91C1C', textAlign: 'right', fontSize: '0.78rem' }}>
              {text('languagePreferenceWarning')}
            </p>
          )}
          <div style={{ textAlign: isArabic ? 'right' : 'left', marginBottom: '1.8rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 10px',
                marginBottom: '14px',
                borderRadius: '8px',
                background: standaloneApp === 'ALL' ? '#EFF6FF' : `${STANDALONE_APPS[standaloneApp].accentColor}18`,
                color: standaloneApp === 'ALL' ? '#1D4ED8' : STANDALONE_APPS[standaloneApp].accentColor,
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              <img src="data:image/png;base64,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" alt="Logo SAFE" style={{ width: '22px', height: '22px', borderRadius: '5px', objectFit: 'contain' }} />
              <span>{standaloneApp === 'ALL' ? 'SAFE_ERP' : STANDALONE_APPS[standaloneApp].shortName}</span>
            </div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 750, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
              {standaloneApp === 'ALL' ? text('loginTitle') : `Connexion · ${STANDALONE_APPS[standaloneApp].shortName}`}
            </h1>
            <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '7px' }}>
              {standaloneApp === 'ALL' ? text('applicationName') : STANDALONE_APPS[standaloneApp].tagline}
            </div>
            {standaloneApp !== 'ALL' && (
              <div style={{ marginTop: '8px' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  background: STANDALONE_APPS[standaloneApp].accentColor,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                }}>
                  {STANDALONE_APPS[standaloneApp].badge}
                </span>
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '8px' }}>
              {todayFormatted}
            </div>
          </div>

          {/* Formulaire de Connexion */}
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {loginError && (
              <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '10px 12px', borderRadius: '7px', fontSize: '0.8rem' }}>
                {loginError}
              </div>
            )}
            {loginOptionsError && (
              <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '10px 12px', borderRadius: '7px', fontSize: '0.8rem' }}>
                {loginOptionsError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 650, color: '#334155', marginBottom: '6px' }}>
                {text('entity')}
              </label>
              <select
                value={loginEntityId}
                onChange={(event) => setLoginEntityId(event.target.value)}
                disabled={loginOptionsLoading || loginEntities.length === 0}
                required
                style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#0F172A', padding: '10px 12px', borderRadius: '7px', fontSize: '0.875rem', boxSizing: 'border-box' }}
              >
                <option value="">
                  {loginOptionsLoading ? 'Chargement des entités…' : loginEntities.length ? text('chooseCompany') : text('noCompaniesConfigured')}
                </option>
                {loginEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>{entity.name} ({entity.code})</option>
                ))}
              </select>
            </div>

            {/* Nom d'utilisateur */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 650, color: '#334155', marginBottom: '6px' }}>
                {text('username')}
              </label>
              <input
                type="text"
                dir="ltr"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Ex: admin"
                style={{
                  width: '100%',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#0F172A',
                  padding: '10px 12px',
                  borderRadius: '7px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                autoComplete="username"
                required
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 650, color: '#334155', marginBottom: '6px' }}>
                {text('password')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Mot de passe"
                  style={{
                    width: '100%',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#0F172A',
                    padding: isArabic ? '10px 12px 10px 72px' : '10px 72px 10px 12px',
                    borderRadius: '7px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: isArabic ? 'auto' : '8px',
                    left: isArabic ? '8px' : 'auto',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#475569',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                  }}
                >
                  {showPassword ? text('hide') : text('show')}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 650, color: '#334155', marginBottom: '6px' }}>
                {text('accountType')}
              </label>
              <select
                value={loginAccountType}
                onChange={(event) => {
                  const selected = LOGIN_ACCOUNT_TYPES.find((item) => item.value === event.target.value);
                  if (selected) setLoginAccountType(selected.value);
                }}
                required
                style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#0F172A', padding: '10px 12px', borderRadius: '7px', fontSize: '0.875rem', boxSizing: 'border-box' }}
              >
                {LOGIN_ACCOUNT_TYPES.map((accountType) => (
                  <option key={accountType.value} value={accountType.value}>
                    {loginAccountTypeLabel(accountType.value)}
                  </option>
                ))}
              </select>
            </div>

            {/* Action principale : Bouton bleu plein */}
            <button
              type="submit"
              disabled={isLoggingIn || loginOptionsLoading || !loginEntityId}
              style={{
                background: isLoggingIn ? '#64748B' : '#1D4ED8',
                color: '#FFFFFF',
                border: 'none',
                padding: '11px',
                borderRadius: '7px',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: isLoggingIn ? 'wait' : 'pointer',
                marginTop: '4px',
                boxShadow: '0 2px 5px rgba(29, 78, 216, 0.18)',
              }}
            >
              {isLoggingIn ? text('signingIn') : text('signIn')}
            </button>
          </form>

          {/* Raccourcis par type de compte */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 650, marginBottom: '9px' }}>
              {text('profileShortcuts')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              {LOGIN_ACCOUNT_TYPES.map((accountType) => (
                <button
                  key={accountType.value}
                  type="button"
                  onClick={() => selectLoginProfile(accountType.value)}
                  title={loginAccountTypeLabel(accountType.value)}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {loginAccountTypeLabel(accountType.value)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'left', fontSize: '0.7rem', color: '#94A3B8', marginTop: '1.4rem' }}>
            © 2026 SAFE_ERP • Connexion vérifiée par le serveur
          </div>
        </div>
      </div>
    );
  }

  // Catégories de menus
  const roleFilteredModules = modulesList.map((m) => {
    if (m.id === 'reportsExport' && standaloneApp !== 'ALL') {
      const config = STANDALONE_APPS[standaloneApp];
      return {
        ...m,
        label: config.reportModuleLabel,
        category: config.reportModuleCategory,
        icon: config.reportModuleIcon,
      };
    }
    return m;
  }).filter((module) =>
    (rolePermissions[currentUserRole] || []).includes(module.id)
    && !(currentUserRole === 'ADMIN' && !isGlobalAdmin && module.id === 'consolidation'));
  const visibleModules = standaloneApp === 'ALL'
    ? roleFilteredModules
    : roleFilteredModules.filter((module) => STANDALONE_APPS[standaloneApp].modules.includes(module.id));
  const categories = Array.from(new Set(visibleModules.map((m) => m.category)));
  const normalizedModuleSearch = moduleSearchQuery.trim().toLocaleLowerCase();
  const searchedModules = visibleModules.filter((module) =>
    !normalizedModuleSearch
    || translateModuleLabel(language, module.id, module.label).toLocaleLowerCase().includes(normalizedModuleSearch)
    || translateCategory(language, module.category).toLocaleLowerCase().includes(normalizedModuleSearch));
  const activeModuleConfig = modulesList.find((module) => module.id === activeModule);

  // ==========================================

  if (isModuleHome) {
    const homeCategories = Array.from(new Set(searchedModules.map((module) => module.category)));
    return (
      <main className="safe-module-home" lang={getHtmlLanguage(language)} dir={isArabic ? 'rtl' : 'ltr'}>
        <header className="safe-home-header">
          <div className="safe-home-brand">
            <span className="safe-home-brand-mark">
              <img src="data:image/png;base64,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" alt="Logo SAFE" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
            </span>
            <div>
              <strong>{standaloneApp === 'ALL' ? 'SAFE' : STANDALONE_APPS[standaloneApp].shortName}</strong>
              <small>{standaloneApp === 'ALL' ? 'ERP · Espace de travail' : STANDALONE_APPS[standaloneApp].badge}</small>
            </div>
          </div>
          <div className="safe-home-user"><span>{activeUser.name}</span><span className="safe-home-role">{currentUserRole === 'ADMIN' ? (isGlobalAdmin ? 'Administrateur groupe' : 'Administrateur entité') : translateRole(language, currentUserRole)}</span><button type="button" className="safe-home-logout" onClick={async () => { try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + (apiAccessToken || '') } }); } finally { setApiAccessToken(null); setApiEntityId(null); setApiUserId(null); setIsLoggedIn(false); } }}>{text('logout')}</button></div>
        </header>
        <section className="safe-home-content">
          <div className="safe-home-intro">
            <div>
              <p className="safe-home-eyebrow">ESPACE DE TRAVAIL</p>
              <h1>Bonjour, {activeUser.name}</h1>
              <p>Retrouvez ici les outils disponibles pour votre fonction.</p>
            </div>
            <div className="safe-home-date">{todayFormatted}</div>
          </div>
          <div className="safe-home-access-note">
            <span className="safe-home-access-dot" aria-hidden="true"></span>
            <span>{visibleModules.length} module{visibleModules.length > 1 ? 's' : ''} disponible{visibleModules.length > 1 ? 's' : ''} · {activeUser.title} · {currentEntity.name}</span>
          </div>
          <label className="safe-home-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={moduleSearchQuery} onChange={(event) => setModuleSearchQuery(event.target.value)} placeholder="Rechercher un module…" aria-label="Rechercher un module" />
            {moduleSearchQuery && <button type="button" onClick={() => setModuleSearchQuery('')} aria-label="Effacer la recherche">Effacer</button>}
          </label>
          {searchedModules.length === 0 ? (
            <div className="safe-home-empty">Aucun module ne correspond à votre recherche.</div>
          ) : homeCategories.map((category) => (
            <section className="safe-home-category" key={category}>
              <div className="safe-home-category-heading">
                <h2>{translateCategory(language, category)}</h2>
                <span>{searchedModules.filter((module) => module.category === category).length}</span>
              </div>
              <div className="safe-home-grid">
                {searchedModules.filter((module) => module.category === category).map((module) => (
                  <button className="safe-home-module" type="button" key={module.id} onClick={() => { setIsModuleHome(false); navigateToModule(module.id); }}>
                    <span className="safe-home-module-mark" aria-hidden="true">
                      {module.icon && module.icon.startsWith('/') ? (
                        <img src={module.icon} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        module.icon || '📌'
                      )}
                    </span>
                    <span className="safe-home-module-copy">
                      <strong>{translateModuleLabel(language, module.id, module.label)}</strong>
                      <small>{translateCategory(language, module.category)}</small>
                    </span>
                    <span className="safe-home-module-arrow" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <footer className="safe-home-footer">Les accès sont définis par votre compte et votre rôle. Contactez l’administrateur SAFE pour toute modification.</footer>
        </section>
      </main>
    );
  }

  // APPLICATION SAFE ERP CONNECTÉE
  // NAVIGATION : LE MARINE #0F1E3A EN BARRE LATÉRALE, AVEC UN LISERÉ TURQUOISE SUR L'ENTRÉE ACTIVE
  // NEUTRES : FOND GRIS CLAIR #F1F5F9, CARTES BLANCHES, LIGNES DE TABLEAU ALTERNÉES (ZEBRA)
  // ==========================================
  return (
    <div className="safe-app-shell" lang={getHtmlLanguage(language)} dir={isArabic ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F1F5F9', color: '#0F172A', fontFamily: "'Segoe UI', Arial, sans-serif", overflow: 'hidden' }}>
      {isMasterImportOpen && (activeModule === 'sales' || activeModule === 'purchases') && (
        <MasterDataImportPanel
          kind={activeModule === 'sales' ? 'customer' : 'vendor'}
          accessToken={apiAccessToken}
          entityId={apiEntityId}
          onClose={() => setIsMasterImportOpen(false)}
        />
      )}
      {/* 1. BARRE SUPÉRIEURE (HEADER UNIVERSEL MULTI-ENTITÉS) */}
      <header
        className="safe-app-header"
        style={{
          height: '58px',
          background: theme === 'night-blue' ? '#0D1630' : '#FFFFFF',
          borderBottom: `1px solid ${theme === 'night-blue' ? '#1E2D54' : '#E2E8F0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.2rem',
          zIndex: 50,
          flexShrink: 0,
          boxShadow: theme === 'night-blue' ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.04)',
        }}
      >
        {/* Titre & Logo Prestige Multinational ou Prologiciel Métier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            background: '#0B132B'
          }}>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJcAAACICAYAAADqH3k3AAAQAElEQVR4Ady92a8s15Xm963IPOOdZ/JyvKQoqjSURA1kaaqqLnS3G4Yf/GD7zYBhw264C92NbrTbMGD/Hf4r5H4wYMAPNhplu6qrVaIkah54KUqURHG4vPNwzsnY/n1rx46MzHMuSamEdsOp+GKNe+21916xIzLy8KrT2Zf+Ii586Q1d+OJVnX/pCHwB3ecH/NHVuPDlq3Hxj692F//06uzxf3B187n/7OqxF/7h1bNf/JdXz3/xv796/o/AF/7l1bPgzIDTn//vrp78/L8A/3zEsc/986vHPvfPHoJ/+hC9/W37J1d3P/dPru680PCP4f/8EHZf+EdXp9hBXsWfj222X/jzq9sv/GNg+o+g4DMTfPq/vbrd8Kl/eHX7U/8N+K/Bf3V1+5MN/yX8fwFMm84Uv0/i35DtHeMfXt0h5m7iH13d/XTFDnQVf44f+MyfX90d8Y+v7nxmQM7DP72680LFLnT3hX/GHHmOweeNf3H1BOtw+qV/efXMF/+Hq2e/8j9dPfvl//Hqsc//06vbH/vPr86e/o+udo//B+DvX9Ujf4c1/tOr8cifAPhHK6zXwMdALRtxGR/jsb/3s3js77+mR//u/9ypK59Qt/FYdPMrS2xcQQfmVxSbFd32lW7r+JWNU49c2Tr/9JXtix+5sn3umStbpx+7Mt89d0Ubu1f6jePg2JV+a/dKMTZ3rpSN7Stlc+uKDHgB6zpoYk7cAQGN+daV2NgB21dicwC+Vbd1RfOdRECrzvL2Fc2gR8K2hp0r2Y62LU6jTV/p7pXIWK3dNu3AbAv9JjzUeSbQZ96Nuo9mb7omr1PsGRNKTrVvtz8aHTnFnNxAh/8I9N1s+0rKzF3HvHfMXUdeOcfM32yDvlmDQn+l27hSYnZFXXdlA//NE+eu7J59+srupeeubJ956sps5wzrtnWldJtXygxf024L/4rUp24T3SZz0vS0mW09VeabTyv0TCfF3VJ6yVARDLB8ANtrNt/Sxu5pbZ64oK2Tl7QJTDdOXtTGiXOabZ+QupkW/QLsjej7PS3xAH6Chfnm+4A2FX1f9f1iH3/amxq95cHW4i72VBIPSB0efaH9CPdhHDxQb8DbtqDNgngl0drtE8N4MFDzzWZqfcOeRIwEfYr8ZApqzH3RIXFaO1Nj2b6kL3GgbpvjgC+Zk9t/GCzbO4acE+NPnlhK/gG5Gvh6/Af31e+DvXuYb6vfu0Ou+5rN5ppvH9PGzkltHjvFWp9nbS9qdvy8YnOn1oNjaiEmvcqiRqagfiKxUBQQ5YGLi5EUGg3oe5WewiLEbGNXG8fPauvUo9o+9TidPkISp9jUthWzDSloLj606WnTM8AGT1jjexYgweQlTXlP/cR/ye+jBwcGPgcD0ndfxfLY/oF6ZOvc35GgTxluY1/i2N/t+uxjP2NUfugLvx7/MgI97frFgQzPT2KQ+8UC/YKFrCijvvr3KdMP1LYpbKux9rXsb8k7jz773qt2cnP+BV0WVKNe/IHv8algfqxDXvo/IM4e+e5B6Ye5yf5NuQhZTTaTk6z3JW2dvpxrPts+pVxrx2KdaUi9UFwUE8WyxlNHPYiy3ynyIylwUn6i29B853QW1QY71Wz3rLrtk1TxrkSVF9rWoAsIaJ1QZGw5EsH7xq/YaNj0jTa7aepYIHZBRk+cCc8CisWRfRYMbPQxfwS4emoMXywV2dbtR7T4bj/lLU/BtCDKAyfPHsqR4rjZM7SmY/hSiQG0TYOpsXT0HaOQS++YpoypT9R8C7ppzgVbQ5988xvWYMW/jWdBiAO5XRaFd59Ez74Dsm98KMAsSC6oIPVuPtfG5jbFdU5bZx7T3LvYbNMDYFyMAU6umYSUhHZqnz689VgTKvm/UMy3qVx2K4pqfvwiRXVCImihxwzJROWksHgFkHXtDL0GVHuPuEhwSp/C4G3LQWZbJiApO2VhAuBrzCpncaBLfyazyth89RBLTEzamk/KZJl5UA1Jaw4ledvcp22G+SmmOvP2r6jNmSUYx4LIyLnEhelL2TrDctp8GuyVncaY8p6vhpazczBqjp6bh6HOw9JXORdVbm1y/jyPw3yVyZwX/CvomwITt9FgN5zNOm0cO62t049rfvIyG8wxScF6Epvy1Pt8OtxUPBvUWUelzo+dzeeq+bFzio1tKebAxSf1JNCzqD0JTlGQnXghacO8UfC1zbBcQVLEEbbDYBKJZf/inQq+tql687aZjsg+WRTiTftLnn76o/TELYlpO3j8i9HaMC9lgLwdkbp6Zoxi4cj6sarxlWJn8pPnRHPmV4kegdDqiVWp1Gd/LCiKzHmgfdIF9gVtjwD594w92w8xLBf0tdCYM+ylyVDzU4g+jGm/lac/7hI9t0k/owV+GztntH36SW0ev6xukw0nZiKxCsZLkUhJNX46c9F1mm3tak5hbRy/oNnOKcVsi8mjqHKCuMJUJ38cjAfk5FdQfUrqBr4NCv86aJYDvgAdheZv6jimI4hp3voEMjEc60ODiZpOcE7mSgzGShGUNQiZCWEymbHS5sUUMKkFaID5oo4m2OyLPnWF5iOm/TxsHCzyB45z6tP4Vaoc36quWJdz0ZOU4cRMycV6Lu5CgRUKrPAFQNwtZlvHcvfaYAebbVEj3njEZ2VukIejE1dit0kjdqqNYxc03zkp+TaIQxEdjYNryS1vX5lgbq1NZ3+jyDYxANGx+Sw4VqfydRDCXmX718FZ9tVUba3PJa1697GEdaKfJWr8jDXqq070eRi+ym13Dg8B89GOQrEwFMRIpGwdWOGD4rLO1EietaRZSbmOu5DjFEIWeZYPgH2M6ucxtHlanxvbljr7u51W+ikkNsDFha0YFFm/8DfMW/KtcrZ1XBsneAY79bg6drNgB7MfjZmL1aOLrW3N2LFmFFa3dUKl4zaYfXByJ+wUeihYEHxcDN4BGi0UpdZBkebO5YfJjEdbJs9tHN+7iSwbrW36MTFTmnFoO/Tr9gEfrc2U2hfZtnC/I2iPXlkhjo/sfonjeMspYg6WwhrnTX+KGfapPPDcFQqPHEVBb1QVO5oS9B404WANEYYcnIfRcpnQvEDbXKz7eKygoDfGuUQ+xGeMtf7s5zlpNPlCXhQsz2D9wV31D24oFve4Le5mgc2OPyrNt/BxLHwZSx6wpKIuKKz57ml1vHZQN1NhpB6E3InB4HLhM6FhIdB5Eawv+Bjp3xZv8E27dZbxk6nhxAd9OAvbgP0FzSKc6FPONh4E4GpKnX0cxzA/Ah/iBG2MGrPqKu/RG9ZB8Rv1lMCSz6ni5Cpo6JBBADUwb6pQwa+nV6BCwRn4FeuzwDqVpITxUTglOBXDOwwLypi8Dp6TBvGsxkpm62B8auPF1znnBW695xgEsE/qvWa2JQru9IF9akvedvtiq+tFTpbzFnlPZe+GOnay2XxDs+0TFBoP+GxIeDEuZwcsMKxu4/i56sCcuEgq6JyBFiBgakx5y1MQkoOoa/7yhEx0rc00lvnAx/RhaO1M6Yij9mV/6wzzq2CExLUNQhvLRm1b9cuxNlmeYDfAbZwxN0swUSyvhmIRRTWi79T3MzBXkZ9ZN1RcXOiD24dcZAp0FTiNOWV3nJY5HJVX4QVloc1huB2B09bm0jrDelPDvGHeGPn+cH+2GzVP29lcDu5JFFjs39Z8RoH5jtfegxUuVsanLuThdrONY+p4r8VwVa8QXzkOZNrgKod3BRMgryiomIyGgmwIuoIhaeFbRhALv5JwXxX2ETrhl/COAkrKJJ42KDolJpNcZyCX322ziSVcIOORek41Jkb41tSLYqw5y/bq5lkyOlTsWi4cg4LSgeUNBc8kszO84b74iLozFyW+WZXYxn9Dirki8OuAgriOZXj8iC0dOsv85A9KWmNFgB9s1Y7sefC84EMU3Dy3cBM/+zb0g95zZDR9YRcsxDEEFX4NRIPljK7wYF/27yr276ib72jjxFOa7VxUUEM4ycMKhiY+HiUJueFy0QoJ5xZJMbmzKUTHKY/bJu2ss68BL9prKCrHGtugr20LKrdjcuw/IG3wpjjIMF+BLxOIkjPtfU7fxkM9+BETT5qiVvHJ7VbALKwddjNwcxDaieEwY96tQPEMiqlzoXCJ9gchHksUu6e1+7HndeZPXtS5//BLOvHVz2v+7HPS8TOi6iRRYIkZfCcVg+LKmIh0yChgOGcCuKFDIXeJllwKoudugO34trHhwOECOwJeH4N5EyjjeuA76At6WT/K7Fbw9jdcF/7FoPg9GP3O5rvq/M2Rx6qY+eLR+OnE84ur1g0r1pJ3Zwk6yeo2HQaGrBFuN0HAe+ANJKKG1DmHNZ/UV12BL/gbgl8B+ozlEIPNfk3tCOlvxki/Dz41V8oonQsr2qApn0Xl3WsmLmT1i05BAe1+/KM6/3c/r4v/yR/p3H/6OZ34j1/S5pf+UN3ly+JrOClRXGUOpbhcWC5Q4jq2jvrkgGwonACy54UAKZvPcXsOsHlOrGv2pNbbTsGkDF9Yz/RLG2uZNqj1QIZ1piNq/7JeB4z5vrTvb5D3uG5OMv5Hpc2T5NVJGVcenX9aPEBBcFdo7kjwY9BVvjzM7k7dxjHMgzDIieAcMNkplAGSxeSgD3yVqOoCXyZ+UdX1fFSIapmc7TQRR9aR1mEjOheNp2RccCYq5Up7CqLXDGdjzgRTXIu5ZifP6fQLn9Klv/85dq1ntf3ps9Kzx9X94RltvvCEZo+ek/hWVbh9Ft9GiaPsQ3zol/P7HkXyjiHmpKJ6e34qLNc5LOlj2aBhzqFt5tmhUq58jWXbAK8f6HtkaNrXaX55WDB2fpfk2UsH3B63z6o7+bQELcxhKSV76fLsYC6a4l1pCe9oBiOTUdwRDRE4CIBsnWF77mIenH0SDNDjMGA9jQ0EoGvHWAIXDjsDDoTJgYKYBbjtCtA57orOLWlivWFRuaCWOimLxkUC74eEAQVauNUJFAppydsPf56bCre2nt2qxIbm587rzGef1+P/4A919stPa/HoMd0K6Y4v7AXdzCJ71YJksqg6BQtQtYHDcBT4RJOhjEsgx0xzJowHekZpnQWo7YnB3eqUJ7YJ68b2HNwIyrHqTwHmupJ8ARSTa2CJul5e67w19g8UPG/xzVDBi3eCjwfF1Zxb0J4ElnzJjqoseIwcZETGZQJN+KnefI7EXdIseWjVw6SCiZXh0OSTOuVEBnEN+xvuBy8ZlhssO4KRzVvopJw4lH0E54qUI1RYbK1ghs7ARhEWIIpNfOX2Q3nxDtRtaePMaZ3/9LN66u99QudfelT9xblu9NLte9LBvaL+rX3t/+ymDt6+K+31td8ICU6OmQgp5SkVn8JQK2DkOTAdx8u8WE4IP1okzzibT6Opx6fOUTqgok2yecK0pIV1LsQ/DNeB2wE2kcILdL9Y9cN9HNxVsEEFF0hE5Ig64SQH63vJlbqGSNm2KVzRyB6Qk3Yibp88emSB4rjEdyoEx5sBCJCkcQAAEABJREFU2AfdKONn34bAK13Qu11Ds1eKE6ECH8P+dIUJb3Q1Nj4YcFNhsDJEdFOIkjJ8F413I0NzlQQ7lGa4DKCogq/dvkJFYYlb28bp0zr7saf09Jee0SOffUT757b09kGvuwcL+bbS7fFc8utb2n/tXS2u3RUbgJQFPKOPJZQFRh4K1bydMaxlqwIZFGB70Nowb6+Ex2xUgTNt8GNCcBvmxHZQjLT1imFtU2c9k1iA4JW0J9YE6H17tk+hkIx+sScXlotMXteujUXqCh1UZ4K4QKZwBykvNHZm3QgGMfK0d+cknvGsh6ehmsww0dSzSCT1o8Z64euYq0g/x17H0JZGNOSqItfSEydTgTI1RMIWcBwQF1oFk+CJcHFRSErMJW51QaEFhRDYKjYkboW1sEKz48d06flH9cwXn9GFz1zWwfkdXVv0uvXgQAtyCI/9Pvyvb2jxi2vSzftkGqBLaFJQRSEZAW3Q2qeIQlB+YImRLCck5qSOf8kXdIdAXqmjddLRh3kj39Rhm8ZKXYZlLtNn8HWsxEKl59mLl6rBS9ZgvuSfDpk7mjFKFgIPFmBZQC64qqvBKo/7kJCgFTQe+JpI9am2Je9pdd4VSz2zs3o41kTDkGiCf+pMV0DOyBwweBS5nwYhNUwtqfMkGOxSmoKiKgMETfA8IVD4lld4zpodO6aLH3tcz7z0rB773BOKx07pbfq6dm+hA74XUSKZzuI+8ls31b95XbrL1Y2PXDyyRycx9Uo+pKTi03hTxDzMe1QZlvkYKHPFgVxnKeccKa1pKNm6VqV50PTrdNIu1xHZUTMmzSpFM7bzutfaKP66XPZqXx3v82Y7knd6NFxKFBVVKCrzSLDDjHo6rTw9rnVELDkxToyvdg6DGl+3g6tkIlv3O+G3i1G9GWou6IweDXapsbCGncm7EyhMTg8KRdV3m+rZzQrPWLF7Quc/8oQ++uWP6fIXntbGE2d0fWOutx4U3aawShcKwMXMt/QDHbx7R+U9vq7v8Y28o8+uo28fwWkdqLLImt7yKuo4qq5OPwuek4rFijTBN92KbAFb+g3UvGHTCGy0d+RcP9cGsjSsadYJznazvnf9ML4gb955aX5MYs7w4LbIOwvxQBB2dICEQ0+DVb7uaNVW0g89UbKfQS4ZB6UPJ55IgROeHKNL2lA0ag94FylapACiXmtU6w5jYsO9DMiGnOyvcdHqs47yFshij5TiooCUoOi8a1FM9c06VyNX5MaJk7r4/JN6nsJ65sWntfXkWb27saFfM683+Xlnn+Ipc8fvtOBhfu9dHubfobhu+3mLeWKnDFBz0RGfWNNZDsWohfNgmB8mZNTmXKL3LOS8wa8YU04rrpXW9uaZWzu7YHL90hkl1IfhVvTJgZ6j6dAr2/mqosCCC4c39kFxRWwSdeZLGW87Pgwtqu0D77QMuiLIentUrmKIm4ywbDR3879PMPdHh7NhHUcUFjuWXFRZYExO/mSzKx6wtHXijB559jF9+isf08e/9Kx2njyja5tzvUFhvX0QukcJ9HN2RuAc+lsU1lt3tHiHH3ofMPHYlXMSmEHOI+wHHHg+xMOTaNO6R9PbZkxl88B9GzaPQD8trkFvN2O5hvabYGp0cc22JcM8G1bnOFnxREhKA1NXZXFlDnKB2td6mQcFu5FFhtzs1i2Lj6vWiWMvhvvB0Txk7XDiSxXu2dVSM3B2M1IMzlN4SIazMl3HjAzmCfm2mAXFbsVtUNwGK9itxER1OxTWKV26clnPf+5ZfeKlp3T6mTN6e2umX+wVvbVfdJfaWXQhF5dmnWYLEuMB/uDXN7V4j5ddHj56kqwH5mSccjIfdLKj0Ro2f8tGMJZBZ3FgV4j1DUcY0rQ84YHgyW+REVEefdgGnGFQVIbyQhI7l++pBMrFhuZq/m2oExrau8AavNSrODrXOFo9aWqPJRiXeyRtT/IUHZHWMUO3ROG2WAIZBMUVFFfwItC3Q7FzbRw/rotPXtTHPvuU/uClJ3X8mVN6a6vTVQrrlw963Tmoo8teKbCukzpeRej6XfV8Uyw3HmR/MbPBQyBbv1LIyW88LgHyMLNEkfk0cJryiD4Kpwk87UwEHaFMAbuPKW/ZsG4EimzCeNCNtVBnljN6znjlgQt9JFupFYkeOQOlkVFDMXjMDjpFJuqg+CePn+2Vb3HouOnxtR2Ngw6wHxp84KoOPv1M3aaBfjjSJ+1retsM5aR7ScWnTnpBtwoPraJwRRUKqMi7FsXENSV4deZB7l7cCnm2CnYrsWt128d0/okLeu6Fx/WxL1zW2Y+e1hvbM32Lrern9ygsdqie/AO4l1kooxa+JZb3uB2+xYM83xLdR+F2yQyQawE+ep9WkQ+LqIhX5wmeI0WoGJ/8cYgGywOs8rrkvNGoUiLBWz+FczGGppiQ8KttMhIzjxWduDtVLH2Iir3KSh8p2KTC3xwN36nk+aix8PGALZgaWPNA58ojnEovqwiLhE8Gxu4EonZp+9HAf+j0aDtaQnHOw30o46f4AScvLwnkAphaXsecGIaLCbBTaYQLa0ferYqgm8d06vIFfeSzT+j5Lz6mEx89o9/szvXdu71evdPrJjsWr9OyNw+JTUvzrnBL7HVw098S76tc55a4xz2zIw/DjuvI8fVMHGBG9b6fyeSs+01MS9ac4wJPyfvFzzzsT+CBwA2HGxuDOCVed/sbPGPJX5MNx+Pi5SVqYQ0NJiKdScZ0mAgs2HmnQXIZw3rbDfPoa39uZ48Kt2PWMFmG+DCbHZdcmNx7LDc4FjyHvR8KtzaUewWLZxqmQRuD4hl3qjl9GTMFugh4iipmluF56SfgVw09t8KeH5hPPnJOz/Gq4WNfeVKnP3ZGbx3f0HfZrV6nsNi4GDUP79zaCr35mIW06eLiXdfinfs6eOeByu19yRXoyhMOTA8TKfHSOuGv8J5DD9bw2BO4OLB1pnRgkvNpZpTxm/Bu6s0P1fIYYrhZhaMA9HWXYl3hlw0GLp3xQ0y2UQvm3caAr1kQh/EU3tbLOxfjsiuzRBALONcOUcN7ItblDIQtGhiRC8TwRCbF5rbG2B6/xjfqWI0fqf0Mx3DiLKAGFDn6KoTOsM1ULrAVzFDPVYKdCQTfBIPi0ogNye9kYot059Lmlo5dPK3nPv+4XvizJ3TuE2f11vZcP6SwrrJr3ezpf9YRE8pKFkBwzUIigmZ39lTevKfexXW/pJ8CY4H/LZHuYm0AyTFd9CkIoayCXR7uwtJgy7bwI6Wwj5rj1BEMV86OXTnrHa72S2MuJ/PWG3jiX3Mbz9SQKDD590asbt+5KIQhyKQCdfbByTocPT/kT0x0yMuAVYUbjcxjtwCxwiRhHe3wsDpRk5QyrqrFbgYiR7PAcmQOqEyzEXylMFaCoLAid6eZgm+CCQopKCqBkphL6AQvP7xTFn2/oTLb1MkLp/UH7Fgv/NlTOvcHp3h4D32fonr1dq/rB6G+CwopiK3xE3BzbnsbaGd39tW/fUcH1+6r59YpclIwA+EFgjLPnuvEOB/oD/EEdeDBNBBZ5ZCqp8EptagqRcnhFhAFkQ1kDgS5TuSLApvGOPY1HMNUGtfYHItiOceCXD04Z0xOHLIPu3LJAitypM47N/rqWSpxe+sqCAvjYkjg4kCHgL7a8SeyQ6HCDZn2cncMBonwWNHZ38NYB27DOAjkdmqfKnu6IvWBAWQDqGbI7Cy+TSZveUNyIY3YpH/2mdjhuuKVw8FcYvc68+hZfYSH98/86ZO69MkzenOj03dv+Bmr6BrvCQ/Il2cI8ioDlBl0Ic1mQY8h3T1Qz4/U/S2+JfJbo2zkdskkSHVVoaXCBQciiw8VWekQrJ9gHGfVNZGeUzFEHqIw0+Rc53gtsh1pURgBLtXoIKCkvp5hqy3FPBGbuHm2CZ0DgMKFUyguQYXstl4JKE6c7V4JcjoQCMqBPzqCwqRLPQ069PaBoCZDM1Y0oH3Y4Qi2uVWD5VU0yzp1+g0uJINiaYWVOxRyoE+eQvObd74Rln5L2rd+U2cun+Eb4RP6xFef1NmPndab89Ar13v99HbRDR5Fve+4RlwHmZfTgHHPM0L4S6cfNQ5uLbS4/kDl3vBbG0UnFlD+uI1h/reEm7mQarOUKvvQs33G1TzCa5h1r4/XKt3zdITvROVmI2A4PDyqhM56LjomywXGReNWzA8KcyN6OLcaqBNwNa5cebisHM1/UFoc2N8fIVWPJGF+ClaY26Cm4KFdxqyTuoYNeD9/UVgLF92Gzjx2Vs+/+ER+Kzz70VP6FYX1zRtFr94tusUUFPrzBhQeSPFpiSDsHH9r9m5L99niFrydL/6WaKX7zYYWfk9Yy+HoqO7UONq6qm3ShwrcnEfKFA087VfqZKGu4/2Ed6OsIarYVdj+dohypCGNWmGlU2G6BwxygRo406SswEM03Idh3iBIuisZa5YgApmoflLA5ucEw/7BqhrsUAWoYbpDsVMFW8qI2VBYPGOpzBU8vJ947Jyee/FJ/cGXH9fxZ0/qrZ1O36WofsrPgbfcF1VV6K/AJ/X2Ad+S65Bns1AsQvvXF7r/zoEWd7hY2/MWadJcFaHxU+BA7oQDtXUF1uNmnRyg9VswGPI0s1rwHEwtenSyr/wJRVRIIa1AfJo/cRhQrp8DwdsbBw58nGRT2D4BveNd25MADGOnwByLlvLwaxDcUknjpGizAXpaceCOzbq0w5tabrD8MGQYxxxAc7iWNex4WHcY9K7CZCVIuwyQiyyLyruXMZfG56s5U7qp4Ntg8JpB0KJNab6pk5fPUlhP6fkvPabjz5zUO7zH+hF3s5/z9p27IZdTSKoo0Oy31GmoWpEBobpQdyB+6tmrryB4iZrzERLN5E9jIxUhRXALCYJxMBFeJK18sMlAWaD0q0SerHTD7IbmUCLYhAUD5ybQFmnlsMqwixs7sCkgCs19TuOk2VLGbegPHYK/BNYQtEP2+uOQbbs8Yy1UHJGriFyZwhBLZfNsfgnC4WnZxjL4FguHkL6Y6H/o2yPEDR1Bhq4HHWqCaYqIQOwmoJDGouqk3L3YndixlDDPw7sLqtulWHboZlPesY5dOqOnP31ZH//KZZ35gzP6zc6mfsq3wV/wHH6TXcgpBRFNK4K2KDjM+WLuWPQZ2cxn0oyffAq/Iy74llhviSF1oQigoJXzMwIpGCtRsBUujGAMoWqTsD0UzqTZCWExwSnVxITVB33wcf6jG3IOLimrBC0sEgfrZNmo/VkPN+p7nIzUw2MgLAE4OyVGVQUx2NoJsg+cIY7FVSbZWesfKw3r7UybZQwUKa8m50SsdpN10ILmDlgR9GooJ59UVyirmgUFzWKaq0AL77MKO1fSjm+DM4qKXauUTWljW7sXT+rxTz2iZ75EYfGt8NqpTf2E3fx1dq33DgrvmQu9KsdMReb4i0xCYo6ConJhdfBdF6hCYrcq1+6pv35PhR+zUaYvJw7sFJEOAb0oiEajsvwAABAASURBVHFMVaaBhL6h9l37L+gbFPhzJCUnFeWnwJtdwk5p4lS19eyYrA0N65rAY+BMjXAu7wO3AY6wCsm9RZ6lrhdmAnE2B9rhnujAou2GeQNTxjY/gdUTccLaYjQVccd4nuAKOakQn4CLpGLyA5iqFdNAI+lcoqhEQVE9kh/q+QFaHcXk4uKVQ+nheY+1c+6kHv34RV354qM69Ydn9fbpTf3wQdHPeeH5HkXBQXtRWOQ65qfVDyaPvQspOHnD73nO6nkzL74pykGiw4iDfTP3xkMtpx0f82qfJpvar65Is2rFN1AbkOGwZAziYeLxOB/DAzDMG83bPubRueCoMpJIAZY1o43PKPFCj1x5VxGqdgyJeCRV1QJXaeXcwqwoLYwGM1b8rnA2xnp765ziOiioLKxh16KgAjn4dlixqY7Ckh/eeUEqnrO2zp7Qo594RE+/9LjOf/q8bp/d0g/98H5zoRvsWvlaimHkt2goh6jwCvGxAnDklHakRG2p8BPiAd8Ss7huOhC+ET4BnMYg5meDzjyICbJ4kI+kjkfT8Whyo6Phb894gB8UxT7AJeOLK+HTWjuPZk1lkZYmhiOYGlMeuQ6NWk59a9MoDh9w2NOo1V85DYtRoEt4UQDPJ8pdyjwFBh8jZgp/O+RbYXjX8rMWRSV2sa0zJ/Tox7kV/tFjukhh3TuzrZ9RWD97r5d/X14UejV4oxwg80H2sCApZkWlIJGaYhaKkHqe/vfePNDB2zyw3ffvib6KMdhoCN7IQpqpxIz2M8kXA3wA64o6LTHdyUMRhioVvJRnc0G7iJAMBf+D5dw4+dPyNm9YNsyvw4MmE7Yqjrq2R+5i+Fk/RQ0VEGNGZrBHHeHOAYe7Shz2a9ZqccjKrZ/tt65DXlMvRUfqcJjCi0JBsUsVg6KqhTZX3a2gM2NT8nMXPuJWuHnqmC5/4qKe+9ITeuST53RwZitvg6/xkvQWt0MPzGM1zDOjVIwzGcAkaviYzdqLEHXMM0VR/96+9n95P78t+p9GyPbyx2NoaONA7uADUFxKmP8wCII2P/OIFJFAJLTycfZWhE9T2GBMdYd4OxyGCynHZ1Nr4x3LaDK5KCEXV/UsxVeLmN8q64iPLe6gpFfh55OSfS1d8eBIZYEZkAu3dDqCC3QVhTzktBIUVC6A6ZzkQPtzZBePC4xboRL122EWFu+xxDPYzsljeuRjl/Q877Ge+Oy5/G8Lf84z1uvcCt+7Jx7eQzMKpd0K1T6kzhCVD/S95Lnz60DvcL0nbhbK4los1L97T/u/viO/PMVTNssfYnCoBDuSdyexa7kRvJw3KANSHm2MNX1MOwXtl/PRSZYNhd7vY6thn8wDZrl2CBq1CBPejSyiffiBQxmwEocWbg/x0eGSZgsN2c5OgIMHXCWUHxdURYrtRCC3a+KSZoSciqCnJkXAGYNF0ACmJSkT2QqsTTYLJIoryoaC4pGBXAx/IxTfDhfYuB3unDqux56/qE/9yVN6+guXtDi3pdf3/ZNOr3fvBxdGqHP/FLP7q6A8LE/Rhzwu71i99bQpsxAJyN8S+3fuqv/NLck/+WSe2Ir4mA5QJ2VBQNtFQWEpQb6MIxJzBfZAH8QyBNXY1u2JqSm8Fs5by48THuCCwsqRSQ0+8GlHhM0Bpoxgivqow70SiN7LCMurWLYk27KUzALHN5aGgcNGfRALxg6QKqPCxQNhqKja2XoWh1Qwc9T0YNYO60mFRQggUIByYmcaKROvxIZEQVXwLstFpR2VxZZ6vhlunjqhSx9/VM9/9Ql99KUL2r+woe/f6/WjmyULa1E6RdcRo1MPX1p+FA9KDnIuwgZ6UBhPDxaSXQopLXhxus8OePDWXZVr/Pazh8Ix04EQ0CB2Qh090Mg7qjHJXVwIFVsSt/PEqNuUcrzzgXbUgRHIgD5kIOVBzjJSWJ7wpH+NEB+GxGDMQBBy7aB0gFKj73rbvAu5D0P+mClsPv0A+CGJzuYasIctYDgmovOfWAaHdfIwj6ovTLBGrLe1HJyczgBfrV4s3y5yx2KC8/YH5dlKyTP5/q9NeEkqdqzC74Wzkyd1/uOP6cpXntT5z13UtTMb+s7dXj/gF2jeczJU9wM4PJd0Wg+n2cMaI28GWJeA9+yCA2I+eGtP+7+5r3Kbr4y+b3YEDUCYPDyGEXOJHWkEXzSU2JL/UFH+duuxzCgyflxXgouIHS3beLx5sQ3zk3MpPu6vAXHtsGVVxRhGhQc1lZvBuvdD82vUcRq/pM7UpVuRFVcUUfDgSmX2zSFIztKQ5PkzaKQpqg7VcNidPUCmDk04FpcWVGsBarA/ToUAfg7xZIYXgqu2GOYNTzAIistQLsS25G+GFFd3/LgufeKyrnz1SZ359Dm9y3usv+ZH6O++2+s2X+Y0DCYKDDuRhoeqlFGl3dRzZTrFQrgXzZibGU9r/Y0H2vvlA74l7vE6AscsIgbBIcYhL751s5k8ngTfZMWXDPnbrHNvmG+rGP5rDYqsUGT++7JC8RWKKynjLkC+2LLIHLcuHx2Qep3popDKAPOGZVP5g4fHL9Z3gLU0ghRID0wPI3c32uAw+DYfa4jHuN0V2vTqSANHHySHNgO4cybRTYZqgKWx9TQbfeAx0JiGnKtovoIWmOGHdgh4IfsM4VBxQixE4RYiqKJTAPPF9x+KS0xwXuUusAYWIX8v9Jt3bjUdt8ILn3hUz/0xrxs+c1bXT27px/wA/fqNXnfzW2EoIti6h877Ir92MOr9r5AeGTO33oT8ED/UnpIyBhdhx7x0C5worp5b4uLGvsqChabg5bzHhZ8ztg3A7rpeTPxqIAopYf4QtiQXnnevpMTIcdNP9tGpMFeGoFJIICJ8ljhr/UP+41rSeuRHPQ1Gvs7F0qeXPCEJ5ogJKUbKbtdAO9h2dHaiJUchpQYHK+nTCslUdJ40LctTenIqTtpq+GShHLCcaUsnWKOCiRCICEgtqNBMkZM1k1ik4EoNJtUQVC4yg8KS37z7IR4EO9aFTz6qZ/7sKZ387AXd4Ccd/074q1sL3ee9JsGIq9o9qZBQ8mXBBTU8sDu9ChzMUHxj0cEHOu/oHWE6fu6Rf+rxf65/l3db3k3m3PZME42Hkm+huAy5WEZsS+xQCXTxUGwq2ME8B5GxmZuOLCLIhPzlQgtFRMoyyQEikrPXLJE6xmZqvekh0CYP/Oyzjubf9MhecyP7oJmKEzBEZi2YcMHY2oX1FkwTGNPHfhVWp5bTWHRuY+CbK5h0yeGKxtGDeQhCNHjCKiKLbHjeYGLHosoHXp5R/ADPg3vhwXjOt8JT/KTzyN95Qse/eEnXzu/oKrfAX9/pdQfq/jq6YMMZk3B6hvyxwweB4nJj6l1csCo8yJe37qm8fYfnLTrJrY4g+wuJb6QyPeACPUBn+B0GJu6mWoHjpj6Uhe5iT8yQmYtFpzgIIPlP04t/WjIILS+iC6rBY5nCAwReF1aLtScXGXYqCmwoCVwmsM1Al75rtLVpNssDn3246YCAduCIw6aqNlfROqp6nzNxd2CgsB/k8OGmK1p7Gu6+gSuSopLhVfROlbdEX/1zhkCxcXX7P1gtLixuh/MTx3Tyo+d0iW+FW5+/qHfPbet13mO5sG7vebhBAQ8dO4d1DCaCy0XzcNCQ6ow5lEJZvLfgWWs//+pU9/mWmOPHVqgUI4uNCrC+ofXljFwQufvUsckXkOHnMZ69ZAy3zcIt0xDUu7X8TbKnneMYIZ81fkhDLrxRMWHSZnlkLByGzYe1E40dBvjWOE4cLoMaru1cZt8PTNQRZhdXVr8c8QiH91UxKzktrbganUlZWFAXGs9T4tYibi3iFqjC8wi/F855QXrioxd09sXLOs6t8M7Zbf2S3eotvhX6Vug1zfDi87D0rG/ALYfR5EY9dMN2UvKfmPhfbl7wjFh2NxQUdFzcUVya4NFjikePV1w+oXjsZEKPn5aeOKt44vyAi4qnLql76hF1Tz+q7spl8HjFs08qnn1aevYKeBb+OenpZ6SLj0m7p5TPZF6+LKRwdh+MNqYVz6Y09UBBTp7lFceHCPil/2Fzl8VhI2BzZj1KYulaluz7cL4Yc3HsMx3rtLknwrBPwo5geEgVkxUuqAHJU2glb4c8o1BUAv7H105+5JwufP6yTnzqgvbO7MivGa7zW+EebwVK9hHKfOi/DGhyo01f8C8rPoPQlIi+nfnW5DtZvz1T99iuZp84q43PXdDG589pzi8AM/gZO+jsxUtKvAR9iaJ56THFHz0OKJgvPqXO+NLT6r50BR586Rn4Z8FH1H0ZfOWj6r76vOKPP674k0+CTyv+7LPQF6TPfFx67Alp5wTjc7Uzzpy3YN0qNH4KOsA4og3atNA0fWAsT4Gvrd44RmD3fcD6RGuWMTiNMgw7PBpaiKzMJevmEwyd2FwyRXMGPtjcsSVjpbCsYLGUsBBSOkDVPuYbOpSAAgugLCzL3AqzsDYkiit4vir9TN3Olk48e07nKaxTnzovXdwVX9h042avPX8r5Jkl6LuCqSiHIXSHETjSFbZYg30LcfsHof4gVI7PFFeOa/45iupL5zX/o3OafcG4QFGBL4AXjYuKFwG/EMQXHlE3IF58FP1lYGqYB1+gCD8PTL/wBHbjKemlK9IfP6v4Ox9TvPBR6dHHJP+/VjAn6jvyBiJ/1Q8ZIpUROORRrQUygHWcbi7VaWLzwI1DfoRox2irimztCUQkK7ZBAlAyxMbUnNGh4Gw7QN8K6lDyNLNvBVHHI6SRN+MJACy+pnCN52uHmTQUWLGO4gpPID/3FJ6/Yndbu0+e0fnPXdbpz15U/+iubnah97gd3uO3wsKtKoL4vTKVwvTCDQf6AjuB56BB6MM5ue1R8KMVu2JPPz3f2vpTWyrc+srjJ5Lq0jElLh6XjsIF9A3n4c8BU1DgDZ07psRZYp4D58GFk9Il8KRxGjt0a4eBzCUuNgVLCDx2OX8jx814k+KaBwNUAwqzkJVjXceaZ/GtOw36rJkxJo2tt+yuacNtUbSfGGwckMVEA1MDT5rg2+xQdzACX4Kt+dRSDAY6hZBHeEICPyZJiRkmJs8PuVlcc822t3TsyXM6++ITOvPiI9ITx/TebKZ3WOy7/q2wJ7rjGNPY5q3LtIMhGIKuItJuHXnA51AosnxedXvii9caxV8O6XNxv9PBgxm7Jbg30/495LvgzkwHxi3o7ZkWoL/Tqb8NboGb4FaoN5JfygvrEsIulTuhwtiKd0sKu1zbU/nNDeldcI9EGIoCH9aBzDmbpx0CQ0CGd+5KR7QPO0ZvHOpq0jJ5U699goi2WpdgkiwbKdPC82jA+q9GCJwzOMwkDVwghW8AxXrk0hdUFRkEHQpYtzXc1hQfJ4CdA85dAEwaB8hAKaDwzvRQuLg2ib8BZuoorK1H2bFefEwX/+SyyjMn9A63T34z1u27od5f2T2JDdO+3EfqRaw1kDbDVEMOd01XbeTs4rLnb69PAAAQAElEQVTNOxjr2rPYi7tFizsD+HlxcTu0uIXMrwKLm9DrRf2AAq3o1fNseBgF/YDr+PDyt79Nh3z71X3oG7z6+PqvpJdfk96A3rtTB9N18kR7vk1RTo5Ilaff0DgvGj4FjTGIJg5UkuFkZoK0WSafOjH0jTzqaTIczJhnfpBWiBtUBRyMz8bAQt7/GHwHJ3dUWXOGJVODyck0KvXtr/CMpbIh/1aozU3tPH5aZ3kWOf3ly9JzFBYT+hsW8C5v4AuL7SslmCZHXYHT8DykMvKcpyy2iWylfUdgaz6mjmGYN5xv6ZjYCZquUT8LZUESi+c1fyEYQc46oLMV0MFBr8J7suJ3WS4Lri0F+ltU8ncoqL/4ofTtq+xc16QDtlHnfWjc9Jc6UxwGAvehjw/XhPyd44ghPDtpdo/InozTWHnw6YzFOvgyUGbSSjYs+8AecaSFk5NLmB/aw6pQBV6bQu+FJJbosBlzKEXFrbCwIDHf0Nblszr1ucd18iuPa+/KKf36oNNb7xU9YNfwIrR+VEiImDJKalvKUGTr1qFB7yLAFkAfBLeZwv3x3CdjRrxGzRuWRzhHQE3WECQdQAO8dVrmbYtOdPnmRXfuq/zoLZW//on0yo8Vb7/FS9U9uduIUBAuhrOQjaIgooER3ueKAjGU2lD7WNdgXeMrdSSDiaQdOq8pxJ7WVViyV4PUWfX+cJSG9/ek5+pg98qtnQPZXa6B26S4zSUKz1qLwG+mjUdO6/gXntLWl57U3rOn9S7pvv1Wr3vcNnxBd/TTccsOBptDQmZWacvBBZ87d+qC8R8BF1X60dp8FtakrXVTTHcrD9Y202FRlZSxeTwj6JdD68BNLiQX1AiS3aT/06E4FtKtPelHb0v/xoX1qvTeu4xjT8HAg7ZkTVja0ERwFZp8iDGR7GmMczSxrbL2OozVaG7hyWt+lg17GWK16KkAssbSHAfaFg1LALYtztjQVx6xHdY1foW6ZcfQAYsTLGBFR5c8W/lbosG3QfXI3BIC7/kjZ7Xz4hVtfvUpPfjIWb0bM+a2aJ/bYXBbcXeJNr5GSW8cDnEqj5Iji+2QX5AHCWP3GqcPfLazr2EZl9SZb2i69CGOi8026xsCfeYBtW0KtzOss/8WPqeYl21wY0/le2+zY/1M+h7PWdcoLIpKm9icZFnQwo0hHNkN1AdR3GPC8jjAKjAMr7g7bRgMSayDMWlArAeKUmChmcPAWiQq0spBpiTIKvn2N0Utnmw1aVBIuCAPoF36maId43t0lhtwLxRVobUamI2gYGR41+KhXAc0RJ6dP6ntLz6r+Z8+q/sfOaMb7AK3rvXa511WsKuFuGZZyIzpuCO0nMei3BiErUKjLZqNGM026kb/GP2Ffx3nMkbqEJcHTjRR5GmpNrcSEzuu2Z6pT+o2G6E42Sl2wXv7Kt9+R/prCusHr7Nj8e2w6xXzTgqnVYujrZc1xqCV+Qbc3WRAgRYNE6Ppx35ug3WqrryVwP3Z56FzwTgigj4MsXOVbEUQUoN3AKMFwZrjN8WJY8mlT1pRJ8VGDOVkWjdFIFAUdI0XPBMFH7zLkh9+eZB1jXWPntXs88+q++MrOnjutO5iu39toQWFJXYskXxv9KHeoK+24wQXsyGo3IlvmUA93RmpG3jLDU1PrGxn2cA1D/MJTjm+1C6Hj3qlXcqM1/HIsdpQclSe9u7bdsaiLXyPMx8b4N196VvcCv+K3erHb0jXKSwPfIYPAyn9ghDZmCAcQz4OPS466vGoBkQzFY5koDx8DPGmBteDYZ3NpqsgLkfVOXIVGI0Treqjz3ZsqPN5tN9Ea/eJeJilW08st0nxDcl/ReCrMgvrC/wc8qfP6YAdy9/A9989UM+tUMy5aJODc8ruw4CvxYUAz/wr4QKbyhPe/kb6renXdSkTWlN4QG431X0gz6Tbx20N80yDttEfg+GbYfG/SPiyH94prJ/8XLrpwmLgecUcUDvwvh2uJO9AJIOOSDIcfgnbl9Lvj3PcKYhsEdIORqU6b6PBDLvY4BHVilT1FgcOXTusgR/IOEKKQYavTt93ZAeGbxl9LJD3DsSdUHH5nLrPPav44jPqnz+vfX6s3uNb4YL3R8Vzyg7gwvIVtAS5E6LqzZP3UmAxrKM/fLJr1iCVuZtV3xpr6jfxb+2SWt/gsTY+uMs0CF4EW0egq/A0JJj54OdSeccKEnuXl2c8Y+lvuA2++kvp9i2pR+ddy8hJOJD87mVaYG7L4MLjhuKw3jnyhzw8znQdmZTIfFjSpjddh13xZF0FbPUjorWHkJMuLwAmJ96AmAuUMgJROPCEb4dt5oPOjEwNPikGN2CByz6TxTsrXTonfeYZ6aWPqHzkkg7mWzpgtypAe/gz98JfPUxSAiRdyvmiF5ELWA0ru076u12LdzTNhcfNNAcFn3GIvU69rob1psEFIGBqmBcT7VgrYE5iMxTsWL6w9B5F9CMe2F+hqF7jfZZ3rPw/a2LwvcHVxe1Qeb9nS86dDOoi85x4wBoSNL8Cr2EFIz768BiNwZqsTw2BAXC0FURxxMG4ygD7dplTFgORTCECNppqolsPR8rpouySFhyVbYxWP3QsHHyVFU8MD+px8Rw/xj4nvfhRlWcf0WJrl9sg1x9vqOW3097dXBjOw9SwrqHJnlv7TFAXtLCb9MC0qI5XysQRlxShte2xgxiw9EGPW8bANqVtPVNnH2J5nFPQWjn5FFbhPVbxawf/+xI/vS5999fS1TelmzeVOxbFFexWhvKf36bAvGu1AvP8JUgkO6dT+qzrteS9SaROrBZ2DjXZ+VTgj73y7YyuTiAK+EN2sZIaPm29p1Q80A/mI9o2yyp1P00TMIAjO4rhnBM4FJJSp/ETyRFkzvusixekP/yo4qU/UHz0MWl7l9sBthsHCh648gJ18azDhTXVecaY41zYqR4+EpILxWMMn8SHbpJdp47TdOZBtoXW+LQ1j0+u6cBnLPMDsl/ycnGlDf+cCj+8+x2Wn7Xu8HB+lWL6/lsU1m/4VkiRLfYU3UJZVBQYr+wphn2NVEORZWEtSMYYOnVCTpJ+s4BMx85xzcOJGBZMgRfFsKphXW564tlkjKoJY71r0iru/CbvB7tXu3MllSpwtsWArceKUFX1bANwY09AhOL0ScWnKayvfkbxySuKU8elPfR3F+ryXRctO2R/S4KKNlIoPyaGBVPbPRLz9jNNHR2at85y8m4EMHkdDgMDBakPBDGGNc3NpPEjXYvjvjdp48LaQfDvhq/yQPkdCuunFNY1Ht4pLMUBxQRcROOONRSUn71GuKiAi6wl4LltAzJvpEwuFAWBSYAdDN4ahMMHqR1WfpDG0UAWCJT4buElMf39wvEz4sikNF5Nc16Wnjut+NQzij+8onLhRJpyQV0E24xwh9S2oAma822KX4WU8M8jU3md9yImaM8tSBtQYw51fMKNh1McCwLt78q7Hsa2BOXIdbWObv3XyfLLUefKjqWfsmO9zG3wxxTWu+xY+zx3tcJyURncFuUiy+KhkEx7qGF+7MCdHAUncRQY5/pht3Xdbyu7uFxYw9bVZfumtGFEWoaTZ6dhUH0YMm1C8nmLIH7xQ/zmXNreQOJ6us1Lw5v8hnbvgQo/yBY/W4Dwlby/x/wC9Pljral1poZ5w3yCq/xgWAA/7HohFsjW+T8Jcx7k5c0sh4Bck0Dy+lg2XQchDq2lfYGnz5uEv1TkBZIK4vnwDLvQfbHMUdxgrD+5ofLyr1R+wAP82+9Ke/wC7yJizOPtz7x3qUZdTLUTJozkkndSIHl+9CbBAl/of9yfyK+ODwZ95ckjGVOAiTNHZZge+hhEqwoaA5WPVJkZkGGtHORGutwybG2a96FeEEM+gaL6BNMGUsNEaqvFwQqnkroxY7bycvu2+ld/of7lHzPRrzHRv1Z59U2Vn/2m4rXfqE+e28Zr4GcGLxdfM3h7/ZrBwrwGfjbg9fek19kFfs6u8HO+yr9xRzLM/4Jb0FvsDncOyIWUvIsxBvHtTqxVopBhyiF9ICVGa2eKOM4lE0EoeT380F74Vli8Y/lfen6V29/LPLz/gBek7zCWfXIUF493qXzG4mef5LlIXFjMVVAwQXFF45FlyB1XlCbTt5S9k1Gly7VAxegZHc902OxrjP7YUXM+8khX2jfj6DoyGq1WcV2ZkA7EjY1lX05Dk88g2wl49zOaf6SOwRKrNjIzwE/FfvFBg/At4G3/bvaKyv/2Vyr/+9dV/jX8X3xfxfi/oP/396X/54cVfwn9yx9Lf2XwI+5f/lT6S37I/aurkt9k/xU/kyRe5yeTX0hfZ+G+zs7wdQo2Ae9b0E9vKK49ULCj+e8QXVt1fQKdRuTuM3nmajuSh9Cw7mM53IY5yBEHc0pBFX7OkW/NWVgU/SvcCr9Pfi6shXcsFxbwOy3Df42Y2FdQXDEpqKCAEjVpqVHrzUNHnWUWJguLnDQFLQ8dmbS1MOkLD0sIHwk0ULYS9IUrB1Jlzkq0s7LIKC7xKQglqc00H3kMSmj42G1g7Wswj6lJkwXDnZXCBAHzUzAJcYcr9hcUwivfoxi+Jf1b8Nfflr7+ivQ335G+AV7+rvQy9m/+QEpQZN/6kfRtiuxbP1F8+6eKb/1U+haF9i0KzX/r9G3ebn+bYjNeeZ3f6MA3r6p8l77eYGe7s6csKh77MiWuBerdwxiRGXvyBgiqgpnxlAEri4XOxZU2OzrgvCiOSeHnx1sHErdCfZui+iF5vMuue3AP4x54QOB1oM9djHYUmHx7pFi8Lg000gqcw4Aghwbn6TbVlyasTcoF3oD48BBNnbrpKuxoNK15wEFXEjHlT04sgvXIY3GNnaOs/OCRrc0brETa3+9EcI7387AtB9/v8crhluLmu4r33gZvAVNw/R1FAtv1a/AT+h78Deveo+31hG5e5x3RDekG8O9xxo33pOvGTekBi7lB/uwkZSPkR7FcN1QeoifVu5JzS3i4hu0jUAy7k4tphAN4Ye1nnh1L/ka4QwXz7Vc/uia9zM85P3JhvS15x4o9ppmi8p+0GoI3vGuZ+hksi4pnKm6J4oIUBbYK8qG/gt44yrbU2TdH9rufjgxxpDL7oLhsrAhmuKGQtEBejUyc5eQnuoyQp9o+WZ9WRARPDDFk0N5x/YbNvycGP9aO2OwUBovv37MT5lmsfKNtavBgzK9Dqggo7TZYSGLJtyB8hE+C9trdUlw4rnjimOLitgp+uYb7JOuC8PqZkmpLj/VS4ihd86V5HpYdw77ZHzn5W+5Ndp7vX1P5xs9V/CP0exT6giIKOvbOtLhPHxSZn7m40GTwvBWuem6HMiiswvwZgtKALlkN5rIMEFROPDABiw1olBuKGfvYYJ615rYC56SLwjZQ0OTR7Kap8Alra28R/+w3qRXY7U8Olnigh6BbOqUwiPAc2dYU19XDyjVk54MOnmlg7MjjxLASyXs14Dtss6NAT9SLZvg0zM3jd9Nc3AAAEABJREFUyy3H+oLeUGd9859QJ+6B7lJQ/q9oHuEl7SmCovPG4W/+3q2C3cgpka6yoAjnpqugke8ddK+R0pd9h6GIog52xnCB+RswvxUWPwv+mG+Ft64reKYKdyoKytXtAlsBRefdykVFgRVoycTcyYCUMwk6r9SFYTDRSsh6zD5I26TBhWaVx2o0/Qq1w1ThcMagN2mYuokSXULsH27kZOjJD64VGj4l3QeBxOHwC4gBm2MxrYPj6zATIk8AV1xeeTw8p4w+/1yE+5EnrYf2/YH6fn/AnnpePfRc2cWUq7hnAXoWpDc/oEAT+JT05fWFdcjK/xSa3YLYBJMO4BcHip0NxdnjKse3pFnkS9pur1d3AJwfxZVFRZGQprQIxhoKiiiK4AfkbHRVZurUwxvWE1r+EXoD3/fuqfzgHZ4buRX+5A3FDQqLschFxXhE3hp2rSB3tQLzrZCiUmJIhoQ8X0W8zU++l+WADyY+86PLmtQ0WfNV6+V1ion0PeJU3ZU+jdfwCagBOfKwv0H9BxB5WWR2cDcHWR5WGEvNh+PcZgAdyCvmQlsHE5WLb5oTeSCZ5uRy9bbJNvWCcKuQQSEKhIF/DEib7cjyle+4Lhq/32JmywlWnuKKLegBQ75fFP4VwO+9WmEVRpgTAzVvwObReFPDSvsaln0rPs2O6L9y8H/67R+hv8nz1VV+hL5zQwpuhYyjUFjFz1dQeWzePtF7TOJCky8KikbO33M3hecwZXc4RUtCR3zw45gaLBrWvV+92H4IreEhw6Cg0n2nYspT0RUWwXVgyKeG9HC0QjFXcCnL26qp0Z7PTN02hjYOYTnFPHG15cRwNXriWhE0ap2LIgvExbVP+AEUnH9nqxiK0O0MtxkQA5UXZwRjnLHoJ3ekM9wS57zN9Dr7B3H/lzdF9CNlivBw8Ey5eeBxFHYv69HiW4AUFGSChrGF7mQojgH/C3M/ekfF/6XOq7zLunFdfJPAa18lC4pnLO9g5l1UjLdA29iCMQW5+1bo3Wk5FgrIxVUK8Y5GLiqLq5AiAkDpmQGZUWj6cQzLphXZHv9cQ8exuaG6NElOo4Em6N3aoDf6LsD9cRm7JfYjj/ezrTeY+rqIBruzyMJighr1RDU+C2sf5wnYmfJqprCSNpnFUCuiFer+Bjg2C5QLw+i0vS2dobhOUVj+ZYDiKtwSCz9+27VODt239E0NVONRmCrS56ygURYWCxBshJGFJYX/uuEHfCt85Q3JO9ZNHt79n2dTPHIx+TbowjL8bdC6BOP2uCgsJSbjaHNEnysrypwWwFJq+Zkmbd5YWo/i7NFwlP1D68ZcPENMOsXltnAm7sJ0AqsSVCSNczBQHTFQWU/T5hO5YqzGyuQgZ1voqGci83bAjmSakwufhcOkt6JykTVbKxxTdl0e2GSUaWzfXly0/gZ58jjFxa6166+PDJ5naa93pkDehV2o8gxgklrqmpzz0OwInrVtZELL1P8xxXcprJd/ya8LvCT1KxDf/oIx+PZnPimd+xlrBfYBHqNzBsHYAion4XGZHgJ5kL8aSKcey/WCQ4VfrseSMguDfiCYrDNgUa4f1hro3d9aPLTD0bFDBqhiV4nPQ2PYGADhKDgvoUOBS/qkOk+WUTWeK9xtgqSCiUowUUk9iRRNJF2wKxgH9AfQyUViio+SstpQF1IhXiGeIfiE+4zqI2z+D2p19rR0+qTKfK7CrbDsFZ63JLsNqTm9CppqiBUUXcBPIXS0VP7NOz/paKNI/k/sv8frBp6xyqvsWje5FfqBPYvlQHIhubAM8wmKKceEHVqA8oJCNmWMcnGZehzMF4HomgQz8V75KCJ/yIFx17HAO2fLDRhcZAV9G5tpW+NKaYe/jNGP2E0NWw8rKuez25oqmTw5gsMnzeKqaru5caaCUGobuMNHQTWBE8oJqDoPxJAnxsiuetoYC8YwwBOY7ZDNezJNp7DORTbubPhaN0EZ+KCvER7UsS3pAsV16gR9M1Q2jvD6+dugfzvkdue1yhScGrBsWJcFRkGZWpZnxO+vKKzCRli4FZYf8oz1DX4R+Ak/PV1/VzoYftJxEeU3WDo1P4LC8lj8ZcPjcu6M12No36ZlnYFeIBIkl0n0zkIa57TOeZUbjzm9PAnmH4apf42w9Gy2KcX60JD4Mf+55pmb1AVznnnQ7qgjUklDN3ARHYFajkWxZnOBldYeW8oTKviKnpEBT15L0JO7Aqpi5dkEmUmX24ygN4pBDKj4z3pO8Kx18ZTkIvN/tsY6y4VFUXk4FYyQZhnCdASM83M8aDahsEoWVqjwrbD8hB3rWxTVjykufmFQz09avufmLuUicod7Cgor+n0FO9QqFugYdxtzJoE8pVnp5EKy9OqRSc7HQNfm3nNrPaMRDom00ZTNC3ntoD3NV5Wpo4FpGuGhjmmsOtdeRp3btHG4GQaXFmT1aIEGHwY0sTfjmirVeXKrJVJFgh5oTWdp82QsdZ7UBeICdaXRisu3CoPFUaLaJXyBadAHjTn4ZuorZpvCOn1ccQ5KUeRdah+vYcdSVgtyS8fdw+ccQdXgcXoQbII6BUM471j5X0L798vcsfhJR+xYnQt+nxz2wAMKB/jhvXZOJGwex5Czkh7gx3iSdxLkPxZXS8IUWyZHaFkGKVca6AwI/dSDbFfXDmP6QGnFufqZcSjh7Ta26bf5uIGReReiGNKRxTWNWxAMyO92ZDU7guEQTFImAbWt8aYTuSCXiSzkhHVGk0dKfD/g29bN2K1O8qzFrnVqQ/kzUFtXunUWntCx6VRHmLRBHSpr0IV1PKRdWvLmXT/6jdQK6waFFbximLlAKKr8BviAVOHbDuYLIovqgAD2m4LO3dFKMuhGmURWeMuEaUmmzbopbP99Yhp7wmfe6/00u44qrmosmbw4m7NuPYhtFc2SXtGkgfqSMAYxiWWQkZPWq9XFVHKyLC93JQ06kY2SX1uc1BPZO52fYzY2pJOnFWfOqGzBe62mxZWJ2n8N9uM22J6x7FZ4QVr4SUcbDOw9iuP7FNY3fyq9yq3wOoVVhsLyw1xPQRkuKsGbcjtUu53n7jTNvfHZseTFSmTPQ3K2weYYC2fbms76AVYnax9CJc8JPVMMMznQpcSQCJjseLLOGBWO5ZhuNMABp8DXTRoQ8+jyLK0Qh6gKc8AHwbIL0wGCGgWKC1nkWezzQkhYYyBwLLm2Pacf7eVJzcJh4swbyAVqKH2cAXb0AmXQpQ1ZFJc9tL1FYZ1SnDzJFs0uxkbitwL+Dz78CFPYjgqWQkbtiII0wK8nMs4W07ULeHjX9XvSK/xG+G9+KP3kVenGW6SArnPVAu9YWUTwAy1QYywu52eQayGRYurxQQUlIOl4fCXX3GePMemYL3na6lxNaeHDWtOEbaC1VfpVD9Qp+VXUdA0aX70cxVyD5QFWDawcJHkrBzBdMtB3JW8lgwGFsMSAzMImTT4p+1TwahD1NPBk74Vysg3LwRUl7ydMkHb701HypsieaMdIX3RCV5h8f6MSVCyM2oJYTv4AEzvBrFMc26a4jkF35A2lY3PJwsruQ6K4EoxACaErhO2V/6Euu1fuVP6tcLNQSPxW+MM3Vf76B/xm+CNkdqzez1jsTuMOBe+dyi9JE3sKZMMFVrg1GoJWkCuFptzNehIAHleDx8W4SQwbOagioEuI7ANAQ+PH7AiYsQbsgUxicI4HSbnS5uf4aMZj4jL2Zd9gDeV8ybNeAKvZdo5QvDhmBrjbQoNBXJLUYTU1RktR+qMzHcFEiAQyiTZZ+ODMwWRmv9C0TWjqJ/00e+qP8uM26q/3XCjBTzxx4pi609vqdjp+pJY6fkvsXDBD33Ses1CYqsIYwvrB7ltix04V/JyjTYz+h9d+zE85X/+x9GNwg5ekLiz/LkjxyIU02bWC3Sq4NZoKXn7WckFlftxWXVCJ1XEEixSMLzxnHi+8EmRoOeF5Fumjs98IdKTatLDj4aF5PWiEU/NwHHgbxxjI5ukn/c03DKYUx8iVCYhzjlxnMaOhCCBNn7mWEQKDG5CNTJdQlXGgPWbaOEFj7Bld8oW6KtUnZfFBTt4UceQtTzDEW+1XxKtQ+2QTTkxI/kUE2eU/oX3ytMTu5b+AcA0EvyV6R8oios/cuIjhbhKsM2o0pEthlVOd4rgUN+8qvkdhfeMnFBa4zY4121NWrAvLReUXpqYuMlCsd1ElpZgorjCi8nKhZXGxc7XioXOWm/Xn7ISQNUKTD2NNfbPin3JRXdxKp1bzy3nETnzqQNbZRqeQkqhFNemusdkAH9Ohv2ZCiyZoPwDJh+2dT4fh2RYJVOghnzq0Gn50sTgKlSk9Sg4yQGEGMMg6GPjMxhTzymGdMVFaNEYVgovrgGcd/3Z4gsI6fY4H+e2cN/FWXvnXDx4TvrTzme7lvNx0TG+TCTozk04wLbceUFi/kv6G2+CPeYC/xY7VPZD8N2V+teCC8s86SdEnz/2XXSt3LO9ULqRGp7c/d2pkcTkvwK6rlJ0dST70wHe02ddoCvNeFeWMpjZVeUoxDRaTQWU+JwMmqXLd9dAPftm25cGc4Vu1PltvyDsXiiGokpKcaQbARsPlsS5XS9W6XU9iZUQdYqlOGW9gIfXKwQOzu6twDBTYay5mQAyA0IIDHzdwTC+SF8ZvvDfmitMnpDOnpI0t1cJih2i+6T+0tc5wZRG3bIWK/315nrPiFkXynV+pUFjlVXasm28q4p6CXSvigSLfXT0gj6OwR+oUugvQxdV2KWgYWUA9PQLn3oCeDIhdEnJueNEJ5zLCm0dgq76oOZg13PDh8BARUttoqjn5YravkX7EqT64jweOI7/KuN3Sas5oPuYZk0WvF7Srg7BhCSdufSYzqgfGCQ1wDIM4HIPdo3fmg4/j2Ce3bbyShzKDCgvmRwwx3D5hw7rTxCcXxsUDYqbY2VGcPaE4tSP5T234HdH/bmqdFM7k5DEF7SqI1QHqULx59/uwco2H9+/wA/TXv6vyKs9Yt/hWWO5K4wvSVlDcHvPW1ygFlcVkWhG+HbJjhUFhCSpoyowv1uC5amg24dNgXeMr9fwYjCH9zEv2C+SkrMdynstoK3IE5gS/yqPwEVXf8jD1nBnm7VKRjjjTmnlFIrYSPqP1zsXCYMyGE+puaSlxRRUmpZjSgmN0JS8ZDpyMhQTNqhLGR8lOrZrCliy6nIBicUDjTXsiFjD0QABrrQly8mIZsbEpv3rQ2WPSrv9jW6z7vXpuiT3j8jXlNso2SOx2eCj/L4V48PdL/XL9jsp3fqHyb79DYX1fus1tUbelGcUSwMXT8+y0Tv0uCwT6cEFBBR1BQTlHUdRy/wMKslH1YozOsIeSH2eRdwI+3IZ58j9pZtSJKsxrSbaeYbON6QCIIwfUMJ8x3SB9YZLi0A7kkiAXclRD2ps/1DmRW1UTPRODpkIuroGbEDdbipYMa0wfBtuBzZB/NwedUST51wpbFNWpMyonjv1XWuMAABAASURBVKtszhh2obCAXbwEQUYJFG1C5igoLP89vq5RRP5b929+V/oJuMGDfOG3Qr/H8sN4PqRTYC6aVjyt0CwbvhXazsUoMqjg4h159+3CabBcyKZCcGT5tz5q1BqNGpExSJPY9pqI2Te66jw1/M58V1sStAWfUjpyBVeVfZgUV/HKZKHHL31qsEPjYAmx4JdOnsjqgnLl8PZtiGLwURBKNvZpgsZKCheX424fU/GD/DFoh4P1mWvtt6bovoF3AB7eC2/e89/6fY/C8r/k98r3pNd+IN2isMKFxS5FwYSfsbK4kMddyEWDTDEFxWTU3cl6gF9JcPUzXwUIPznXAQE1UudcM8nC0IusK9hNjdTkKU3tBBX+Bka3lz/wk7bWOEZWGT41LmuZPrYO/tjSL/XW2TYFOo6lhnle8WU0XjDiBGMdimvp/ttx7slYb3WUzj4P09t2BCgu5eYah40O5YdxBiL78W5LZ84q/xkmz5uLy/Ci8g5J0JIyoWbE845FgenGUFjf4zZ4lbfvt96UZveU3wq9Y7WXpKYUmiimJbIjAq5TJ2es6y1b34CcuRHi38nR+jX9fXXoWEaLF43JlauCF2kdWZU2uzHgsPT+sFPD4Dn0VxRDxDIYHkLSP/AWCOXHxEAwiZYrsuYb0ulTinNnFFvbriNpsd7HILvxBif/52i32J1e5TfC7/Hw/jNeOdz0Mxa6OTvPWFj++3fe/vu2l+DWOOxiwdVp0BlZUCgUsN4XzgHkLmV/muVhHn3OzlE0nYZTtfs8KCBTacpjygOd5yv59RO2dRUyM8TcK6GVz9T/YXxt0KkNKDu38xGwzRh8uavIGER2W9pM7GPMwcHbMB706DPgWPqgXjs8sFSln+SNSSsfG1gQFqn4LyC4Jeos77fO8OZzk0Lzjma0nEyNGZnMQfCj+I0bKj+6qvLKKypXuRXe4HfD/pbkd1neoVxAK89UtKG4yoDglqdEzWOVt87+3BLdrzHMhch5OXbGMbUNPn4UMQJbDLplmzYRjAO7/SYavInJeemPbL/UVc9Igh6defdh1DYY8ZeBfdShrjoY24y01whoOWpMmDwoLibCTq4WNzgKtg9wqNohgdymwXa3NV0HrtlbO7lN40ffUXGIWTaHc1ujr4sn/9xznB3rDMV1ihen807FfxjI5pN5ZsK0Y6Sai0JdKG7dULz6mvTyN6QfvSJdf0M6cGHtK7jtBUUVhecpA94vRcPfBm0DYsc6CqFewW0uKF6xg8UAOV/xyfnpzQyY8oW2S4h5oXxM5CEsgQ82y2mEd4EZAW99pdWv+ogYtmj8RGpilM1YCorf7bNdQQuCvA0k1JkVPSFhS4aGZtXGm0q12yINCMAZdT0LbgQ2DfAgyEsJDR/b8I82iaPRXQ6wzwgim6fNEOEIQh7Ec+tDbm7L85Mf5mOT2+CZ8ypnz6rf3sCVFrYbzgNRpnwzjBmLefsmrxleU3n5ZQoLXHtd4R2Ll6Pyc5V3LOAdShRXUEwBbbLabsVEagWqfQ+6nAvyl+FcDDzs1cAI0TjBAfYxxCcAR/qg87wbqOqBrjI+F0ZYCNuALllO9OCdf+AwOHArn6qlIfrKuw9Djj/AslF1dh18YZcHmVKYBdClD4qL+V42wvWogOlaA9a08PMx+Dpdi+mWzPJkm5GTnIxthckwPRol1XY2UhjHb43XKzwIm7Z3Fecv8Wb+jDRja6LorJ4itjrFJlFv3eIWyDPWt75FYX1busmtsLur4hekBrdDF1HJAlrQp3dHwE4VFJmgoniC3cl0CWJHUeqZkzJAOSGFVIyc6IG3XBRIkT4wHGWA1yOIERkTZXWU5WlMt63AZ4zTohS5mdXOp7WjBOS1cMFF4JGQrKs2TT4F3oC0g5wyFvk1VaXVz2fHITLFVS0f4uxmg5sDG4P4756Qi9eqm0nHjysuXJBO8kDv+571nlGPjt1Kx/DZRvC/6/7jq9I3vyn9hFvhLR7e+Tkn//Ihb2P7DINboYuInUq+HZpPOOjDQC7ubwWEspymPFkBHAPy/7uD+R3H5PFWwW+E4KwwYFeOpmuNB9mFBSwZrcmUb7rfG23B6VfenSxvbCtOnJIunKXIeInqa8XfEp2uC4v3WLFLBjd5nvoeD+8vu7C+wzMXhbXBzzab2FphuaCMLKZWZHX3Uu5Y7tDFMcA7p3MxXEgJ4uVhXxjbjLQNOninZ+CxPGweYLI0NM5a42Fy0+e+Qi/IdjdgP/zhzIwPakFgjw2i9mY+UqChqbwalQlUQUqVRt1S0S1TjWSnW2wqaONtMF2PODl62isz8ZgqGj9QE3tm8iymKf14B5cX1T9Se9faPSnxrFXOnZB43sLFuzu3wJliF/gZ6xq3wu/9ROUbPLxf/Z7izpuK2YGCL5XqXDzsWC6qya1Qlscic/+A26EanEPjkxbmq/qUlDN50ikJca6wHjCVNICph+e92gsKY5Bgc+jT9ii8BpgGbevDbcwTYjjsM7ArZKk3Z6yYlbm1HKEcqVJ+LJkxNTqEAZ4Xz51ztHYZ2twUqguFoxrkjwdQEUxkMER3UeGzfY7CNPbAOy4xPC1K6gVa2mrswsAGcGUEAygUV+FbovxG/jwP8yd3VfiWmL1uMNDtTkHhxLvvcRvkx+evf1362SuKe7+R5ryzmtuTvnzrI54SB1JODDR3KgpvLLCBH+yBPXjuCnY9Q8iFGCXHUwg+gHxJHnn1qLM3+DB/tga+I1K3tAdxMcvq7APZbVJRlbD2r9pAl6BRxmzyQEX7jFPdh3MoIuAdx4BtB3GEKTgFukjK2T/Idkym4X3K88m3ajEfuKHpHMiwOIV1noaJjqQm0hpb/deUg0gc2pa2AIMrWsbpd0EGSnxQ0AaeifCBIOXg0DW7qf/FmjPnpNPnVLZ3qusspO0ZE02831xT+c4P2bH+kp90XpHuv01hsUthFkWhLBQKzLGytfmeripErhoLvlfK1oE2jkqXtkKsHBPxzAs5gUwAzoN1GIp1I5pvUsccnJAdqyGIkkAfA9yH7anHrsnH+ins63bul+YmE9AnU0jtKH/FgTedhINFybkeofC/0NdtqY8ZbcibL0VijmzvfHLBJhBiAthDh+2Sz4ZWPi3GivKhAgNZsQ0TL/QcaVrrIj38fgt94VuiTvOsdfq0tLlFUTFHxzrlRL75rsp3Kaxvcyv8xfcVD95WsGNpzuDZ0ZRXFrwa2JmY6XDfQyGHqeWjkDa3daITsJuRBaljsw955lShOerI8WAYKf4FuI1zMWo899Gj7tM7deTLYGFtK/LcYxyOAm2APeJwN0eoUdliwLbDwUegNC/7UD7sWmXG/Hd+zlBenHJxMaVY9Vt/3MgQG9/RjdvAGlWmEpxD/lgvpFVo/HgSG+zbeKgT9+D8M4//M/3TPHedZHA8dsmL+ytufd/5vvQ9Ht7f4CedPW6NLqz87woZcd7qTIk1FteUn/Zn3rDddB1jwhPGPhPxSNY+xsRYJ2apsGyMmjX/QX+0djCukZVw2NZleUU+bECvAYWVf7PU7Sq6bYVvk55Tr5FUq2OMF2gGjDpUy2MwDooqhQLZgHDQcnpVNd4OvprZCXxFWpRtyFx+tNMQh/ZNZzuJ5m5knWVTw4XkXajjW5//auHOA+n1X0iv8A7re7wc/eVPpfvX5L939z9tWditCrfCwoN73Snox/EanJuBnP1BM79Gs0/aDD41Z2TrB+TtZkWFQPsj46Ef42v44O5Q9h/juz8rcWl5J0Vvd9R5uE2GRLI+4RNyRDC3YU6CT9i23kDDxzYN/kkH/ZS4kFxcs13x7Ql456pbTnYxUy0u8XG8KVDJcUMyqbCgcdjMDcMkwbGdeYDL4cN6O2IxKUyOjJy41BAYaj/roIWrwBAFZhRobcdOcp9vgW/9UuVnFNEPfyi9/B3pr/+t9F1uhb/iIf7+O8rfCb1j+RnLOxaF5ThBnCB+LXL6dH+gAOfU9FNKcphKBX62WbcO698XjNm33AopF6JAJ/m4fUE2BFV+QgG1bQSKbJ96TuS19EdOOydYN/Ytl67spULDCkaASzHs1zA6NsWU4swzlncrdS6uOd0ye7wicrqFzgruHetHdLg8aJS0iL4V/M9Hqt7v5Igr9oJkQFYO64wV5SBYX0GaKk6MIpDBrlMpRcXi5CuEu9eln1FEf0NB/eu/kP6Pfy19nYf3X3ArvEdhlXuS37rnXzf4G6BBe8d1vMQgexekx5pIzSEnxX0N8IJWezsXpqaiaZLaP2OVFD/8yf4N660epl/3e7jsCA+3foDFjY10C6nrFLNNnmOPS965+LlMizuS/2OVHHukZyemaAn9e/LxSBqGAnAxZKEN+gcM5s3XpR+8In2DAvvO30i/fFW69y5juC/fDuXdyu0SQ7scvGNOZZqkHt2hC8W23xXEy7jv1/6wjzUPbxGYBtjRQDMeNo3C75uhM+IHLwnDO9aM512eteQLecGzrelkvBTXJhnMgQ8amxgjSzTLI6rBorkRXhSD4KPOvHWGG4ywh7Cuo6RO9jeav4vKtzS+KabNer9TeXBbusUu9S6/Efo/pFgg+8+Sxx2LB3e3y/bu00VlmAfeZQzHc3/2qxlYMwG+h/RNV+rl6WkyyqRZtllRrA8Y2WPuGRaUHMZbIXzQ3oDgl0dj8bdMGzT1TL/uHzI90oY+JsiEcUKlFT26I4908jhAux3OvGuBsiH/q9rqb5IQz73kw7NDhum0yc8m/iqpQEFjG+H+vzucg3s3nRRC5kWx5C4E9a3MhZEP9dzy/Gw1wz+fr7Dn7c8xjoLjT2Gfddm6hmZrsmnTmVo+CrYZR9mazvZ/P+GKMMbsolPwTktzvprP2LX8w6xfmvq/2eTLksY5ry26ss17ojkFxlan5fN9LuV4FVXf8fywaTn0UOgWIVnPGWnS0ldmQlnorpOKQpkXLf1bobhwDMsUk295LiS/BJ7RiWkrvKT4erCtCGtwuTN/KUgor2u6mvY34ckvtwjhQhfZhjhJrRtBnNF32d7zNwVRxhZLXoyX4BwwFpZQ/YwmQtO9h1ANYwOLBckQdIpIWZNPwEeeYCaHdUeCeQpqI2JL4cKa83tuR80sWIcDboe+Y+T4CVpUh8YaUIpbKrNjCWkLywz4sJepN+YlRKrLBEIRFTAKKaG1j/WrqlL9CtpMCmaNZo/cpsJwkUwQ8EHyMnzF+IHS1DI2Nbiw4OMQCv2DIhaKE3YxgRo/1hlNYd4YZLNr+bYiymIcbB53ghPTVLvItsQxhbQjyGgJIenoT6BugK1H4B+wBgRJI8wF0hp8xTuHRJBbRTTPkGABDDuWXFjsVjE7o+hOMFvMan9b/QGve/wwzzrhLNVGkmaU44MbNTAVWbiPlvAzWIcxVAhaOvgGZEVUfycn+Cn4dbxYnwkTYqCe+DrpE50G44TWHYFdAN2yDX58xQ2enbLQPIgR7GLolWCnGvU9RWMsyK6n0ymIVwYMRVVHUfDSaGS8AAANC0lEQVQd+qZFMQLZMA/Gww1GoTJNle1QTSliHkTzyEYwkamnY61A9TP6Ezyn1RTHAtIDOVloScURJ2y1H3sMgHDgbKMBy1G5epYDe61BcCvs5icVGxdU5mfVl7l6CqoseM7yO0bmSO1j3vPL77+d9u8q8t9Lp4jYweQC8w5GocSkA9GJUQZqXgppCtumsvh4FIVCTXacLiZYh5CalpwTPIT1B1+Kxj5Ecg9TZKwstkJGDYJfonKS3KeGj/kG4mYcqEc6eDyUHPKxArRRr3SOfhmowE6ByGEXA3Z5jLnZ0oDZLKQe01iNr5Y8r/imJk/2zPF63vjylF35cWnGbXDzkoqLi+essuA1zwGvgti55AvUm04OLsOMJyrqAPs9TPcVvHGNDZ7BNvjNzoXGxiZ35GRGDEsYVgxx4CMshyJiUC5JKJbCyHkoq8jBDAvpXkgMbwrIA3AehvkB9gl4Q3lLXODf4HaOj4qYMlyIRnZU5FQNexyFwa3WXsHDbUEQyyNqwDIcdqpss5lWjWR+CuWHNhzJPuQ0bXM0H8QOWjfADofHQLoMn044kh9sNJLHX1vZyJzl40WPHm23w251XrH5iDQ/R9OZysFtlQWFVXgVlD9Sux2+LZBjI5p0EhxVmi/A/MLRBbZ5UtokGFuhuNeKnUeOIX/w74ALzxVrWH0k8Bs6DfoJfEYQb+QHPYRJ8LnnZOCUHTfaE2WJ6txDHoJsy25HNEeArB2DdiBpNN+QinaysvEfkroJaON831YMgetEidHxiJbEy2HlaRTGFu/PDP5cIBrbu+MFzRbM7UKcJL892DhDDVBUG5dVZqe5FS5UDt5VWbwl9TxKubA0fMZ4gxzQmVwhMO7IFdvfpSHvinhALnNe629fkjYvSsFXTxeZ/7xiKJZMIiRZVjLw4hMKii9CaH0agKQsUuRhjHropzlMqZ2RPZDfBmpt3P5vA+L8zs0Zs8f/ods3/0ZbQ8uN/zDU/kbzdSFNkM+q3Llc0cE+w7OV/NC+wZpvPs7aP6ISu9y87qsc8D7x4G3q4xbB9iWvQY5pGh9TO6hTIlrCwbecnh+B2fZ0wINa/kOy29LWBWn7sjSnQ74lyA/8/m/gs3pox1H7gEHX6kfwQuXobVlMDevIjvx4GnG/DR6kqofPWHFtXJMazQg1Bm2sPQT6d2t7itiH7EM7OhmO6j0Ig9U6o2mFHjj2gBznEXybC7f+QAzt3WbsCV3lzRj0i8KxIBzWGZVtUx4kVGHPBu/gzABFUTzfHgUFVfxMxe1Pfr3ARhIuqg2Kiueswjr3vGbo9ymqBd8K8w28i5P+poc7pk85eaMPrDN2LvqmP7JGYcYd8xtRuMAO2P5IQFvnKDC2yC3vZJcUPJP566icVO5mM4JxBMEIw4qLYSTkeL5CeCaKoJxBgTdkPci/VFijqzYGhD11FIloX4HefdKTTN33CHIZfIv7BDLGtuRyiO+ZoikKcmFgDT38UWixmt86bW3W9Q+TB3+vh8fW4FcrOU7ardPRZ9VWmIOCDa3kteSxR/xkE7ynivlp9gqeqVhXP1cFRSXWtvCFriy8W/FT2gL0t1jGPWVROicHA5mC51t8kDlzoIgQL/Ipripy9mEPg8FRYLmDHVxX9HfkvIL7cOw+JR17Rtp5TNo4L83OqLCV+l2ZYkdUnjCAOehGFLoqLBWKI46CrqGn0A3LqNth0Wjy70Dd/CjUUAH5XUCzHNeHbbucEzEnR6GgrwjKopvAF/HDUXi3pBFuxxpwpwkXE1/QgnXK91Q8nAe3viyoTe5K8PJdiXEUHo3Kgk3FvxUafCMMXlhHSBGctPx4k/J8igwVcFPg1jn9NNoBOzoOBwHcJmOP7fDBb6QD3sT6Hzvr+MawwX1487QKFV92n5R2n5Z2nlLZfkLaelTa5Fa6wTdOilGbpxQbp6QNviTwBSF4n1ZxXDFvODHwx6DrsM9El5OEfIiu+fGrwzK+bccl+hP9a3ZCFeTEhGvM6yT9fxicwO8E8YyT0IrIOCcVxBz5plun9jHW9cjO50jYf4CgK5ifJg/WZM5cJ86Q41n53ZQ2LkkbrMsGhTQUU8G/BC/PvUtRJf7/g+y5W/X7fmhnrdmt5PVm56MgVo9WRFkzY9EMPsjsbv7vHLpBs0YC2bAjP0Ye8BDnv+jce0vl/q+k+3xj8P/D/HxT2jor7ZD0Lg+Api6ubQayxW10u+GSAp0hP7/Ba5udz7vfDgXpojTM71Cshos2ZXZKCtfFm7Bfw+hHm+012NYw2AIatK14nJweSyhzYgwPo1vYpvACjWCsm+u4JPFeSDzDrAK9d4klJN4drSPQVZynOBrOwZ/D/2E4g81o9vPIYO4LnedlYhZ2rLzLsJP1FE3PHannztSzcfTsVmXBOrNzqbDm/oLn4qESfuuDsnGbzidRRxSvEqmYnmzsJf84SSK6/ybF9Wtpj28P+9clv6XloU9Oyj4krY428w3FfBsck7xb+IrcZPBbDH6LwWbxsSgutF0Wz8W5S6H5tuudMHFFuSsmz+6Y1LoGdC681FOEFI8SxKGI5OJMeSi8LesfVxaT+99k4geUTRZikwtlk/xGWNdwlN462niHNubsHrNh5xh3R3a3kWf35CW12HXFzqoZjxEfiG3lqwG/Hui4mP236iPmUj5Dmc7Elgk61tEIqEDPs9IB2EfgCxvrVLxeLiQKSr3XkNsghSZhlyvDCPxVAVke6JtgN/ONmp+gUzTn6tGk6kOCsgbY7IdzbpXyG9p9vlHe53Z55+eKO1elOz9T3HuD/Cg+tlbtk/DBHaVvXgkeHA++bJlyzHyI66TO8ORsoN5U4dtLyUnkd06usNIw21ZpaLqR8vsobQpfpQsTn3AczYk3xQzZCOVwOBXy8QOvGFtJ8D6HLw+V98IcBVrg6zaJ4YtB4dmk8P4nwZVfZRY29VC/4skFZC6SspieT99+GiyD/CfHofKzb+K+xC8pxeCuUQwXCpALAzn/YC8Lh9dJWTw3+Q50HVxT2X8HcOfxK4Xetz3WJteFHMhPOQZJ1ENEQMWHCfJMMUdKoMJkVQJxPAbX1NuHWu/4lUfesQKjdfIpBRRuSUelCyUwRlAM6OS/p3Lx5O3yHQU7Wdnn+WzEewyGQfmZzT4uuD2+eTww3qEIubU+aKBIH/xaJXdFitP8g1+pPPil9ICChUbC/BG4/4YCv9gzdZsBTW8bvIiR8K2dPrRHv/sGk773torHYMpX72JKfsXw4wA6DSj75G3eC8WLRa2AOeA2k8+o/rbt3b5hMewSCy48UBZcoBSB6Sq4PaGXn3tME34zTkFkEfl9JBj4LDTzFJ4LcAn7uE0rNsdFzjvMgbyMEQH1mhrwLiLWnctHroApNGpwGI9AjVe2g456yRFXNRPjkSzJSKGVTws8Xs0HyivOA+YHTvmZ7YCJ3GdyXWReGBZPLJz8ZeE+t1kv9n2KwkVw/xfSfXbExOuK+68jH4b1hqb2Bz/H1+0HTOR48Au5CEXhZmEd1CIJruqVAnGOKwXDBbEic3GMsouJcR0ACkYjGG8Wjxe2gYX1fCRYeO86/peifSdocIHwPin8njF3Fj//sLuw64ldUUkPWIHFCCab5egHeDnXIXyXUBaJhg8lMFoHlYlDmE7hZT9KP/VpfHjfKuW48qUEtya/s+JWooT3tcMo9uEbo2Zzmm0k8pmA21Lkc8EG4YFj2tc7HTufgsw4lHCGIAwmxe9vXJi5NS9oD7g1qRwwDxUFvgy6gDdy94S3n20NanGIm//vq/iUpoMGesZOKiVBJxq/SufEF63oMk+uZaj/csNDSX+8Dh02vi86FebEEHNUaSehOxIda5DzOMcH8IwV3PoFnSIsp5/nHmhDhR+ZxeNBsDaa8bw2wHI4Rvo7/kxBLuG+Ms6s9oVOwHrDfCL98DHFLreZgj7Vd/6XOnLbkcSqD3NKVjm3IxWfI20o3dzoB55aqe0cD2ht4iznuxj0HXByKZNsFrUnkMlxgoYnwYlPbdYxeRp1tPFEWTa1v2HZfhkHn5Shtrlfw32XTmqLa9n6Jjdqn2Yz5e21rDM8JvuZ+hnDOsumloN5MMwzTUqKrvG2rUN8Rp15gzYc08J2CCz18Dr4Im0Q1uYf5huq+5Fn+9tgmv1boJ1jGdZb1ZBxEVb0VWBWy9disfe/sgv8L+oXXzO42r9W+n30AF0M0AL74gD9IlHlxdeETvuLr5XFHu33vha9sYDa9wDdAfEG4FuA25R+0JlaBxUI+hZwDqaJxT79gEFvWwJ9lH362h/t6Y+fsJlv9oJsWDdiXYecNmJyC/raiNTvfU2MLeGxNjSdqf1A9ln2vhYG+gBq/h5rYo+cAT6agjngvdPXVBYVYmwghDzYCmtiCOr1MS2LB6zBgP4Bbffpv7U5qGtADHbxymesQQ/f+ivw7qtiH19iEi9zor37arDPyGcu+/8q+gf/qgv9n/8vAAAA///nI/FAAAAABklEQVQDADu9OLyJhjrRAAAAAElFTkSuQmCC" alt="Logo SAFE" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A', letterSpacing: '0.5px' }}>
              {standaloneApp === 'ALL' ? 'SAFE_ERP' : STANDALONE_APPS[standaloneApp].name}
            </div>
            <div style={{ fontSize: '0.62rem', color: theme === 'night-blue' ? '#38BDF8' : (standaloneApp === 'ALL' ? '#2563EB' : STANDALONE_APPS[standaloneApp].accentColor), fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {standaloneApp === 'ALL' ? 'Enterprise Multinational Suite' : STANDALONE_APPS[standaloneApp].badge}
            </div>
          </div>
        </div>

        {/* Sélecteurs Globaux (Langue, Thème, Licence, Filiale, Devise, Activité, Rôle RBAC) */}
        <div className="safe-app-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme === 'night-blue' ? '#CBD5E1' : '#334155', fontSize: '0.74rem', fontWeight: 700 }}>
            {text('language')}:
            <select
              aria-label={text('language')}
              value={language}
              onChange={(event) => changeLanguage(event.target.value as Language)}
              style={{
                background: theme === 'night-blue' ? '#0F172A' : '#FFFFFF',
                border: `1px solid ${theme === 'night-blue' ? '#24345C' : '#CBD5E1'}`,
                color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A',
                padding: '5px 8px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              <option value="FR">{text('french')}</option>
              <option value="EN">{text('english')}</option>
              <option value="AR">{text('arabic')}</option>
            </select>
          </label>

          {/* Bouton de bascule de Thème (Sobre Clair vs Fond Bleu Nuit) */}
          <button
            type="button"
            onClick={() => setTheme((curr) => (curr === 'night-blue' ? 'light' : 'night-blue'))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: theme === 'night-blue' ? '#1E293B' : '#F1F5F9',
              color: theme === 'night-blue' ? '#38BDF8' : '#0F172A',
              border: `1px solid ${theme === 'night-blue' ? '#38BDF8' : '#CBD5E1'}`,
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Basculer entre affichage sobre et affichage sombre fond Bleu Nuit"
          >
            {theme === 'night-blue' ? '🌙 Bleu Nuit' : '☀️ Mode Sobre'}
          </button>

          {/* Badge Verrou Matériel & Licence HMAC-SHA256 (Réservé ADMIN / FINANCIAL_MANAGER) */}
          {(currentUserRole === 'ADMIN' || currentUserRole === 'FINANCIAL_MANAGER') && (
            <button
              type="button"
              onClick={() => { setIsLicenseModalOpen(true); setLicenseActionMsg(''); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: theme === 'night-blue' ? '#0F2744' : '#EFF6FF',
                color: theme === 'night-blue' ? '#38BDF8' : '#1D4ED8',
                border: `1px solid ${theme === 'night-blue' ? '#2563EB' : '#93C5FD'}`,
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title="Sécurité Verrou matériel Hardware ID & Cryptographie HMAC-SHA256 (Espace Éditeur / Admin)"
            >
              <img src="/icons/licences.png" alt="Licence" style={{ width: '14px', height: '14px', objectFit: 'contain' }} />
              <span>{systemHwId}</span>
              <span style={{
                background: '#059669',
                color: '#FFFFFF',
                fontSize: '0.62rem',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 800,
              }}>
                ACTIVÉ
              </span>
            </button>
          )}

          {/* Badge Normes Fiscales Tunisiennes */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: theme === 'night-blue' ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
              color: theme === 'night-blue' ? '#FCA5A5' : '#DC2626',
              border: `1px solid ${theme === 'night-blue' ? '#7F1D1D' : '#FECACA'}`,
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.68rem',
              fontWeight: 700,
            }}
            title="Conformité totale : TND à 3 décimales, TVA 19%/13%/7%, Timbre 1.000 DT, RS 1.5%/10%, SCE NC 01"
          >
            <span>🇹🇳</span>
            <span>TND (3 déc.) | TVA 19/13/7% | Timbre 1.000 DT</span>
          </div>
          {languagePreferenceWarning && (
            <span role="status" style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>
              {text('languagePreferenceWarning')}
            </span>
          )}
          {!isGlobalAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme === 'night-blue' ? '#CBD5E1' : '#334155', fontSize: '0.78rem' }}>
              <span aria-hidden="true">🏢</span>
              <span>{text('entity')}: <strong style={{ color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A' }}>{currentEntity.name} ({currentEntity.code})</strong></span>
            </div>
          )}

          {/* Devise */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: theme === 'night-blue' ? '#CBD5E1' : '#334155', fontWeight: 700 }}>💱 {text('currency')}:</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              style={{
                background: theme === 'night-blue' ? '#0F172A' : '#FFFFFF',
                border: `1px solid ${theme === 'night-blue' ? '#24345C' : '#CBD5E1'}`,
                color: theme === 'night-blue' ? '#34D399' : '#047857',
                padding: '5px 8px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 800,
                outline: 'none',
              }}
            >
              <option value="TND">TND ({text('tunisianDinar')})</option>
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>

          {/* Activité */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: theme === 'night-blue' ? '#CBD5E1' : '#334155', fontWeight: 700 }}>🏭 {text('activity')}:</span>
            <select
              value={filterActivity}
              onChange={(e) => setFilterActivity(e.target.value)}
              style={{
                background: theme === 'night-blue' ? '#0F172A' : '#FFFFFF',
                border: `1px solid ${theme === 'night-blue' ? '#24345C' : '#CBD5E1'}`,
                color: theme === 'night-blue' ? '#38BDF8' : '#1D4ED8',
                padding: '5px 8px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                outline: 'none',
              }}
            >
              <option value="ALL">{text('allActivities')}</option>
              <option value="INDUSTRIE">{text('plasticIndustry')}</option>
              <option value="COMMERCE">{text('commerceDistribution')}</option>
              <option value="AGRO">{text('agroFood')}</option>
              <option value="BTP_ARTISAN">{text('metalConstruction')}</option>
            </select>
          </div>

          {/* Rôle attribué par le serveur */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: theme === 'night-blue' ? '#CBD5E1' : '#334155', fontWeight: 700 }}>🛡️ {text('role')}:</span>
            <strong style={{ color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A', fontSize: '0.78rem' }}>{currentUserRole === 'ADMIN' ? (isGlobalAdmin ? 'Administrateur groupe' : 'Administrateur entité') : translateRole(language, currentUserRole)}</strong>
          </div>

          {/* Profil et Déconnexion */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingInlineStart: '8px', borderInlineStart: `1px solid ${theme === 'night-blue' ? 'rgba(255,255,255,0.1)' : '#E2E8F0'}` }}>
            <div style={{ textAlign: isArabic ? 'left' : 'right' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A' }}>{activeUser.name}</div>
              <div style={{ fontSize: '0.64rem', color: theme === 'night-blue' ? '#34D399' : '#047857', fontWeight: 700 }}>{activeUser.grade}</div>
            </div>
            <button
              onClick={async () => {
                let revocationFailed = false;
                if (apiAccessToken) {
                  try {
                    const response = await fetch('/api/auth/logout', {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${apiAccessToken}` },
                    });
                    if (!response.ok && response.status !== 401) {
                      throw new Error(`Session revocation failed with status ${response.status}.`);
                    }
                  } catch (error) {
                    console.error('Unable to revoke the current server session.', error);
                    revocationFailed = true;
                  }
                }
                setApiAccessToken(null);
                setApiEntityId(null);
                setApiUserId(null);
                setIsGlobalAdmin(false);
                setGlobalAdminEntities([]);
                setActiveGroupContext(null);
                setEntityContextError('');
                setRecentJournalEntries([]);
                setIsLoggedIn(false);
                if (revocationFailed) window.alert(text('logoutRevocationWarning'));
              }}
              title={text('logout')}
              style={{
                background: theme === 'night-blue' ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2',
                color: theme === 'night-blue' ? '#FCA5A5' : '#B91C1C',
                border: `1px solid ${theme === 'night-blue' ? 'rgba(239, 68, 68, 0.4)' : '#FECACA'}`,
                padding: '5px 8px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ⏻ {text('logout')}
            </button>
          </div>
        </div>
      </header>

      {isGlobalAdmin && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px 16px',
          padding: '10px 20px',
          background: theme === 'night-blue' ? '#111C3A' : '#FFFFFF',
          borderBottom: `1px solid ${theme === 'night-blue' ? '#1E2D54' : '#CBD5E1'}`,
          flexShrink: 0,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A', fontSize: '0.84rem', fontWeight: 700 }}>
            🏢 {isChangingEntityContext ? text('switchingCompany') : text('activeScope')}:
            <select
              aria-label={text('activeScope')}
              value={activeGroupContext ? `group:${activeGroupContext.id}` : apiEntityId ? `entity:${apiEntityId}` : ''}
              disabled={isChangingEntityContext || globalAdminEntities.length === 0}
              onChange={(event) => switchGlobalAdminContext(event.target.value)}
              style={{
                minWidth: 240,
                maxWidth: 'min(60vw, 520px)',
                background: theme === 'night-blue' ? '#0F172A' : '#FFFFFF',
                border: `1px solid ${theme === 'night-blue' ? '#24345C' : '#94A3B8'}`,
                color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A',
                padding: '7px 10px',
                borderRadius: '6px',
                fontSize: '0.84rem',
                fontWeight: 600,
              }}
            >
              <option value="">{globalAdminEntities.length ? text('chooseScope') : text('noCompaniesConfigured')}</option>
              {renderGlobalAdminContextOptions()}
            </select>
          </label>
          {entityContextError && (
            <span role="alert" style={{ color: '#991B1B', fontSize: '0.8rem' }}>{entityContextError}</span>
          )}
          {activeGroupContext && (
            <span role="note" style={{ color: '#92400E', fontSize: '0.78rem' }}>
              {text('groupModuleScopeNote').replace('{entity}', activeGroupContext.ownerEntityName)}
            </span>
          )}
        </div>
      )}

      {/* 2. CORPS PRINCIPAL : SIDEBAR + ZONE DE CONTENU */}
      <div className="safe-app-body" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* BARRE LATÉRALE */}
        <aside
          className="safe-module-sidebar"
          style={{
            width: '280px',
            background: theme === 'night-blue' ? '#0B132B' : '#FFFFFF',
            borderInlineEnd: `1px solid ${theme === 'night-blue' ? '#1E2D54' : '#E2E8F0'}`,
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            overflowY: 'auto',
          }}
        >
          {/* Filiale Sélectionnée */}
          <div style={{
            padding: '0.8rem 1rem',
            borderBottom: `1px solid ${theme === 'night-blue' ? '#1E2D54' : '#E2E8F0'}`,
            background: theme === 'night-blue' ? '#111C3A' : '#F8FAFC',
          }}>
            <div style={{ fontSize: '0.64rem', color: theme === 'night-blue' ? '#94A3B8' : '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>
              {text(activeGroupContext ? 'activeScope' : 'selectedEntity').toUpperCase()}
            </div>
            <div style={{ fontWeight: 800, fontSize: '0.84rem', color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isGlobalAdmin ? activeContextName || text('chooseCompany') : currentEntity.name}
            </div>
            <div style={{ fontSize: '0.7rem', color: theme === 'night-blue' ? '#CBD5E1' : '#334155', marginTop: '2px' }}>
              {isGlobalAdmin ? activeContextCode : `${currentEntity.code} • ${currentEntity.city} (${currency})`}
            </div>
          </div>

          {/* Badge Prologiciel Métier Actif */}
          {standaloneApp !== 'ALL' && (
            <div style={{
              margin: '8px 10px',
              padding: '10px',
              borderRadius: '8px',
              background: theme === 'night-blue' ? '#101B3B' : '#F0F9FF',
              border: `1px solid ${STANDALONE_APPS[standaloneApp].accentColor}55`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '1.1rem', display: 'inline-flex', alignItems: 'center' }}>
                  {STANDALONE_APPS[standaloneApp].icon && STANDALONE_APPS[standaloneApp].icon.startsWith('/') ? (
                    <img src={STANDALONE_APPS[standaloneApp].icon} alt={STANDALONE_APPS[standaloneApp].name} style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                  ) : (
                    STANDALONE_APPS[standaloneApp].icon
                  )}
                </span>
                <span style={{
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  background: STANDALONE_APPS[standaloneApp].accentColor,
                  padding: '2px 7px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                }}>
                  {STANDALONE_APPS[standaloneApp].badge}
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: '0.84rem', color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A' }}>
                {STANDALONE_APPS[standaloneApp].name}
              </div>
              <div style={{ fontSize: '0.68rem', color: theme === 'night-blue' ? '#CBD5E1' : '#334155', marginTop: '3px', lineHeight: '1.3' }}>
                {STANDALONE_APPS[standaloneApp].tagline}
              </div>
            </div>
          )}

          <button className="safe-workspace-link" type="button" onClick={() => setIsModuleHome(true)} aria-current={isModuleHome ? 'page' : undefined}><span aria-hidden="true">⌂</span> Espace de travail</button>

          {/* Menus Verticaux Regroupés par Catégorie */}
          <nav className="safe-module-navigation" aria-label="Navigation des modules" style={{ flex: 1, padding: '0.6rem 0.5rem' }}>
            {categories.map((cat) => {
              const catModules = visibleModules.filter((m) => m.category === cat);
              return (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.64rem', color: theme === 'night-blue' ? '#94A3B8' : '#475569', fontWeight: 800, padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    {translateCategory(language, cat)}
                  </div>
                  {catModules.map((item) => {
                    const isActive = activeModule === item.id;
                    return (
                      <button
                        key={item.id}
                        className="safe-module-link"
                        onClick={() => { setIsModuleHome(false); navigateToModule(item.id); }}
                        aria-current={isActive ? 'page' : undefined}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: isActive
                            ? (theme === 'night-blue' ? '#162746' : '#EFF6FF')
                            : 'transparent',
                          color: isActive
                            ? (theme === 'night-blue' ? '#38BDF8' : '#1D4ED8')
                            : (theme === 'night-blue' ? '#CBD5E1' : '#334155'),
                          border: 'none',
                          borderInlineStart: isActive
                            ? `3px solid ${theme === 'night-blue' ? '#38BDF8' : '#2563EB'}`
                            : '3px solid transparent',
                          fontSize: '0.8rem',
                          fontWeight: isActive ? 800 : 600,
                          cursor: 'pointer',
                          textAlign: isArabic ? 'right' : 'left',
                          marginBottom: '2px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center' }}>
                            {item.icon && item.icon.startsWith('/') ? (
                              <img src={item.icon} alt={item.label} style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
                            ) : (
                              item.icon
                            )}
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{translateModuleLabel(language, item.id, item.label)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* Bouton rapide d'ajout de module si Admin ou CFO */}
          {(currentUserRole === 'ADMIN' || currentUserRole === 'FINANCIAL_MANAGER') && (
            <div style={{ padding: '0.8rem', borderTop: `1px solid ${theme === 'night-blue' ? '#1E2D54' : '#E2E8F0'}` }}>
              <button
                onClick={() => setIsAddModuleModalOpen(true)}
                style={{
                  width: '100%',
                  background: theme === 'night-blue' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
                  border: `1px solid ${theme === 'night-blue' ? '#2563EB' : '#BFDBFE'}`,
                  color: theme === 'night-blue' ? '#60A5FA' : '#1D4ED8',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                ➕ {text('addModule')}
              </button>
            </div>
          )}
        </aside>

        {/* ZONE DE CONTENU PRINCIPAL */}
        <main
          className="safe-module-content"
          lang={getHtmlLanguage(language)}
          dir={isArabic ? 'rtl' : 'ltr'}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.4rem',
            background: theme === 'night-blue' ? '#0A1128' : '#F8FAFC',
            color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A',
          }}
        >
          <div className="safe-page-breadcrumb" aria-label="Page active" style={{ color: theme === 'night-blue' ? '#94A3B8' : '#475569' }}>
            <span>{activeModuleConfig ? translateCategory(language, activeModuleConfig.category) : ''}</span>
            <span aria-hidden="true"> / </span>
            <strong style={{ color: theme === 'night-blue' ? '#F8FAFC' : '#0F172A' }}>{translateModuleLabel(language, activeModule, activeModuleConfig?.label ?? activeModule)}</strong>
          </div>
          <InterfaceLanguageProvider language={language}>
            {renderCurrentModuleView()}
          </InterfaceLanguageProvider>
        </main>
      </div>

      {/* ========================================== */}
      {/* MODALS INTERACTIFS D'AJOUTS               */}
      {/* ========================================== */}

      {/* MODAL NOUVELLE COMMANDE / FACTURE CLIENT */}
      {isAddSaleModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '1.6rem', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>🛒 Nouvelle Commande / Facture Client</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Code Client :</label>
                <input
                  type="text"
                  value={newSaleClientCode}
                  onChange={(e) => setNewSaleClientCode(e.target.value)}
                  placeholder="Ex: CLI-07"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '0.68rem', color: '#06B6D4', fontWeight: 700, marginTop: '2px' }}>
                  Compte 411 déduit automatiquement : {computeClientAccount(newSaleClientCode)}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Raison Sociale Client :</label>
                <input
                  type="text"
                  value={newSaleClientName}
                  onChange={(e) => setNewSaleClientName(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Date d'Échéance :</label>
                <input
                  type="text"
                  value={newSaleDueDate}
                  onChange={(e) => setNewSaleDueDate(e.target.value)}
                  placeholder="JJ/MM/AAAA"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Montant Vente HT ({currency}) :</label>
                <input
                  type="number"
                  value={newSaleAmountHT}
                  onChange={(e) => setNewSaleAmountHT(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.2rem' }}>
              <button onClick={() => setIsAddSaleModalOpen(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleCreateSalesInvoice} style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Créer Facture Client</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL AJOUTER SALARIÉ RH */}
      {isAddEmployeeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '1.6rem', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>👤 Ajouter un Nouveau Collaborateur RH</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Nom & Prénom :</label>
                <input
                  type="text"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  placeholder="Ex: Moncef Chahed"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Poste / Fonction :</label>
                <input
                  type="text"
                  value={newEmpPosition}
                  onChange={(e) => setNewEmpPosition(e.target.value)}
                  placeholder="Ex: Responsable Maintenance"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Type de Contrat :</label>
                  <select
                    value={newEmpContract}
                    onChange={(e) => setNewEmpContract(e.target.value as any)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem' }}
                  >
                    <option value="CDI">CDI (Indéterminée)</option>
                    <option value="CDD">CDD (Déterminée)</option>
                    <option value="CIVP">CIVP (Stage Insertion)</option>
                    <option value="Contrat Karama">Contrat Karama</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Salaire Brut ({currency}) :</label>
                  <input
                    type="number"
                    value={newEmpSalary}
                    onChange={(e) => setNewEmpSalary(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.2rem' }}>
              <button onClick={() => setIsAddEmployeeModalOpen(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleCreateEmployee} style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Enregistrer Salarié</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL AJOUT MODULE PERSONNALISÉ */}
      {isAddModuleModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '1.6rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>➕ Définir un Nouveau Module SAFE_ERP</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Nom du Module :</label>
                <input
                  type="text"
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  placeholder="Ex: Contrôle Industriel & Qualité"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Catégorie :</label>
                <select
                  value={newModuleCategory}
                  onChange={(e) => setNewModuleCategory(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem' }}
                >
                  <option value="PILOTAGE">PILOTAGE</option>
                  <option value="COMPTABILITÉ">COMPTABILITÉ</option>
                  <option value="CAPITAL HUMAIN">CAPITAL HUMAIN</option>
                  <option value="OPÉRATIONS">OPÉRATIONS</option>
                  <option value="PARAMÈTRES">PARAMÈTRES</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Icône :</label>
                <input
                  type="text"
                  value={newModuleIcon}
                  onChange={(e) => setNewModuleIcon(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.2rem' }}>
              <button onClick={() => setIsAddModuleModalOpen(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button
                onClick={() => {
                  if (newModuleName.trim()) {
                    const newId = `custom_${Date.now()}` as any;
                    const newMod = { id: newId, label: newModuleName.trim(), icon: newModuleIcon.trim() || '⚡', category: newModuleCategory };
                    setModulesList((prev) => [...prev, newMod]);
                    setRolePermissions((prev) => ({
                      ...prev,
                      ADMIN: [...(prev.ADMIN || []), newId],
                      FINANCIAL_MANAGER: [...(prev.FINANCIAL_MANAGER || []), newId],
                    }));
                    setNewModuleName('');
                    setIsAddModuleModalOpen(false);
                    alert(`✅ Module [${newModuleName}] créé avec succès et activé !`);
                  }
                }}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Enregistrer le Module
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL NOUVELLE LIGNE BUDGÉTAIRE */}
      {isAddBudgetModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '1.6rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>🎯 Nouvelle Ligne Budgétaire</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Rubrique :</label>
                <input
                  type="text"
                  placeholder="Ex: Campagne Marketing Digitale"
                  id="new-bud-name"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>Enveloppe Budgétaire ({currency}) :</label>
                <input
                  type="number"
                  placeholder="75000"
                  id="new-bud-val"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.2rem' }}>
              <button onClick={() => setIsAddBudgetModalOpen(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button
                onClick={() => {
                  const nameEl = document.getElementById('new-bud-name') as HTMLInputElement;
                  const valEl = document.getElementById('new-bud-val') as HTMLInputElement;
                  if (nameEl && nameEl.value.trim()) {
                    const val = parseFloat(valEl.value) || 50000;
                    const newLine: BudgetLine = {
                      id: `BUD-${Date.now().toString().slice(-3)}`,
                      code: `628-${Math.floor(100 + Math.random() * 900)}`,
                      name: nameEl.value.trim(),
                      type: 'OPEX',
                      category: 'Développement Commercial',
                      initialBudget: val,
                      revisedBudget: val,
                      actual: 0,
                      variance: val,
                      variancePct: 100,
                      status: 'Conforme',
                    };
                    setBudgetLines([...budgetLines, newLine]);
                    setIsAddBudgetModalOpen(false);
                    alert(`✅ Ligne budgétaire [${newLine.name}] ajoutée avec succès !`);
                  }
                }}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Créer Ligne
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 7. MODAL VERROU MATÉRIEL & ACTIVATION CRYPTOGRAPHIQUE HMAC-SHA256 */}
      {isLicenseModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '1.8rem', width: '100%', maxWidth: '580px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>🔐</span>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Verrou Matériel & Licence Cryptographique</h3>
                  <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0 0' }}>Signature HW-ID & Validation HMAC-SHA256</p>
                </div>
              </div>
              <button
                onClick={() => setIsLicenseModalOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', color: '#64748B', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Point 1 : Verrou matériel */}
              <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#334155' }}>💻 Verrou Matériel (Hardware ID Unique) :</span>
                  <span style={{ background: '#10B981', color: '#FFFFFF', fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>LIÉ À CETTE MACHINE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <input
                    type="text"
                    readOnly
                    value={systemHwId}
                    style={{ flex: 1, fontFamily: 'monospace', fontWeight: 700, fontSize: '0.86rem', padding: '6px 10px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#1E293B' }}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(systemHwId);
                      alert('Hardware ID copié dans le presse-papiers : ' + systemHwId);
                    }}
                    style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Copier
                  </button>
                </div>
                <p style={{ fontSize: '0.66rem', color: '#64748B', margin: '4px 0 0 0' }}>Généré à partir de l'adresse MAC et de la carte mère de ce poste client.</p>
              </div>

              {/* Point 2 : Cryptographie HMAC-SHA256 */}
              <div style={{ background: '#EFF6FF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1D4ED8' }}>🛡️ Génération Cryptographique HMAC-SHA256 :</span>
                <p style={{ fontSize: '0.7rem', color: '#1E40AF', margin: '4px 0 8px 0' }}>Format officiel : <code>SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX</code> scellé cryptographiquement.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="SAFE-20261120-XXXX-XXXX-XXXX-XXXX"
                    value={licenseInputKey}
                    onChange={(e) => setLicenseInputKey(e.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '7px 10px', border: '1px solid #93C5FD', borderRadius: '6px' }}
                  />
                  <button
                    onClick={handleActivateLicense}
                    style={{ background: '#1D4ED8', color: '#FFFFFF', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Activer
                  </button>
                </div>
                {licenseActionMsg && (
                  <div style={{ marginTop: '6px', fontSize: '0.72rem', fontWeight: 700, color: licenseActionMsg.startsWith('✅') ? '#047857' : '#DC2626' }}>
                    {licenseActionMsg}
                  </div>
                )}
              </div>

              {/* Point 3 : Bases métiers tunisiennes */}
              <div style={{ background: '#FEF2F2', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FECACA' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#991B1B' }}>🇹🇳 Bases Métiers Tunisiennes Intégrées (Strict Respect Légal) :</span>
                <ul style={{ margin: '6px 0 0 0', paddingInlineStart: '18px', fontSize: '0.7rem', color: '#7F1D1D', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <li><strong>Monnaie :</strong> Dinar Tunisien (TND / DT) à 3 décimales (ex: 1 250,500 DT).</li>
                  <li><strong>Taux de TVA :</strong> 19% (Services & Biens standards), 13% (Spécifiques), 7% (Matières & Santé).</li>
                  <li><strong>Droit de Timbre Fiscal :</strong> 1.000 DT obligatoire par facture de vente.</li>
                  <li><strong>Retenues à la Source (RS) :</strong> 1.5% (Achats/Ventes marchandises &gt; 1 000 DT), 10% (Honoraires).</li>
                  <li><strong>Nomenclature Comptable :</strong> Conforme au Système Comptable des Entreprises (SCE NC 01).</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button
                onClick={() => setIsLicenseModalOpen(false)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '7px 16px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: '#334155' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
