/**
 * multiEmployeePayrollService.ts
 * Module de traitement de paie multi-salariés en simultané pour SAFE ERP.
 * Supporte l'importation de fichiers Excel (.xlsx, .xls), CSV (.csv) et PDF (.pdf),
 * le calcul simultané des paies selon les taux personnalisés officiels,
 * la synthèse des charges sociales & fiscales et l'exportation des résultats.
 */

export interface PayrollSimulationInputs {
  fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT' | 'RETIREMENT_SAVINGS' | 'LIFE_INSURANCE';
  baseSalary: number;
  presenceBonus: number;
  transportBonus: number;
  isHeadOfFamily: boolean;
  childrenCount: number;
  dependentParents: number;
  complementaryRetirementRate: number;
}

export interface CustomPayrollRates {
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
  employerInsuranceRate: number;
  employeeInsuranceRate: number;
  assuranceDecesRate: number;
  assuranceInvaliditeRate: number;
  assuranceMaladieRate: number;
  irppBrackets: Array<{ min: number; max: number; rate: number }>;
}

export interface MultiEmployeePayrollResult {
  country: string;
  currency: string;
  currencySymbol: string;
  grossSalary: number;
  employeeCnss: number;
  taxableGross: number;
  fraisProfessionnels: number;
  chefDeFamille: number;
  enfantACharge: number;
  retirementBonusDeduction: number;
  netImposable: number;
  irpp: number;
  irppBeforeRetirementGain: number;
  css: number;
  cssBeforeRetirementGain: number;
  gainIrpp: number;
  gainCss: number;
  assuranceDeces: number;
  assuranceInvalidite: number;
  assuranceMaladie: number;
  employeeInsurance: number;
  totalImpots: number;
  totalGain: number;
  totalImpotsApresGains: number;
  intermediateNet: number;
  parentACharge: number;
  totalRetenue: number;
  netSalary: number;
  // Charges patronales calculées
  employerCnss: number;
  workAccident: number;
  foprolos: number;
  totalAssurancesPatronales: number;
  totalEmployerCharges: number;
  totalCoutGlobal: number; // Brut + Charges patronales
}

export interface MultiEmployeeRecord {
  id: string;
  matricule: string;
  employeeName: string;
  department: string;
  position: string;
  inputs: PayrollSimulationInputs;
  result?: MultiEmployeePayrollResult;
}

export interface MultiEmployeeTotals {
  count: number;
  totalGross: number;
  totalCnssEmployee: number;
  totalNetImposable: number;
  totalIrpp: number;
  totalCss: number;
  totalNetSalary: number;
  totalAssuranceDeces: number;
  totalAssuranceInvalidite: number;
  totalAssuranceMaladie: number;
  totalAssurancesPatronales: number;
  totalEmployerCnss: number;
  totalWorkAccident: number;
  totalFoprolos: number;
  totalEmployerCharges: number;
  totalCoutGlobal: number;
}

function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

/**
 * Calcul exact du bulletin d'un salarié
 */
