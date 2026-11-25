/**
 * SAFE ERP - Service Universel de Migration & Mapping Multi-ERP
 * Permet l'importation fluide, sans obstacle et automatisée depuis n'importe quel ERP :
 * SAP (ECC/S4HANA), ORACLE (EBS/Fusion), SAGE (100/X3), DYNAMICS, ODOO ou CSV/Excel Générique.
 */

import { PrismaClient } from '@prisma/client';

// Singleton Prisma client for the service
export const prisma = new PrismaClient();

export type MigrationSourceERP = 'SAP' | 'ORACLE' | 'SAGE' | 'DYNAMICS' | 'ODOO' | 'GENERIC';

export type MigrationTargetDomain =
  | 'CHART_OF_ACCOUNTS'
  | 'CUSTOMERS'
  | 'VENDORS'
  | 'MATERIALS'
  | 'EMPLOYEES'
  | 'FIXED_ASSETS'
  | 'COST_CENTERS';

export interface FieldDefinition {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  required: boolean;
  description: string;
  synonyms: string[];
  defaultValue?: unknown;
}

export interface FieldMappingProposal {
  sourceColumn: string;
  targetField: string | null;
  confidence: number; // 0 à 100
  matchedBy: 'EXACT' | 'PRESET' | 'FUZZY' | 'NONE';
}

export interface ErpPresetConfig {
  erp: MigrationSourceERP;
  name: string;
  description: string;
  signatures: string[]; // En-têtes typiques pour détection automatique
  domainMappings: Record<MigrationTargetDomain, Record<string, string>>;
}

export interface MigrationSimulationResult {
  sourceErp: MigrationSourceERP;
  targetDomain: MigrationTargetDomain;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
  errors: Array<{
    rowNumber: number;
    field: string;
    message: string;
    rawValue: unknown;
  }>;
  warnings: Array<{
    rowNumber: number;
    field: string;
    message: string;
  }>;
  sampleTransformed: Record<string, unknown>[];
}

export interface MigrationExecutionResult {
  success: boolean;
  targetDomain: MigrationTargetDomain;
  sourceErp: MigrationSourceERP;
  totalProcessed: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  durationMs: number;
  auditTrailReference?: string;
  details?: string;
}

// ============================================================================
// 1. DÉFINITION DES CHAMPS CIBLES PAR DOMAINE
// ============================================================================