export function calculateSinglePayslip(
  inputs: PayrollSimulationInputs,
  rates: CustomPayrollRates,
  countryCode = 'TN',
): MultiEmployeePayrollResult {
  const grossSalary = round3((Number(inputs.baseSalary) || 0) + (Number(inputs.presenceBonus) || 0) + (Number(inputs.transportBonus) || 0));
  const employeeCnss = round3(grossSalary * (rates.cnssEmployeeRate / 100));
  const taxableGross = Math.max(0, round3(grossSalary - employeeCnss));
  const annualTaxableGross = taxableGross * 12;
  const annualProfExpenses = Math.min(annualTaxableGross * (rates.profExpensesRate / 100), rates.profExpensesMaxCap);
  const annualFamilyDeductions = (inputs.isHeadOfFamily ? rates.headOfFamilyDeduction : 0)
    + ((Number(inputs.childrenCount) || 0) * rates.childDeduction);

  const benefitRate = Number(inputs.complementaryRetirementRate) || 0;
  // Calcul de l’Avantage fiscal assis sur le Salaire Brut Total (Base + Primes)
  const retirementBonusDeduction = inputs.fiscalBenefitType === 'COMPLEMENTARY_RETIREMENT'
    ? round3(grossSalary * (benefitRate / 100))
    : inputs.fiscalBenefitType === 'RETIREMENT_SAVINGS'
      ? round3(grossSalary * ((benefitRate > 0 ? benefitRate : 4) / 100))
      : inputs.fiscalBenefitType === 'LIFE_INSURANCE'
        ? round3(grossSalary * ((benefitRate > 0 ? benefitRate : 3) / 100))
        : 0;

  const annualNetBeforeGain = Math.max(0, annualTaxableGross - annualProfExpenses - annualFamilyDeductions);
  const annualNetAfterGain = Math.max(0, annualNetBeforeGain - retirementBonusDeduction * 12);

  const calcAnnualIrpp = (annualNet: number) => {
    let total = 0;
    for (const b of rates.irppBrackets) {
      if (annualNet > b.min) {
        total += Math.max(0, Math.min(annualNet, b.max) - b.min) * (b.rate / 100);
      }
    }
    return total;
  };

  const irppBeforeRetirementGain = round3(calcAnnualIrpp(annualNetBeforeGain) / 12);
  const irpp = round3(calcAnnualIrpp(annualNetAfterGain) / 12);
  const cssBeforeRetirementGain = round3((annualNetBeforeGain * (rates.cssRate / 100)) / 12);
  const css = round3((annualNetAfterGain * (rates.cssRate / 100)) / 12);

  const gainIrpp = Math.max(0, round3(irppBeforeRetirementGain - irpp));
  const gainCss = Math.max(0, round3(cssBeforeRetirementGain - css));
  const totalImpots = round3(irppBeforeRetirementGain + cssBeforeRetirementGain);
  const totalGain = round3(gainIrpp + gainCss);
  const totalImpotsApresGains = round3(irpp + css);

  // 1- Assurance Décès = 0.5% * Total brut (100% Charge Patronale)
  const assuranceDeces = round3(grossSalary * (rates.assuranceDecesRate / 100));
  // 2- Assurance Invalidité = 0.78400752510838% * Total Brut (100% Charge Patronale)
  const assuranceInvalidite = round3(grossSalary * (rates.assuranceInvaliditeRate / 100));
  // 3- Assurance Maladie = 0.0048212520380679 * Total Brut (100% Charge Patronale)
  const effectiveMaladieRate = rates.assuranceMaladieRate < 0.01 ? rates.assuranceMaladieRate * 100 : rates.assuranceMaladieRate;
  const assuranceMaladie = round3(grossSalary * (effectiveMaladieRate / 100));

  const employeeInsurance = round3(grossSalary * (rates.employeeInsuranceRate / 100));
  const parentACharge = round3(((Number(inputs.dependentParents) || 0) * rates.parentDeduction) / 12);
  const intermediateNet = round3(grossSalary - employeeCnss - irpp - css);
  // Retenues salariales : les 3 assurances sont exclusivement patronales
  const totalRetenue = round3(employeeCnss + irpp + css + employeeInsurance + parentACharge);
  const netSalary = round3(grossSalary - totalRetenue);

  // Charges patronales
  const employerCnss = round3(grossSalary * (rates.cnssEmployerRate / 100));
  const workAccident = round3(grossSalary * (rates.workAccidentRate / 100));
  const foprolos = round3(grossSalary * (rates.foprolosRate / 100));
  const totalAssurancesPatronales = round3(assuranceDeces + assuranceInvalidite + assuranceMaladie);
  const totalEmployerCharges = round3(employerCnss + workAccident + foprolos + totalAssurancesPatronales);
  const totalCoutGlobal = round3(grossSalary + totalEmployerCharges);

  return {
    country: countryCode,
    currency: 'TND',
    currencySymbol: 'DT',
    grossSalary,
    employeeCnss,
    taxableGross,
    fraisProfessionnels: round3(annualProfExpenses / 12),
    chefDeFamille: round3((inputs.isHeadOfFamily ? rates.headOfFamilyDeduction : 0) / 12),
    enfantACharge: round3(((Number(inputs.childrenCount) || 0) * rates.childDeduction) / 12),
    retirementBonusDeduction,
    netImposable: round3(annualNetAfterGain / 12),
    irpp,
    irppBeforeRetirementGain,
    css,
    cssBeforeRetirementGain,
    gainIrpp,
    gainCss,
    assuranceDeces,
    assuranceInvalidite,
    assuranceMaladie,
    employeeInsurance,
    totalImpots,
    totalGain,
    totalImpotsApresGains,
    intermediateNet,
    parentACharge,
    totalRetenue,
    netSalary,
    employerCnss,
    workAccident,
    foprolos,
    totalAssurancesPatronales,
    totalEmployerCharges,
    totalCoutGlobal,
  };
}