export const TARGET_DOMAIN_FIELDS: Record<MigrationTargetDomain, FieldDefinition[]> = {
  CHART_OF_ACCOUNTS: [
    {
      name: 'code',
      label: 'Numéro de Compte',
      type: 'string',
      required: true,
      description: 'Numéro de compte général (ex: 411, 401, 707, 601)',
      synonyms: ['saknr', 'compteg', 'cg_num', 'account', 'account_number', 'compte', 'num_compte', 'no.', 'code', 'gl_account'],
    },
    {
      name: 'description',
      label: 'Libellé du Compte',
      type: 'string',
      required: true,
      description: 'Intitulé officiel du compte général',
      synonyms: ['txt50', 'txt20', 'intitule', 'cg_intitule', 'name', 'account_name', 'description', 'libelle', 'designation'],
    },
    {
      name: 'classNumber',
      label: 'Classe Comptable (1 à 7)',
      type: 'number',
      required: false,
      description: 'Classe comptable SCE (1: Capitaux, 2: Immo, 3: Stocks, 4: Tiers, 5: Fin., 6: Charges, 7: Produits)',
      synonyms: ['bilkt', 'classe', 'cg_classe', 'class', 'class_number'],
    },
    {
      name: 'type',
      label: 'Nature Comptable',
      type: 'string',
      required: false,
      description: 'Asset, Liability, Equity, Revenue, Expense',
      synonyms: ['gvtyp', 'type', 'cg_type', 'account_type', 'nature', 'category'],
      defaultValue: 'Asset',
    },
  ],

  CUSTOMERS: [
    {
      name: 'code',
      label: 'Code Client',
      type: 'string',
      required: true,
      description: 'Identifiant / Code tiers client unique',
      synonyms: ['kunnr', 'ct_num', 'account_number', 'cust_id', 'code', 'customer_code', 'code_client', 'client_id', 'ref', 'no.'],
    },
    {
      name: 'name',
      label: 'Raison Sociale / Nom',
      type: 'string',
      required: true,
      description: 'Nom ou dénomination sociale complète du client',
      synonyms: ['name1', 'name', 'ct_intitule', 'party_name', 'company_name', 'raison_sociale', 'nom', 'nom_client', 'customer_name'],
    },
    {
      name: 'fiscalId',
      label: 'Matricule Fiscal / N° TVA',
      type: 'string',
      required: false,
      description: 'Matricule fiscal tunisien (ex: 1234567/A/M/000) ou numéro de TVA international',
      synonyms: ['stceg', 'tax_number', 'ct_identifiant', 'jgzz_fiscal_code', 'matricule_fiscal', 'mf', 'vat_number', 'tax_id', 'vat', 'identifiant'],
    },
    {
      name: 'email',
      label: 'Adresse Email',
      type: 'string',
      required: false,
      description: 'Email de contact ou facturation',
      synonyms: ['smtp_addr', 'ct_email', 'email_address', 'mail', 'courriel', 'email', 'e_mail'],
    },
    {
      name: 'phone',
      label: 'Téléphone',
      type: 'string',
      required: false,
      description: 'Numéro de téléphone principal',
      synonyms: ['telf1', 'ct_telephone', 'primary_phone_number', 'phone_no.', 'tel', 'phone', 'telephone', 'mobile'],
    },
    {
      name: 'address',
      label: 'Adresse',
      type: 'string',
      required: false,
      description: 'Adresse physique ou postale complète',
      synonyms: ['stras', 'ct_adresse', 'address_line1', 'address', 'adresse', 'street', 'rue'],
    },
  ],

  VENDORS: [
    {
      name: 'code',
      label: 'Code Fournisseur',
      type: 'string',
      required: true,
      description: 'Identifiant / Code tiers fournisseur unique',
      synonyms: ['lifnr', 'ct_num', 'segment1', 'vendor_id', 'code', 'vendor_code', 'code_fournisseur', 'supplier_id', 'ref', 'no.'],
    },
    {
      name: 'name',
      label: 'Raison Sociale Fournisseur',
      type: 'string',
      required: true,
      description: 'Dénomination sociale du fournisseur',
      synonyms: ['name1', 'name', 'ct_intitule', 'vendor_name', 'company_name', 'nom_fournisseur', 'raison_sociale', 'fournisseur', 'supplier_name'],
    },
    {
      name: 'fiscalId',
      label: 'Matricule Fiscal',
      type: 'string',
      required: false,
      description: 'Matricule fiscal ou identifiant légal',
      synonyms: ['stceg', 'tax_number', 'ct_identifiant', 'num_1099', 'matricule_fiscal', 'mf', 'vat_number', 'tax_id', 'vat'],
    },
    {
      name: 'email',
      label: 'Email Fournisseur',
      type: 'string',
      required: false,
      description: 'Email commercial ou comptable',
      synonyms: ['smtp_addr', 'ct_email', 'email_address', 'mail', 'email', 'e_mail'],
    },
    {
      name: 'phone',
      label: 'Téléphone',
      type: 'string',
      required: false,
      description: 'Numéro de téléphone',
      synonyms: ['telf1', 'ct_telephone', 'phone', 'telephone', 'tel', 'phone_no.'],
    },
    {
      name: 'address',
      label: 'Adresse Fournisseur',
      type: 'string',
      required: false,
      description: 'Adresse du siège social ou entrepôt',
      synonyms: ['stras', 'ct_adresse', 'address_line1', 'address', 'adresse', 'street'],
    },
  ],

  MATERIALS: [
    {
      name: 'sku',
      label: 'Code Article (SKU)',
      type: 'string',
      required: true,
      description: 'Référence unique de l’article ou produit',
      synonyms: ['matnr', 'ar_ref', 'segment1', 'item_number', 'sku', 'code_article', 'ref', 'reference', 'default_code', 'no.'],
    },
    {
      name: 'name',
      label: 'Désignation Article',
      type: 'string',
      required: true,
      description: 'Description ou nom commercial du produit',
      synonyms: ['maktx', 'ar_design', 'description', 'name', 'designation', 'libelle', 'item_name', 'nom_article'],
    },
    {
      name: 'unitCode',
      label: 'Unité de Mesure',
      type: 'string',
      required: false,
      description: 'Unité légale (EA, U, KG, L, M, H)',
      synonyms: ['meins', 'ar_uniteven', 'primary_uom_code', 'unit', 'unite', 'uom', 'base_unit_of_measure', 'uom_id'],
      defaultValue: 'EA',
    },
    {
      name: 'barcode',
      label: 'Code-barres / EAN',
      type: 'string',
      required: false,
      description: 'Code-barres EAN13 ou standard',
      synonyms: ['ean11', 'ar_codebarre', 'barcode', 'code_barre', 'ean'],
    },
    {
      name: 'unitPrice',
      label: 'Prix de Vente Unitaire HT',
      type: 'number',
      required: true,
      description: 'Prix de vente unitaire standard hors taxe',
      synonyms: ['kbetr', 'ar_prixven', 'list_price_per_unit', 'unit_price', 'prix_vente', 'prix_ht', 'pv_ht', 'list_price', 'price'],
      defaultValue: 0.0,
    },
    {
      name: 'costPrice',
      label: 'Coût d’Achat / PUMP',
      type: 'number',
      required: false,
      description: 'Prix d’achat moyen pondéré ou coût standard',
      synonyms: ['stprs', 'verpr', 'ar_prixach', 'unit_cost', 'cost_price', 'prix_achat', 'pa_ht', 'standard_price', 'cump', 'pump'],
      defaultValue: 0.0,
    },
    {
      name: 'quantity',
      label: 'Stock Initial',
      type: 'number',
      required: false,
      description: 'Quantité initiale en stock',
      synonyms: ['labst', 'stock', 'qte', 'quantite', 'quantity', 'on_hand', 'stock_initial', 'qty'],
      defaultValue: 0.0,
    },
  ],

  EMPLOYEES: [
    {
      name: 'empId',
      label: 'Matricule Salarié',
      type: 'string',
      required: true,
      description: 'Matricule interne unique du collaborateur',
      synonyms: ['pernr', 'matricule', 'employee_number', 'emp_id', 'code_salarie', 'id_salarie'],
    },
    {
      name: 'firstName',
      label: 'Prénom',
      type: 'string',
      required: true,
      description: 'Prénom du salarié',
      synonyms: ['vorna', 'prenom', 'first_name', 'given_name'],
    },
    {
      name: 'lastName',
      label: 'Nom de Famille',
      type: 'string',
      required: true,
      description: 'Nom de famille du salarié',
      synonyms: ['nachn', 'nom', 'last_name', 'family_name', 'surname'],
    },
    {
      name: 'email',
      label: 'Email Professionnel',
      type: 'string',
      required: true,
      description: 'Adresse email unique de contact',
      synonyms: ['email', 'email_address', 'mail', 'courriel'],
    },
    {
      name: 'cin',
      label: 'Numéro CIN / Passeport',
      type: 'string',
      required: false,
      description: 'Numéro de Carte d’Identité Nationale tunisienne',
      synonyms: ['icnum', 'cin', 'national_identifier', 'num_cin', 'carte_identite'],
    },
    {
      name: 'cnssNumber',
      label: 'Numéro CNSS',
      type: 'string',
      required: false,
      description: 'Numéro d’affiliation CNSS à 8 ou 10 chiffres',
      synonyms: ['socnr', 'cnss', 'num_cnss', 'social_security_number', 'ssn'],
    },
    {
      name: 'baseSalary',
      label: 'Salaire de Base Brut (TND)',
      type: 'number',
      required: false,
      description: 'Salaire mensuel brut contractuel',
      synonyms: ['betrg', 'salaire', 'base_salary', 'salary_amount', 'salaire_base', 'brut'],
      defaultValue: 1500.0,
    },
    {
      name: 'position',
      label: 'Poste / Fonction',
      type: 'string',
      required: false,
      description: 'Intitulé du poste occupé',
      synonyms: ['stell', 'poste', 'fonction', 'position', 'job_title', 'titre'],
    },
  ],

  FIXED_ASSETS: [
    {
      name: 'code',
      label: 'Code Immobilisation',
      type: 'string',
      required: true,
      description: 'Identifiant unique de l’immobilisation',
      synonyms: ['anln1', 'im_code', 'asset_number', 'code_immo', 'code', 'asset_id'],
    },
    {
      name: 'name',
      label: 'Désignation de l’Actif',
      type: 'string',
      required: true,
      description: 'Description du bien immobilisé',
      synonyms: ['txt50', 'im_designation', 'description', 'name', 'designation', 'libelle'],
    },
    {
      name: 'category',
      label: 'Catégorie Fiscale DGI',
      type: 'string',
      required: false,
      description: 'Catégorie (ex: IT, Transport, Mobilier, Bâtiment)',
      synonyms: ['anlkl', 'im_categorie', 'category', 'categorie', 'asset_category'],
      defaultValue: 'GENERAL',
    },
    {
      name: 'grossValue',
      label: 'Valeur d’Acquisition HT (en millimes)',
      type: 'number',
      required: true,
      description: 'Valeur d’origine hors taxe en millimes (1 TND = 1000 millimes)',
      synonyms: ['kansw', 'im_valeurorigine', 'cost', 'gross_value', 'valeur_acquisition', 'montant_ht'],
    },
    {
      name: 'usefulLifeMonths',
      label: 'Durée d’Amortissement (Mois)',
      type: 'number',
      required: false,
      description: 'Durée en mois (ex: 60 pour 5 ans)',
      synonyms: ['ndjar', 'im_duree', 'life_in_months', 'duree_mois', 'useful_life'],
      defaultValue: 60,
    },
  ],

  COST_CENTERS: [
    {
      name: 'code',
      label: 'Code Centre de Coût',
      type: 'string',
      required: true,
      description: 'Code analytique (ex: CC-ADMIN, CC-VENTES)',
      synonyms: ['kostl', 'ca_num', 'cost_center_segment', 'code', 'code_centre'],
    },
    {
      name: 'name',
      label: 'Nom du Centre',
      type: 'string',
      required: true,
      description: 'Intitulé du centre de profit ou coût',
      synonyms: ['ktext', 'ca_intitule', 'cost_center_name', 'name', 'intitule', 'libelle'],
    },
    {
      name: 'department',
      label: 'Département / Section',
      type: 'string',
      required: false,
      description: 'Département rattaché',
      synonyms: ['abtei', 'ca_section', 'department_name', 'departement', 'section'],
      defaultValue: 'DIRECTION',
    },
  ],
};

// ============================================================================
// 2. CONFIGURATIONS & PRESETS ERP OFFICIELS
// ============================================================================

export const ERP_PRESETS: Record<MigrationSourceERP, ErpPresetConfig> = {
  SAP: {
    erp: 'SAP',
    name: 'SAP ERP & S/4HANA (BAPI / IDoc / Tables SE16N)',
    description: 'Connecteur natif pour extraits de tables SAP (KNA1, LFA1, SKA1, MARA, PA0001/2, ANLA, CSKS).',
    signatures: ['kunnr', 'lifnr', 'saknr', 'matnr', 'pernr', 'anln1', 'kostl', 'mandt', 'bukrs'],
    domainMappings: {
      CHART_OF_ACCOUNTS: { saknr: 'code', txt50: 'description', bilkt: 'classNumber', gvtyp: 'type' },
      CUSTOMERS: { kunnr: 'code', name1: 'name', stceg: 'fiscalId', smtp_addr: 'email', telf1: 'phone', stras: 'address' },
      VENDORS: { lifnr: 'code', name1: 'name', stceg: 'fiscalId', smtp_addr: 'email', telf1: 'phone', stras: 'address' },
      MATERIALS: { matnr: 'sku', maktx: 'name', meins: 'unitCode', ean11: 'barcode', kbetr: 'unitPrice', stprs: 'costPrice' },
      EMPLOYEES: { pernr: 'empId', vorna: 'firstName', nachn: 'lastName', icnum: 'cin', socnr: 'cnssNumber', betrg: 'baseSalary' },
      FIXED_ASSETS: { anln1: 'code', txt50: 'name', anlkl: 'category', kansw: 'grossValue', ndjar: 'usefulLifeMonths' },
      COST_CENTERS: { kostl: 'code', ktext: 'name', abtei: 'department' },
    },
  },

  ORACLE: {
    erp: 'ORACLE',
    name: 'ORACLE E-Business Suite & Fusion Cloud ERP',
    description: 'Import direct des exports tables Oracle GL, AP, AR, Inventory, HCM et FA.',
    signatures: ['account_number', 'party_name', 'jgzz_fiscal_code', 'mtl_system_items', 'primary_uom_code', 'cost_center_segment'],
    domainMappings: {
      CHART_OF_ACCOUNTS: { account: 'code', description: 'description', account_type: 'type' },
      CUSTOMERS: { account_number: 'code', party_name: 'name', jgzz_fiscal_code: 'fiscalId', email_address: 'email', primary_phone_number: 'phone', address_line1: 'address' },
      VENDORS: { segment1: 'code', vendor_name: 'name', num_1099: 'fiscalId', email_address: 'email', phone: 'phone', address_line1: 'address' },
      MATERIALS: { segment1: 'sku', description: 'name', primary_uom_code: 'unitCode', list_price_per_unit: 'unitPrice', unit_cost: 'costPrice' },
      EMPLOYEES: { employee_number: 'empId', first_name: 'firstName', last_name: 'lastName', national_identifier: 'cin', email_address: 'email', salary_amount: 'baseSalary' },
      FIXED_ASSETS: { asset_number: 'code', description: 'name', cost: 'grossValue', life_in_months: 'usefulLifeMonths' },
      COST_CENTERS: { cost_center_segment: 'code', cost_center_name: 'name', department_name: 'department' },
    },
  },

  SAGE: {
    erp: 'SAGE',
    name: 'SAGE 100 / Sage X3 / Sage Cloud',
    description: 'Formats officiels Sage F_COMPTEG, F_COMPTET, F_ARTICLE, F_IMMOBILISATION, F_ANALYTIQUE.',
    signatures: ['ct_num', 'cg_num', 'ar_ref', 'im_code', 'ca_num', 'ct_intitule', 'ar_design'],
    domainMappings: {
      CHART_OF_ACCOUNTS: { cg_num: 'code', cg_intitule: 'description', cg_classe: 'classNumber', cg_type: 'type' },
      CUSTOMERS: { ct_num: 'code', ct_intitule: 'name', ct_identifiant: 'fiscalId', ct_email: 'email', ct_telephone: 'phone', ct_adresse: 'address' },
      VENDORS: { ct_num: 'code', ct_intitule: 'name', ct_identifiant: 'fiscalId', ct_email: 'email', ct_telephone: 'phone', ct_adresse: 'address' },
      MATERIALS: { ar_ref: 'sku', ar_design: 'name', ar_uniteven: 'unitCode', ar_codebarre: 'barcode', ar_prixven: 'unitPrice', ar_prixach: 'costPrice' },
      EMPLOYEES: { matricule: 'empId', prenom: 'firstName', nom: 'lastName', cin: 'cin', cnss: 'cnssNumber', salairebase: 'baseSalary' },
      FIXED_ASSETS: { im_code: 'code', im_designation: 'name', im_valeurorigine: 'grossValue', im_duree: 'usefulLifeMonths' },
      COST_CENTERS: { ca_num: 'code', ca_intitule: 'name', ca_section: 'department' },
    },
  },

  DYNAMICS: {
    erp: 'DYNAMICS',
    name: 'Microsoft Dynamics 365 / Business Central / NAV',
    description: 'Extraction directe des tables NAV / Business Central.',
    signatures: ['vat_registration_no.', 'base_unit_of_measure', 'phone_no.', 'e_mail'],
    domainMappings: {
      CHART_OF_ACCOUNTS: { 'no.': 'code', name: 'description', account_type: 'type' },
      CUSTOMERS: { 'no.': 'code', name: 'name', 'vat_registration_no.': 'fiscalId', e_mail: 'email', 'phone_no.': 'phone', address: 'address' },
      VENDORS: { 'no.': 'code', name: 'name', 'vat_registration_no.': 'fiscalId', e_mail: 'email', 'phone_no.': 'phone', address: 'address' },
      MATERIALS: { 'no.': 'sku', description: 'name', base_unit_of_measure: 'unitCode', unit_price: 'unitPrice', unit_cost: 'costPrice' },
      EMPLOYEES: { 'no.': 'empId', first_name: 'firstName', last_name: 'lastName', e_mail: 'email' },
      FIXED_ASSETS: { 'no.': 'code', description: 'name' },
      COST_CENTERS: { code: 'code', name: 'name' },
    },
  },

  ODOO: {
    erp: 'ODOO',
    name: 'Odoo ERP (Community & Enterprise)',
    description: 'Exports CSV standards des modèles res.partner, account.account, product.template.',
    signatures: ['default_code', 'uom_id', 'standard_price', 'list_price'],
    domainMappings: {
      CHART_OF_ACCOUNTS: { code: 'code', name: 'description', account_type: 'type' },
      CUSTOMERS: { ref: 'code', name: 'name', vat: 'fiscalId', email: 'email', phone: 'phone', street: 'address' },
      VENDORS: { ref: 'code', name: 'name', vat: 'fiscalId', email: 'email', phone: 'phone', street: 'address' },
      MATERIALS: { default_code: 'sku', name: 'name', uom_id: 'unitCode', barcode: 'barcode', list_price: 'unitPrice', standard_price: 'costPrice' },
      EMPLOYEES: { ref: 'empId', name: 'lastName', work_email: 'email' },
      FIXED_ASSETS: { code: 'code', name: 'name' },
      COST_CENTERS: { code: 'code', name: 'name' },
    },
  },

  GENERIC: {
    erp: 'GENERIC',
    name: 'Fichier Excel / CSV Personnalisé (Mapping Automatique Intelligent)',
    description: 'Fuzzy matching contextuel pour tout fichier standardisé.',
    signatures: [],
    domainMappings: {
      CHART_OF_ACCOUNTS: {},
      CUSTOMERS: {},
      VENDORS: {},
      MATERIALS: {},
      EMPLOYEES: {},
      FIXED_ASSETS: {},
      COST_CENTERS: {},
    },
  },
};