/**
 * Calcul simultané de la paie pour l'ensemble des salariés
 */
export function calculateAllEmployees(
  records: MultiEmployeeRecord[],
  rates: CustomPayrollRates,
): MultiEmployeeRecord[] {
  return records.map((rec) => ({
    ...rec,
    result: calculateSinglePayslip(rec.inputs, rates, 'TN'),
  }));
}

/**
 * Synthèse globale des totaux de paie multi-salariés
 */
export function computeMultiEmployeeTotals(records: MultiEmployeeRecord[]): MultiEmployeeTotals {
  return records.reduce<MultiEmployeeTotals>(
    (acc, rec) => {
      if (!rec.result) return acc;
      const res = rec.result;
      acc.count += 1;
      acc.totalGross = round3(acc.totalGross + res.grossSalary);
      acc.totalCnssEmployee = round3(acc.totalCnssEmployee + res.employeeCnss);
      acc.totalNetImposable = round3(acc.totalNetImposable + res.netImposable);
      acc.totalIrpp = round3(acc.totalIrpp + res.irpp);
      acc.totalCss = round3(acc.totalCss + res.css);
      acc.totalNetSalary = round3(acc.totalNetSalary + res.netSalary);
      acc.totalAssuranceDeces = round3(acc.totalAssuranceDeces + res.assuranceDeces);
      acc.totalAssuranceInvalidite = round3(acc.totalAssuranceInvalidite + res.assuranceInvalidite);
      acc.totalAssuranceMaladie = round3(acc.totalAssuranceMaladie + res.assuranceMaladie);
      acc.totalAssurancesPatronales = round3(acc.totalAssurancesPatronales + res.totalAssurancesPatronales);
      acc.totalEmployerCnss = round3(acc.totalEmployerCnss + res.employerCnss);
      acc.totalWorkAccident = round3(acc.totalWorkAccident + res.workAccident);
      acc.totalFoprolos = round3(acc.totalFoprolos + res.foprolos);
      acc.totalEmployerCharges = round3(acc.totalEmployerCharges + res.totalEmployerCharges);
      acc.totalCoutGlobal = round3(acc.totalCoutGlobal + res.totalCoutGlobal);
      return acc;
    },
    {
      count: 0,
      totalGross: 0,
      totalCnssEmployee: 0,
      totalNetImposable: 0,
      totalIrpp: 0,
      totalCss: 0,
      totalNetSalary: 0,
      totalAssuranceDeces: 0,
      totalAssuranceInvalidite: 0,
      totalAssuranceMaladie: 0,
      totalAssurancesPatronales: 0,
      totalEmployerCnss: 0,
      totalWorkAccident: 0,
      totalFoprolos: 0,
      totalEmployerCharges: 0,
      totalCoutGlobal: 0,
    },
  );
}

/**
 * Normalisation des valeurs numériques importées
 */
function parseNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  const cleaned = String(val)
    .replace(/\s+/g, '')
    .replace(/TND|DT|EUR|USD/gi, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Normalisation booléenne
 */
function parseBoolean(val: unknown, fallback = false): boolean {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'boolean') return val;
  const str = String(val).trim().toLowerCase();
  if (['1', 'true', 'vrai', 'oui', 'yes', 'o', 'y'].includes(str)) return true;
  if (['0', 'false', 'faux', 'non', 'no', 'n'].includes(str)) return false;
  return fallback;
}

/**
 * Normalisation des en-têtes
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Conversion d'une ligne d'objet générique en enregistrement salarié
 */
function rowToMultiEmployeeRecord(row: Record<string, unknown>, index: number): MultiEmployeeRecord {
  const normMap: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normMap[normalizeHeader(key)] = value;
  }

  const matricule = String(
    normMap.matricule ||
    normMap.mat ||
    normMap.code ||
    normMap.code_salarie ||
    normMap.id ||
    `MAT-${String(index + 1).padStart(3, '0')}`,
  ).trim();

  const employeeName = String(
    normMap.nom_prenom ||
    normMap.salarie ||
    normMap.nom ||
    normMap.employee ||
    normMap.nom_et_prenom ||
    normMap.collaborateur ||
    `Salarié ${index + 1}`,
  ).trim();

  const department = String(normMap.departement || normMap.service || normMap.direction || 'Direction Générale').trim();
  const position = String(normMap.poste || normMap.fonction || normMap.titre || 'Collaborateur').trim();

  const baseSalary = parseNumber(
    normMap.salaire_base ||
    normMap.base ||
    normMap.salaire ||
    normMap.salaire_de_base ||
    normMap.brut_base,
    3000,
  );

  const presenceBonus = parseNumber(
    normMap.prime_presence ||
    normMap.presence ||
    normMap.prime_de_presence,
    0,
  );

  const transportBonus = parseNumber(
    normMap.prime_transport ||
    normMap.transport ||
    normMap.prime_de_transport,
    0,
  );

  const isHeadOfFamily = parseBoolean(
    normMap.chef_famille ||
    normMap.chef_de_famille ||
    normMap.head_of_family ||
    normMap.isheadoffamily,
    false,
  );

  const childrenCount = Math.max(
    0,
    Math.floor(
      parseNumber(
        normMap.enfants ||
        normMap.enfants_charge ||
        normMap.enfants_a_charge ||
        normMap.children_count,
        0,
      ),
    ),
  );

  const dependentParents = Math.min(
    2,
    Math.max(
      0,
      Math.floor(
        parseNumber(
          normMap.parents ||
          normMap.parents_charge ||
          normMap.parents_a_charge ||
          normMap.dependent_parents,
          0,
        ),
      ),
    ),
  );

  let fiscalBenefitType: PayrollSimulationInputs['fiscalBenefitType'] = 'COMPLEMENTARY_RETIREMENT';
  const benefitRaw = String(
    normMap.avantage_fiscal ||
    normMap.dispositif_avantage_fiscal ||
    normMap.type_avantage ||
    normMap.fiscal_benefit_type ||
    '',
  ).toUpperCase();

  if (benefitRaw.includes('EPARGNE') || benefitRaw.includes('SAVING')) {
    fiscalBenefitType = 'RETIREMENT_SAVINGS';
  } else if (benefitRaw.includes('VIE') || benefitRaw.includes('LIFE')) {
    fiscalBenefitType = 'LIFE_INSURANCE';
  }

  const complementaryRetirementRate = parseNumber(
    normMap.taux_avantage ||
    normMap.taux_retraite ||
    normMap.taux_avantage_fiscal ||
    normMap.benefit_rate,
    4,
  );

  return {
    id: `emp-${Date.now()}-${index}`,
    matricule,
    employeeName,
    department,
    position,
    inputs: {
      fiscalBenefitType,
      baseSalary,
      presenceBonus,
      transportBonus,
      isHeadOfFamily,
      childrenCount,
      dependentParents,
      complementaryRetirementRate,
    },
  };
}

/**
 * Parsing d'un fichier CSV
 */
function parseCsvContent(text: string): Array<Record<string, unknown>> {
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) throw new Error('Le fichier CSV est vide.');

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('Le fichier CSV doit comporter au moins une ligne d’en-têtes et une ligne de données.');

  // Détection du délimiteur
  const firstLine = lines[0];
  const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === sep && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseRow(lines[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseRow(lines[i]);
    const record: Record<string, unknown> = {};
    headers.forEach((header, colIdx) => {
      record[header] = values[colIdx] ?? '';
    });
    if (Object.values(record).some((v) => v !== '' && v !== null && v !== undefined)) {
      rows.push(record);
    }
  }

  return rows;
}

/**
 * Parsing de fichier PDF contenant des fiches de paie ou liste de salariés
 */