// ============================================================================
// 3. PARSEURS & NETTOYEURS TOLÉRANTS ("SANS OBSTACLE")
// ============================================================================

export function detectDelimiter(text: string): ',' | ';' | '\t' | '|' {
  const sample = text.slice(0, 4000);
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') inQuotes = !inQuotes;
    if (!inQuotes && counts[c] !== undefined) counts[c]++;
  }
  let best: ',' | ';' | '\t' | '|' = ',';
  let max = -1;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      best = delim as ',' | ';' | '\t' | '|';
    }
  }
  return best;
}

export function parseDelimitedText(text: string, delimiter?: ',' | ';' | '\t' | '|'): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = delimiter || detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const next = clean[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delim && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}



export function sanitizeNumber(value: unknown): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (!value) return 0;
  let str = String(value).trim();
  // Retirer devises et espaces
  str = str.replace(/[€$£dtDT]/gi, '').replace(/\s+/g, '');
  // Déterminer le séparateur décimal
  if (str.includes(',') && str.includes('.')) {
    // Ex: 1,250.50 ou 1.250,50
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Virgule est décimale
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Point est décimal
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function sanitizeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const str = String(value).trim();
  if (!str) return null;

  // Format ISO : YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  // Format DD/MM/YYYY ou DD-MM-YYYY
  const frMatch = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/.exec(str);
  if (frMatch) {
    const day = parseInt(frMatch[1], 10);
    const month = parseInt(frMatch[2], 10) - 1;
    const year = parseInt(frMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }
  // Format SAP compact : YYYYMMDD
  if (/^\d{8}$/.test(str)) {
    const year = parseInt(str.substring(0, 4), 10);
    const month = parseInt(str.substring(4, 6), 10) - 1;
    const day = parseInt(str.substring(6, 8), 10);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function sanitizeMatriculeFiscal(raw: unknown): string | null {
  if (!raw) return null;
  let str = String(raw).trim().toUpperCase();
  // Format tunisien standard : 7 chiffres / 1 lettre / 1 lettre / 3 chiffres (ex: 1234567/A/M/000)
  const clean = str.replace(/[^A-Z0-9]/g, '');
  if (clean.length >= 7 && clean.length <= 13) {
    // Si c'est un format condensé sans slashs
    const numPart = clean.slice(0, 7);
    const letters = clean.slice(7, 9);
    const suffix = clean.slice(9) || '000';
    if (letters.length === 2) {
      return `${numPart}/${letters[0]}/${letters[1]}/${suffix.padStart(3, '0')}`;
    }
  }
  return str;
}

// ============================================================================
// 4. MOTEUR DE DÉTECTION & MAPPING INTELLIGENT
// ============================================================================

function normalizeHeader(header: string): string {
  // Trim whitespace, convert to lower case, replace spaces and special chars with underscores
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function detectErpSystem(headers: string[]): MigrationSourceERP {
  const normHeaders = headers.map(normalizeHeader);
  const scores: Record<MigrationSourceERP, number> = {
    SAP: 0,
    ORACLE: 0,
    SAGE: 0,
    DYNAMICS: 0,
    ODOO: 0,
    GENERIC: 0,
  };

  for (const h of normHeaders) {
    for (const erp of ['SAP', 'ORACLE', 'SAGE', 'DYNAMICS', 'ODOO'] as MigrationSourceERP[]) {
      const preset = ERP_PRESETS[erp];
      for (const sig of preset.signatures) {
        if (h === sig || h.includes(sig)) {
          scores[erp] += 2;
        }
      }
    }
  }

  let best: MigrationSourceERP = 'GENERIC';
  let maxScore = 0;
  for (const [erp, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      best = erp as MigrationSourceERP;
    }
  }
  return best;
}

export function buildFieldMappings(
  sourceHeaders: string[],
  targetDomain: MigrationTargetDomain,
  selectedErp?: MigrationSourceERP,
): FieldMappingProposal[] {
  const erp = selectedErp || detectErpSystem(sourceHeaders);
  const targetFields = TARGET_DOMAIN_FIELDS[targetDomain] || [];
  const presetMappings = ERP_PRESETS[erp]?.domainMappings[targetDomain] || {};
  const proposals: FieldMappingProposal[] = [];

  const matchedTargets = new Set<string>();

  for (const rawCol of sourceHeaders) {
    const colNorm = normalizeHeader(rawCol);
    let matchedField: string | null = null;
    let confidence = 0;
    let matchType: 'EXACT' | 'PRESET' | 'FUZZY' | 'NONE' = 'NONE';

    // 1. Preset direct
    if (presetMappings[colNorm] && !matchedTargets.has(presetMappings[colNorm])) {
      matchedField = presetMappings[colNorm];
      confidence = 100;
      matchType = 'PRESET';
    } else {
      // 2. Recherche exacte sur le nom de champ ou ses synonymes
      for (const f of targetFields) {
        if (matchedTargets.has(f.name)) continue;

        if (colNorm === normalizeHeader(f.name) || colNorm === normalizeHeader(f.label)) {
          matchedField = f.name;
          confidence = 98;
          matchType = 'EXACT';
          break;
        }

        for (const syn of f.synonyms) {
          const normSyn = normalizeHeader(syn);
          if (colNorm === normSyn) {
            matchedField = f.name;
            confidence = 95;
            matchType = 'EXACT';
            break;
          }
          if (colNorm.includes(normSyn) || normSyn.includes(colNorm)) {
            if (confidence < 75) {
              matchedField = f.name;
              confidence = 75;
              matchType = 'FUZZY';
            }
          }
        }
        if (confidence >= 95) break;
      }
    }

    if (matchedField) {
      matchedTargets.add(matchedField);
    }

    proposals.push({
      sourceColumn: rawCol,
      targetField: matchedField,
      confidence,
      matchedBy: matchType,
    });
  }

  return proposals;
}

// ============================================================================
// 5. MOTEUR DE SIMULATION & CONTRÔLE DE CONFORMITÉ (DRY-RUN)
// ============================================================================

export function simulateMigration(
  rows: Record<string, unknown>[],
  targetDomain: MigrationTargetDomain,
  fieldMapping: Record<string, string>, // sourceColumn -> targetField
  sourceErp: MigrationSourceERP = 'GENERIC',
): MigrationSimulationResult {
  const targetFields = TARGET_DOMAIN_FIELDS[targetDomain] || [];
  const requiredFields = targetFields.filter((f) => f.required).map((f) => f.name);

  const errors: MigrationSimulationResult['errors'] = [];
  const warnings: MigrationSimulationResult['warnings'] = [];
  const sampleTransformed: Record<string, unknown>[] = [];
  const seenCodes = new Set<string>();

  let validCount = 0;
  let invalidCount = 0;

  rows.forEach((rawRow, idx) => {
    const rowNumber = idx + 1;
    const transformed: Record<string, unknown> = {};
    let rowHasError = false;

    // Appliquer le mapping
    for (const [sourceCol, targetFld] of Object.entries(fieldMapping)) {
      if (!targetFld || targetFld === 'IGNORE') continue;
      transformed[targetFld] = rawRow[sourceCol];
    }

    // Appliquer les valeurs par défaut
    for (const f of targetFields) {
      if (transformed[f.name] === undefined && f.defaultValue !== undefined) {
        transformed[f.name] = f.defaultValue;
      }
    }

    // Nettoyage et typage adapté
    if (targetDomain === 'CHART_OF_ACCOUNTS') {
      if (transformed.code) {
        transformed.code = String(transformed.code).trim();
        // Calculer automatiquement classNumber si absent
        if (!transformed.classNumber && typeof transformed.code === 'string') {
          const firstChar = parseInt(transformed.code[0], 10);
          if (firstChar >= 1 && firstChar <= 7) {
            transformed.classNumber = firstChar;
          }
        }
      }
      if (!transformed.type && transformed.classNumber) {
        const c = Number(transformed.classNumber);
        if (c >= 1 && c <= 3) transformed.type = 'Asset';
        else if (c === 4) transformed.type = 'Liability';
        else if (c === 5) transformed.type = 'Asset';
        else if (c === 6) transformed.type = 'Expense';
        else if (c === 7) transformed.type = 'Revenue';
      }
    } else if (targetDomain === 'CUSTOMERS' || targetDomain === 'VENDORS') {
      if (transformed.fiscalId) {
        transformed.fiscalId = sanitizeMatriculeFiscal(transformed.fiscalId);
      }
    } else if (targetDomain === 'MATERIALS') {
      transformed.unitPrice = sanitizeNumber(transformed.unitPrice);
      transformed.costPrice = sanitizeNumber(transformed.costPrice);
      transformed.quantity = sanitizeNumber(transformed.quantity);
    } else if (targetDomain === 'EMPLOYEES') {
      transformed.baseSalary = sanitizeNumber(transformed.baseSalary);
      if (!transformed.email && transformed.empId) {
        transformed.email = `employe.${(transformed.empId as string).toLowerCase()}@safe-erp.local`;
      }
    } else if (targetDomain === 'FIXED_ASSETS') {
      transformed.grossValue = Math.round(sanitizeNumber(transformed.grossValue));
      transformed.usefulLifeMonths = Math.round(sanitizeNumber(transformed.usefulLifeMonths) || 60);
    }

    // Contrôles des champs obligatoires
    for (const req of requiredFields) {
      const val = transformed[req];
      if (val === undefined || val === null || String(val).trim() === '') {
        errors.push({
          rowNumber,
          field: req,
          message: `Le champ obligatoire « ${req} » est absent ou vide.`,
          rawValue: val,
        });
        rowHasError = true;
      }
    }

    // Contrôle d'unicité dans le lot
    const codeVal = String(transformed.code || transformed.sku || transformed.empId || '').trim();
    if (codeVal) {
      if (seenCodes.has(codeVal)) {
        warnings.push({
          rowNumber,
          field: 'code',
          message: `Doublon détecté pour l’identifiant « ${codeVal} » : la ligne écrasera la précédente si l’option Upsert est activée.`,
        });
      } else {
        seenCodes.add(codeVal);
      }
    }

    if (rowHasError) {
      invalidCount++;
    } else {
      validCount++;
    }

    if (sampleTransformed.length < 5) {
      sampleTransformed.push(transformed);
    }
  });

  return {
    sourceErp,
    targetDomain,
    totalRows: rows.length,
    validRows: validCount,
    invalidRows: invalidCount,
    warningCount: warnings.length,
    errors,
    warnings,
    sampleTransformed,
  };
}

// ============================================================================
// 6. EXÉCUTEUR TRANSACTIONNEL D'IMPORTATION ("SANS OBSTACLE")
// ============================================================================

export async function executeMigration(
  entityId: string,
  targetDomain: MigrationTargetDomain,
  rows: Record<string, unknown>[],
  fieldMapping: Record<string, string>,
  options: {
    updateExisting?: boolean;
    skipErrors?: boolean;
    sourceErp?: MigrationSourceERP;
  } = {},
  actorUserId?: string,
): Promise<MigrationExecutionResult> {
  const startTime = Date.now();
  // prisma est le singleton exporté en tête de fichier
  const simulation = simulateMigration(rows, targetDomain, fieldMapping, options.sourceErp);

  if (simulation.invalidRows > 0 && !options.skipErrors) {
    throw new Error(
      `Impossible d'exécuter la migration : ${simulation.invalidRows} ligne(s) contiennent des erreurs bloquantes. Activez l'option 'Ignorer les erreurs' pour forcer l'importation partielle.`
    );
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Récupérer le CountryProfile associé à l'entité
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, country: { select: { code: true } } },
  });

  const countryCode = entity?.country?.code || 'TN';
  let countryProfile = await prisma.countryProfile.findUnique({
    where: { code: countryCode },
  });

  if (!countryProfile) {
    countryProfile = await prisma.countryProfile.create({
      data: {
        code: countryCode,
        name: countryCode === 'TN' ? 'Tunisie' : countryCode,
        currencyCode: countryCode === 'TN' ? 'TND' : 'EUR',
      },
    });
  }

  // Traiter les lignes
  for (const rawRow of rows) {
    try {
      const transformed: Record<string, unknown> = {};
      for (const [sourceCol, targetFld] of Object.entries(fieldMapping)) {
        if (!targetFld || targetFld === 'IGNORE') continue;
        transformed[targetFld] = rawRow[sourceCol];
      }

      if (targetDomain === 'CHART_OF_ACCOUNTS') {
        const code = String(transformed.code || '').trim();
        const description = String(transformed.description || code).trim();
        if (!code) { skippedCount++; continue; }
        const classNumber = Number(transformed.classNumber) || parseInt(code[0], 10) || 1;
        const type = String(transformed.type || 'Asset');

        const existing = await prisma.chartOfAccount.findUnique({
          where: { countryId_code: { countryId: countryProfile.id, code } },
        });

        if (existing) {
          if (options.updateExisting) {
            await prisma.chartOfAccount.update({
              where: { id: existing.id },
              data: { description, classNumber, type },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          await prisma.chartOfAccount.create({
            data: {
              countryId: countryProfile.id,
              code,
              description,
              classNumber,
              type,
            },
          });
          insertedCount++;
        }
      } else if (targetDomain === 'CUSTOMERS') {
        const code = String(transformed.code || '').trim();
        const name = String(transformed.name || code).trim();
        if (!code || !name) { skippedCount++; continue; }

        const fiscalId = sanitizeMatriculeFiscal(transformed.fiscalId);
        const email = transformed.email ? String(transformed.email).trim() : null;
        const phone = transformed.phone ? String(transformed.phone).trim() : null;
        const address = transformed.address ? String(transformed.address).trim() : null;

        const existing = await prisma.customer.findUnique({
          where: { entityId_code: { entityId, code } },
        });

        if (existing) {
          if (options.updateExisting) {
            await prisma.customer.update({
              where: { id: existing.id },
              data: { name, fiscalId, email, phone, address },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          await prisma.customer.create({
            data: {
              entityId,
              code,
              name,
              fiscalId,
              email,
              phone,
              address,
            },
          });
          insertedCount++;
        }
      } else if (targetDomain === 'VENDORS') {
        const code = String(transformed.code || '').trim();
        const name = String(transformed.name || code).trim();
        if (!code || !name) { skippedCount++; continue; }

        const fiscalId = sanitizeMatriculeFiscal(transformed.fiscalId);
        const email = transformed.email ? String(transformed.email).trim() : null;
        const phone = transformed.phone ? String(transformed.phone).trim() : null;
        const address = transformed.address ? String(transformed.address).trim() : null;

        const existing = await prisma.vendor.findUnique({
          where: { code },
        });

        if (existing) {
          if (options.updateExisting) {
            await prisma.vendor.update({
              where: { id: existing.id },
              data: { name, fiscalId, email, phone, address, entityId },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          await prisma.vendor.create({
            data: {
              entityId,
              code,
              name,
              fiscalId,
              email,
              phone,
              address,
            },
          });
          insertedCount++;
        }
      } else if (targetDomain === 'MATERIALS') {
        const sku = String(transformed.sku || '').trim();
        const name = String(transformed.name || sku).trim();
        if (!sku || !name) { skippedCount++; continue; }

        const unitCode = String(transformed.unitCode || 'EA').trim();
        const barcode = transformed.barcode ? String(transformed.barcode).trim() : null;
        const unitPrice = sanitizeNumber(transformed.unitPrice);
        const costPrice = sanitizeNumber(transformed.costPrice);
        const quantity = sanitizeNumber(transformed.quantity);

        const existing = await prisma.material.findUnique({
          where: { sku },
        });

        if (existing) {
          if (options.updateExisting) {
            await prisma.material.update({
              where: { id: existing.id },
              data: { name, unitCode, barcode, unitPrice, costPrice, quantity, entityId },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          await prisma.material.create({
            data: {
              entityId,
              sku,
              name,
              unitCode,
              barcode,
              unitPrice,
              costPrice,
              quantity,
            },
          });
          insertedCount++;
        }
      } else if (targetDomain === 'EMPLOYEES') {
        const empId = String(transformed.empId || '').trim();
        const firstName = String(transformed.firstName || '').trim();
        const lastName = String(transformed.lastName || '').trim();
        const email = String(transformed.email || `emp.${empId.toLowerCase()}@safe.local`).trim();
        if (!empId || !firstName || !lastName) { skippedCount++; continue; }

        const cin = transformed.cin ? String(transformed.cin).trim() : null;
        const cnssNumber = transformed.cnssNumber ? String(transformed.cnssNumber).trim() : null;
        const baseSalary = sanitizeNumber(transformed.baseSalary) || 1500.0;
        const position = transformed.position ? String(transformed.position).trim() : 'COLLABORATEUR';

        const existing = await prisma.employee.findUnique({
          where: { empId },
        });

        if (existing) {
          if (options.updateExisting) {
            await prisma.employee.update({
              where: { id: existing.id },
              data: { firstName, lastName, email, cin, cnssNumber, baseSalary, position, entityId },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          await prisma.employee.create({
            data: {
              entityId,
              empId,
              firstName,
              lastName,
              email,
              cin,
              cnssNumber,
              baseSalary,
              position,
            },
          });
          insertedCount++;
        }
      } else if (targetDomain === 'COST_CENTERS') {
        const code = String(transformed.code || '').trim();
        const name = String(transformed.name || code).trim();
        const department = String(transformed.department || 'DIRECTION').trim();
        if (!code) { skippedCount++; continue; }

        const existing = await prisma.costCenter.findUnique({
          where: { code },
        });

        if (existing) {
          if (options.updateExisting) {
            await prisma.costCenter.update({
              where: { id: existing.id },
              data: { name, department, entityId },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          await prisma.costCenter.create({
            data: {
              entityId,
              code,
              name,
              department,
            },
          });
          insertedCount++;
        }
      } else if (targetDomain === 'FIXED_ASSETS') {
        const code = String(transformed.code || '').trim();
        const name = String(transformed.name || code).trim();
        if (!code || !name) { skippedCount++; continue; }

        const grossValue = Math.round(sanitizeNumber(transformed.grossValue));
        const usefulLifeMonths = Math.round(sanitizeNumber(transformed.usefulLifeMonths) || 60);
        const category = String(transformed.category || 'GENERAL');

        const existing = await prisma.fixedAsset.findUnique({
          where: { entityId_code: { entityId, code } },
        });

        if (existing) {
          if (options.updateExisting) {
            await prisma.fixedAsset.update({
              where: { id: existing.id },
              data: { name, category, grossValue, usefulLifeMonths },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          await prisma.fixedAsset.create({
            data: {
              entityId,
              code,
              name,
              category,
              acquisitionDate: new Date(),
              inServiceDate: new Date(),
              grossValue,
              bookValue: grossValue,
              usefulLifeMonths,
              assetAccountCode: '22',
              depreciationAccountCode: '282',
              expenseAccountCode: '681',
              supportingDocumentReference: `MIGRATION-${options.sourceErp || 'ERP'}`,
              createdByUserId: actorUserId || 'SYSTEM_MIGRATION',
            },
          });
          insertedCount++;
        }
      }
    } catch {
      skippedCount++;
    }
  }

  const durationMs = Date.now() - startTime;

  // Trace d'audit
  try {
    await prisma.adminUserEvent.create({
      data: {
        actorUserId: actorUserId || 'SYSTEM_MIGRATION',
        actorUsername: 'MIGRATION_HUB',
        targetUserId: actorUserId || 'SYSTEM_MIGRATION',
        targetUsername: 'MIGRATION_HUB',
        action: `ERP_MIGRATION_${targetDomain}`,
        nextRole: 'MIGRATION',
        previousEntityId: entityId,
        nextEntityId: entityId,
      },
    });
  } catch {
    // Si la table de trace n'est pas dispo, on n'interrompt pas la migration
  }

  return {
    success: true,
    targetDomain,
    sourceErp: options.sourceErp || 'GENERIC',
    totalProcessed: rows.length,
    insertedCount,
    updatedCount,
    skippedCount,
    durationMs,
    auditTrailReference: `MIG-${targetDomain}-${Date.now()}`,
    details: `Migration exécutée avec succès : ${insertedCount} créés, ${updatedCount} mis à jour, ${skippedCount} ignorés en ${durationMs}ms.`,
  };
}