async function parsePdfContent(file: File): Promise<Array<Record<string, unknown>>> {
  const pdfjsLib = await import('pdfjs-dist');
  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
    } catch {
      // ignore
    }
  }
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows: Array<Record<string, unknown>> = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{ str: string; transform: number[] }>;

    // Regrouper par lignes selon coordonnée Y
    const lineMap = new Map<number, string[]>();
    items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(item.str.trim());
    });

    // Trier les lignes du haut vers le bas
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);

    for (const y of sortedY) {
      const parts = lineMap.get(y)!.filter((p) => p.length > 0);
      const lineStr = parts.join(' ');

      // Détecter un matricule et un montant de salaire dans la ligne
      // Ex: "MAT-001 Mohamed Ali 3500.000 150.000 80.000" ou "EMP02 Fatma Mansour 4200"
      const match = lineStr.match(/^(?:([A-Z0-9_\-\.]+)\s+)?([A-Za-zÀ-ÖØ-öø-ÿ\s'-]{3,35})\s+([\d\s.,]+)(?:\s+([\d\s.,]+))?(?:\s+([\d\s.,]+))?/);
      if (match && !lineStr.toLowerCase().includes('matricule') && !lineStr.toLowerCase().includes('salaire')) {
        const matricule = match[1] || `MAT-${String(rows.length + 1).padStart(3, '0')}`;
        const employeeName = match[2].trim();
        const baseSalary = parseNumber(match[3], 2500);
        const presenceBonus = match[4] ? parseNumber(match[4], 0) : 0;
        const transportBonus = match[5] ? parseNumber(match[5], 0) : 0;

        if (employeeName && baseSalary > 0) {
          rows.push({
            matricule,
            nom_prenom: employeeName,
            salaire_base: baseSalary,
            prime_presence: presenceBonus,
            prime_transport: transportBonus,
          });
        }
      }
    }
  }

  if (rows.length === 0) {
    // Si aucun motif structuré n'a été détecté dans le PDF, créer 3 lignes par défaut pour assister l'utilisateur
    throw new Error(
      'Le PDF ne contient pas de tableau de salaires directement exploitable. ' +
      'Veuillez utiliser un fichier Excel (.xlsx) ou CSV, ou un PDF exporté depuis un logiciel de paie avec colonnes lisibles.'
    );
  }

  return rows;
}

/**
 * Importeur universel : Excel (.xlsx, .xls), CSV (.csv) et PDF (.pdf)
 */
export async function parseMultiEmployeeFile(file: File): Promise<MultiEmployeeRecord[]> {
  const extension = file.name.toLowerCase().split('.').pop();
  let rawRows: Array<Record<string, unknown>> = [];

  if (extension === 'csv' || extension === 'txt') {
    const text = await file.text();
    rawRows = parseCsvContent(text);
  } else if (extension === 'xlsx' || extension === 'xls') {
    const excelModule = await import('exceljs');
    const ExcelJS = (excelModule as unknown as { default?: typeof excelModule }).default ?? excelModule;
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      throw new Error('Le classeur Excel doit comporter une ligne d’en-têtes et au moins un salarié.');
    }

    // Recherche de la ligne d'en-tête (ligne 1 ou 2)
    let headerRowIdx = 1;
    let headers: string[] = [];
    for (let r = 1; r <= Math.min(5, sheet.rowCount); r += 1) {
      const rowVals = sheet.getRow(r).values;
      const candidates = (Array.isArray(rowVals) ? rowVals.slice(1) : [])
        .map((v) => String(v ?? '').trim());
      if (candidates.some((c) => /matricule|salarie|nom|salaire|base/i.test(c))) {
        headerRowIdx = r;
        headers = candidates;
        break;
      }
    }

    if (!headers.length) {
      const rowVals = sheet.getRow(1).values;
      headers = (Array.isArray(rowVals) ? rowVals.slice(1) : []).map((v) => String(v ?? '').trim());
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;
      const record: Record<string, unknown> = {};
      headers.forEach((header, colIdx) => {
        if (!header) return;
        const cell = row.getCell(colIdx + 1);
        const val = cell.value;
        record[header] = val && typeof val === 'object' && 'text' in val
          ? (val as { text: string }).text
          : val && typeof val === 'object' && 'result' in val
            ? (val as { result: unknown }).result
            : val;
      });
      if (Object.values(record).some((v) => v !== null && v !== undefined && String(v).trim())) {
        rawRows.push(record);
      }
    });
  } else if (extension === 'pdf') {
    rawRows = await parsePdfContent(file);
  } else {
    throw new Error(`Extension .${extension} non supportée. Utilisez .xlsx, .xls, .csv ou .pdf.`);
  }

  if (rawRows.length === 0) {
    throw new Error('Aucun enregistrement valide n’a été détecté dans le fichier.');
  }

  return rawRows.map((row, idx) => rowToMultiEmployeeRecord(row, idx));
}

/**
 * Données d'exemple officielles pour le modèle
 */
export const SAMPLE_EMPLOYEES: MultiEmployeeRecord[] = [
  {
    id: 'emp-sample-1',
    matricule: 'DIR-001',
    employeeName: 'Mohamed Salah Trabelsi',
    department: 'Direction Générale',
    position: 'Directeur Général',
    inputs: {
      fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
      baseSalary: 6500.0,
      presenceBonus: 250.0,
      transportBonus: 150.0,
      isHeadOfFamily: true,
      childrenCount: 3,
      dependentParents: 1,
      complementaryRetirementRate: 4.0,
    },
  },
  {
    id: 'emp-sample-2',
    matricule: 'FIN-014',
    employeeName: 'Amira Ben Mahmoud',
    department: 'Direction Financière',
    position: 'Responsable Administratif & Financier',
    inputs: {
      fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
      baseSalary: 4200.0,
      presenceBonus: 180.0,
      transportBonus: 120.0,
      isHeadOfFamily: true,
      childrenCount: 2,
      dependentParents: 0,
      complementaryRetirementRate: 4.0,
    },
  },
  {
    id: 'emp-sample-3',
    matricule: 'ENG-022',
    employeeName: 'Karim Jaziri',
    department: 'R&D / Ingénierie',
    position: 'Ingénieur Principal Lead Dev',
    inputs: {
      fiscalBenefitType: 'RETIREMENT_SAVINGS',
      baseSalary: 3800.0,
      presenceBonus: 120.0,
      transportBonus: 100.0,
      isHeadOfFamily: false,
      childrenCount: 1,
      dependentParents: 0,
      complementaryRetirementRate: 4.0,
    },
  },
  {
    id: 'emp-sample-4',
    matricule: 'COM-008',
    employeeName: 'Syrine Chahed',
    department: 'Direction Commerciale',
    position: 'Key Account Manager',
    inputs: {
      fiscalBenefitType: 'LIFE_INSURANCE',
      baseSalary: 2900.0,
      presenceBonus: 200.0,
      transportBonus: 95.0,
      isHeadOfFamily: false,
      childrenCount: 0,
      dependentParents: 0,
      complementaryRetirementRate: 3.0,
    },
  },
  {
    id: 'emp-sample-5',
    matricule: 'LOG-005',
    employeeName: 'Yassine Gharbi',
    department: 'Logistique & Achats',
    position: 'Coordinateur Supply Chain',
    inputs: {
      fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT',
      baseSalary: 2100.0,
      presenceBonus: 150.0,
      transportBonus: 80.0,
      isHeadOfFamily: true,
      childrenCount: 2,
      dependentParents: 1,
      complementaryRetirementRate: 4.0,
    },
  },
];

/**
 * Téléchargement du modèle officiel d'import Excel
 */
export async function downloadExcelTemplate(): Promise<void> {
  const excelModule = await import('exceljs');
  const ExcelJS = (excelModule as unknown as { default?: typeof excelModule }).default ?? excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAFE ERP - Enterprise Architecture';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Modèle Salariés SAFE', {
    views: [{ showGridLines: true }],
  });

  sheet.columns = [
    { header: 'Matricule', key: 'matricule', width: 14 },
    { header: 'Nom_Prenom', key: 'employeeName', width: 28 },
    { header: 'Departement', key: 'department', width: 22 },
    { header: 'Poste', key: 'position', width: 24 },
    { header: 'Salaire_Base', key: 'baseSalary', width: 16 },
    { header: 'Prime_Presence', key: 'presenceBonus', width: 16 },
    { header: 'Prime_Transport', key: 'transportBonus', width: 16 },
    { header: 'Chef_Famille', key: 'isHeadOfFamily', width: 14 },
    { header: 'Enfants_Charge', key: 'childrenCount', width: 16 },
    { header: 'Parents_Charge', key: 'dependentParents', width: 16 },
    { header: 'Type_Avantage_Fiscal', key: 'fiscalBenefitType', width: 28 },
    { header: 'Taux_Avantage_Fiscal', key: 'complementaryRetirementRate', width: 22 },
  ];

  // Styliser l'en-tête
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' }, // Bleu Marine SAFE
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  SAMPLE_EMPLOYEES.forEach((emp) => {
    sheet.addRow({
      matricule: emp.matricule,
      employeeName: emp.employeeName,
      department: emp.department,
      position: emp.position,
      baseSalary: emp.inputs.baseSalary,
      presenceBonus: emp.inputs.presenceBonus,
      transportBonus: emp.inputs.transportBonus,
      isHeadOfFamily: emp.inputs.isHeadOfFamily ? 'OUI' : 'NON',
      childrenCount: emp.inputs.childrenCount,
      dependentParents: emp.inputs.dependentParents,
      fiscalBenefitType: emp.inputs.fiscalBenefitType,
      complementaryRetirementRate: emp.inputs.complementaryRetirementRate,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Modele_Import_Paie_Salaries_SAFE_ERP_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Téléchargement du modèle officiel d'import CSV
 */
export function downloadCsvTemplate(): void {
  const headers = [
    'Matricule',
    'Nom_Prenom',
    'Departement',
    'Poste',
    'Salaire_Base',
    'Prime_Presence',
    'Prime_Transport',
    'Chef_Famille',
    'Enfants_Charge',
    'Parents_Charge',
    'Type_Avantage_Fiscal',
    'Taux_Avantage_Fiscal',
  ];

  const rows = SAMPLE_EMPLOYEES.map((emp) => [
    emp.matricule,
    `"${emp.employeeName}"`,
    `"${emp.department}"`,
    `"${emp.position}"`,
    emp.inputs.baseSalary.toFixed(3),
    emp.inputs.presenceBonus.toFixed(3),
    emp.inputs.transportBonus.toFixed(3),
    emp.inputs.isHeadOfFamily ? 'OUI' : 'NON',
    emp.inputs.childrenCount,
    emp.inputs.dependentParents,
    emp.inputs.fiscalBenefitType,
    emp.inputs.complementaryRetirementRate,
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Modele_Import_Paie_Salaries_SAFE_ERP_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exportation des résultats multi-salariés au format Excel
 */
export async function exportMultiEmployeeResultsExcel(
  records: MultiEmployeeRecord[],
  totals: MultiEmployeeTotals,
): Promise<void> {
  const excelModule = await import('exceljs');
  const ExcelJS = (excelModule as unknown as { default?: typeof excelModule }).default ?? excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAFE ERP - Enterprise Architecture';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Synthèse Paie Multi-Salariés', {
    views: [{ showGridLines: true }],
  });

  sheet.columns = [
    { header: 'Matricule', key: 'matricule', width: 12 },
    { header: 'Salarié', key: 'employeeName', width: 26 },
    { header: 'Département', key: 'department', width: 20 },
    { header: 'Salaire Brut (DT)', key: 'gross', width: 18 },
    { header: 'CNSS Salarié (DT)', key: 'cnssEmp', width: 18 },
    { header: 'Net Imposable (DT)', key: 'netImp', width: 18 },
    { header: 'IRPP (DT)', key: 'irpp', width: 16 },
    { header: 'CSS (DT)', key: 'css', width: 14 },
    { header: 'Net à Payer (DT)', key: 'net', width: 18 },
    { header: 'Ass. Décès 0.5% (DT)', key: 'deces', width: 20 },
    { header: 'Ass. Invalidité 0.784% (DT)', key: 'inv', width: 24 },
    { header: 'Ass. Maladie 0.482% (DT)', key: 'mal', width: 24 },
    { header: 'Total Assurances Pat. (DT)', key: 'totAss', width: 24 },
    { header: 'Charges Pat. Totales (DT)', key: 'totPat', width: 24 },
    { header: 'Coût Global Employeur (DT)', key: 'coutTot', width: 24 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  headerRow.height = 24;

  records.forEach((rec) => {
    const res = rec.result;
    sheet.addRow({
      matricule: rec.matricule,
      employeeName: rec.employeeName,
      department: rec.department,
      gross: res ? res.grossSalary : 0,
      cnssEmp: res ? res.employeeCnss : 0,
      netImp: res ? res.netImposable : 0,
      irpp: res ? res.irpp : 0,
      css: res ? res.css : 0,
      net: res ? res.netSalary : 0,
      deces: res ? res.assuranceDeces : 0,
      inv: res ? res.assuranceInvalidite : 0,
      mal: res ? res.assuranceMaladie : 0,
      totAss: res ? res.totalAssurancesPatronales : 0,
      totPat: res ? res.totalEmployerCharges : 0,
      coutTot: res ? res.totalCoutGlobal : 0,
    });
  });

  // Ligne de totaux
  const totalRow = sheet.addRow({
    matricule: 'TOTAL',
    employeeName: `${totals.count} Salariés`,
    department: 'Tous Services',
    gross: totals.totalGross,
    cnssEmp: totals.totalCnssEmployee,
    netImp: totals.totalNetImposable,
    irpp: totals.totalIrpp,
    css: totals.totalCss,
    net: totals.totalNetSalary,
    deces: totals.totalAssuranceDeces,
    inv: totals.totalAssuranceInvalidite,
    mal: totals.totalAssuranceMaladie,
    totAss: totals.totalAssurancesPatronales,
    totPat: totals.totalEmployerCharges,
    coutTot: totals.totalCoutGlobal,
  });
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Resultats_Paie_Multi_Salaries_SAFE_ERP_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exportation des résultats multi-salariés au format CSV
 */
export function exportMultiEmployeeResultsCSV(
  records: MultiEmployeeRecord[],
  totals: MultiEmployeeTotals,
): void {
  const headers = [
    'Matricule',
    'Salarie',
    'Departement',
    'Salaire_Brut_DT',
    'CNSS_Salarie_DT',
    'Net_Imposable_DT',
    'IRPP_DT',
    'CSS_DT',
    'Net_A_Payer_DT',
    'Assurance_Deces_Patronale_DT',
    'Assurance_Invalidite_Patronale_DT',
    'Assurance_Maladie_Patronale_DT',
    'Total_Assurances_Patronales_DT',
    'Total_Charges_Patronales_DT',
    'Cout_Global_Employeur_DT',
  ];

  const rows = records.map((rec) => {
    const res = rec.result;
    return [
      rec.matricule,
      `"${rec.employeeName}"`,
      `"${rec.department}"`,
      res ? res.grossSalary.toFixed(3) : '0.000',
      res ? res.employeeCnss.toFixed(3) : '0.000',
      res ? res.netImposable.toFixed(3) : '0.000',
      res ? res.irpp.toFixed(3) : '0.000',
      res ? res.css.toFixed(3) : '0.000',
      res ? res.netSalary.toFixed(3) : '0.000',
      res ? res.assuranceDeces.toFixed(3) : '0.000',
      res ? res.assuranceInvalidite.toFixed(3) : '0.000',
      res ? res.assuranceMaladie.toFixed(3) : '0.000',
      res ? res.totalAssurancesPatronales.toFixed(3) : '0.000',
      res ? res.totalEmployerCharges.toFixed(3) : '0.000',
      res ? res.totalCoutGlobal.toFixed(3) : '0.000',
    ];
  });

  // Ligne de totaux
  rows.push([
    'TOTAL',
    `"${totals.count} Salariés"`,
    '"Tous Services"',
    totals.totalGross.toFixed(3),
    totals.totalCnssEmployee.toFixed(3),
    totals.totalNetImposable.toFixed(3),
    totals.totalIrpp.toFixed(3),
    totals.totalCss.toFixed(3),
    totals.totalNetSalary.toFixed(3),
    totals.totalAssuranceDeces.toFixed(3),
    totals.totalAssuranceInvalidite.toFixed(3),
    totals.totalAssuranceMaladie.toFixed(3),
    totals.totalAssurancesPatronales.toFixed(3),
    totals.totalEmployerCharges.toFixed(3),
    totals.totalCoutGlobal.toFixed(3),
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Resultats_Paie_Multi_Salaries_SAFE_ERP_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
