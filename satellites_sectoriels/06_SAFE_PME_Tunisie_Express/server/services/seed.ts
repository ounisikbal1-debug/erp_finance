// â”€â”€ SERVICE : jeu de donnÃ©es de dÃ©monstration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Charge exactement 900 enregistrements rÃ©partis sur les 12 mois de l'annÃ©e,
// puis gÃ©nÃ¨re les Ã©critures comptables correspondantes (partie double).
//
// RÃ©partition (900 lignes) :
//   tiers 30 Â· articles 40 Â· salariÃ©s 12 Â· cycles de paie 12 Â· bulletins 144
//   factures 168 Â· lignes de facture 168 Â· achats 108 Â· lignes d'achat 108
//   mouvements de stock 50 Â· opÃ©rations de trÃ©sorerie 36 Â· dÃ©clarations 12
//   immobilisations 12
//
// Les Ã©critures comptables (ventes, achats, paie) sont produites en plus, en
// partie double, pour que le Bilan et le Compte de RÃ©sultat soient exploitables.
import { eq } from "drizzle-orm";
import { db } from "../_core/db";
import {
  accounts,
  assets,
  bankAccounts,
  bankTransactions,
  billLines,
  bills,
  company,
  employees,
  invoiceLines,
  invoices,
  journalEntries,
  journalLines,
  partners,
  payrollRuns,
  payslips,
  products,
  stockMovements,
  taxDeclarations,
} from "../../drizzle/schema";
import { computePayslip, STAMP_DUTY } from "../../shared/fiscal";
import { ACCOUNT_LABELS } from "./accounting";

// â”€â”€ GÃ©nÃ©rateur pseudo-alÃ©atoire dÃ©terministe (mÃªme jeu Ã  chaque exÃ©cution) â”€â”€â”€
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CLIENTS = [
  "SociÃ©tÃ© GÃ©nÃ©rale de Commerce", "Ã‰tablissements Ben Amor", "Tunisie Distribution SA",
  "Groupe MÃ©diterranÃ©en de Services", "Ste Industrielle du Sahel", "Comptoir National de Quincaillerie",
  "Agro Plus Tunisie", "Techno Systems Tunis", "BÃ¢tir & Construire SARL", "Pharmacie Centrale El Manar",
  "HÃ´tel Les Palmiers", "Clinique Ibn Sina", "Transports Rapides du Sud", "Ã‰ditions Carthage",
  "Menuiserie Moderne Sfax", "Textile Nord SARL", "Ã‰lectro MÃ©nager Djerba", "Cabinet Comptable Nabeul",
  "Boulangerie El Baraka", "Garage Auto Plus",
];

const SUPPLIERS = [
  "Grossiste MatiÃ¨res PremiÃ¨res", "Fournitures de Bureau Tunis", "Ã‰nergie & Carburants SA",
  "Import Ã‰quipements Industriels", "Papeterie du Centre", "Transport & Logistique Tunisie",
  "Maintenance Industrielle SARL", "TÃ©lÃ©com Business Solutions", "Emballages MÃ©diterranÃ©e",
  "Assurances Salim",
];

const PRODUCTS = [
  ["Ordinateur portable 15\"", "produit", "U", 2450, 19],
  ["Ã‰cran 27\" 4K", "produit", "U", 890, 19],
  ["Clavier mÃ©canique", "produit", "U", 185, 19],
  ["Souris ergonomique", "produit", "U", 79, 19],
  ["Imprimante laser", "produit", "U", 1250, 19],
  ["Cartouche toner", "produit", "U", 145, 19],
  ["Ramette papier A4", "produit", "U", 12.5, 19],
  ["Onduleur 1200 VA", "produit", "U", 420, 19],
  ["Disque SSD 1 To", "produit", "U", 310, 19],
  ["Switch rÃ©seau 24 ports", "produit", "U", 780, 19],
  ["CÃ¢ble RJ45 3 m", "produit", "U", 8.5, 19],
  ["Serveur rack", "produit", "U", 6800, 19],
  ["Licence logicielle annuelle", "service", "U", 1200, 19],
  ["Maintenance informatique", "service", "H", 65, 19],
  ["Formation bureautique", "service", "J", 480, 19],
  ["Audit et conseil", "service", "J", 750, 19],
  ["HÃ©bergement cloud", "service", "M", 180, 19],
  ["DÃ©veloppement sur mesure", "service", "J", 620, 19],
  ["Bureau ergonomique", "produit", "U", 680, 19],
  ["Chaise de bureau", "produit", "U", 420, 19],
  ["Armoire mÃ©tallique", "produit", "U", 550, 19],
  ["Climatiseur 12000 BTU", "produit", "U", 1850, 19],
  ["RÃ©frigÃ©rateur de bureau", "produit", "U", 980, 19],
  ["Machine Ã  cafÃ©", "produit", "U", 340, 19],
  ["Fournitures scolaires", "produit", "U", 45, 7],
  ["Produits alimentaires", "produit", "U", 22, 7],
  ["MÃ©dicaments gÃ©nÃ©riques", "produit", "U", 15, 7],
  ["Livres et manuels", "produit", "U", 38, 7],
  ["MatÃ©riel mÃ©dical", "produit", "U", 3200, 19],
  ["Produits d'entretien", "produit", "U", 18, 19],
  ["Carburant diesel", "produit", "L", 2.2, 19],
  ["PiÃ¨ces dÃ©tachÃ©es", "produit", "U", 240, 19],
  ["Emballages carton", "produit", "U", 3.5, 19],
  ["MatiÃ¨re premiÃ¨re textile", "produit", "M", 14, 19],
  ["Peinture industrielle", "produit", "L", 28, 19],
  ["Outillage manuel", "produit", "U", 95, 19],
  ["Consommables imprimante", "produit", "U", 88, 19],
  ["Service de livraison", "service", "U", 35, 19],
  ["Installation et mise en service", "service", "U", 350, 19],
  ["Exportation de marchandises", "produit", "U", 1500, 0],
];

const FIRST_NAMES = ["Ahmed", "Mohamed", "Sami", "Leila", "Fatma", "Youssef", "Nadia", "Karim", "Ines", "Hatem", "Sonia", "Bilel"];
const LAST_NAMES = ["Ben Ali", "Trabelsi", "Gharbi", "Bouazizi", "Mansour", "Jaziri", "Chaabane", "Ferchichi", "Khelifi", "Sassi", "Ayari", "Mejri"];
const POSITIONS = ["Comptable", "Commercial", "Technicien", "Chef de service", "Assistant administratif", "DÃ©veloppeur", "Magasinier", "Directeur financier", "Responsable RH", "IngÃ©nieur", "ChargÃ© de clientÃ¨le", "Agent de production"];
const DEPARTMENTS = ["Administration", "Commercial", "Technique", "Finance", "Production", "Informatique"];

const ASSET_CATEGORIES: [string, number, number][] = [
  ["MatÃ©riel informatique", 3, 3333],
  ["MatÃ©riel de transport", 5, 2000],
  ["Mobilier de bureau", 10, 1000],
  ["MatÃ©riel industriel", 8, 1250],
  ["Constructions", 20, 500],
  ["Installations gÃ©nÃ©rales", 10, 1000],
];

const CHART: [string, string, number, string][] = [
  ["101", "Capital social", 1, "passif"],
  ["106", "RÃ©serves", 1, "passif"],
  ["12", "RÃ©sultat de l'exercice", 1, "passif"],
  ["2231", "MatÃ©riel", 2, "actif"],
  ["2232", "MatÃ©riel de transport", 2, "actif"],
  ["2281", "Mobilier de bureau", 2, "actif"],
  ["281", "Amortissements des immobilisations", 2, "passif"],
  ["310", "Stocks de marchandises", 3, "actif"],
  ["401", "Fournisseurs", 4, "passif"],
  ["411", "Clients", 4, "actif"],
  ["421", "Personnel â€” rÃ©munÃ©rations dues", 4, "passif"],
  ["431", "CNSS", 4, "passif"],
  ["436", "TVA collectÃ©e", 4, "passif"],
  ["445", "TVA dÃ©ductible", 4, "actif"],
  ["447", "ImpÃ´ts sur les salaires (IRPP)", 4, "passif"],
  ["448", "Ã‰tat â€” autres impÃ´ts et taxes", 4, "passif"],
  ["532", "Banque", 5, "actif"],
  ["571", "Caisse", 5, "actif"],
  ["601", "Achats de marchandises", 6, "charge"],
  ["607", "Achats de marchandises", 6, "charge"],
  ["641", "Charges de personnel", 6, "charge"],
  ["645", "Charges sociales patronales", 6, "charge"],
  ["681", "Dotations aux amortissements", 6, "charge"],
  ["701", "Ventes de marchandises", 7, "produit"],
  ["706", "Prestations de services", 7, "produit"],
];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type SeedResult = {
  year: number;
  total: number;
  breakdown: Record<string, number>;
  journalEntries: number;
};

/**
 * Charge le jeu de dÃ©monstration. `reset` vide d'abord les donnÃ©es mÃ©tier.
 * Retourne le dÃ©compte exact par table.
 */
export async function seedDemoData(ownerId: string, year: number, reset: boolean): Promise<SeedResult> {
  const rng = makeRng(20261123);

  if (reset) {
    await db.delete(journalLines).where(eq(journalLines.ownerId, ownerId));
    await db.delete(journalEntries).where(eq(journalEntries.ownerId, ownerId));
    await db.delete(taxDeclarations).where(eq(taxDeclarations.ownerId, ownerId));
    await db.delete(bankTransactions).where(eq(bankTransactions.ownerId, ownerId));
    await db.delete(bankAccounts).where(eq(bankAccounts.ownerId, ownerId));
    await db.delete(assets).where(eq(assets.ownerId, ownerId));
    await db.delete(accounts).where(eq(accounts.ownerId, ownerId));
    await db.delete(payslips).where(eq(payslips.ownerId, ownerId));
    await db.delete(payrollRuns).where(eq(payrollRuns.ownerId, ownerId));
    await db.delete(employees).where(eq(employees.ownerId, ownerId));
    await db.delete(stockMovements).where(eq(stockMovements.ownerId, ownerId));
    await db.delete(billLines).where(eq(billLines.ownerId, ownerId));
    await db.delete(bills).where(eq(bills.ownerId, ownerId));
    await db.delete(invoiceLines).where(eq(invoiceLines.ownerId, ownerId));
    await db.delete(invoices).where(eq(invoices.ownerId, ownerId));
    await db.delete(products).where(eq(products.ownerId, ownerId));
    await db.delete(partners).where(eq(partners.ownerId, ownerId));
  }

  const breakdown: Record<string, number> = {};

  // â”€â”€ SociÃ©tÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const existing = await db.select().from(company).where(eq(company.ownerId, ownerId)).limit(1);
  if (existing[0]) {
    await db
      .update(company)
      .set({
        name: "SociÃ©tÃ© Tunisienne de Distribution SARL",
        matriculeFiscal: "1234567/A/M/000",
        registreCommerce: "B0123452026",
        address: "12, Avenue Habib Bourguiba, 1001 Tunis",
        phone: "+216 71 234 567",
        email: "contact@std-tunisie.tn",
        fiscalYear: year,
        cnssNumber: "12345678-000",
        updatedAt: new Date(),
      })
      .where(eq(company.ownerId, ownerId));
  } else {
    await db.insert(company).values({
      id: ownerId,
      ownerId,
      name: "SociÃ©tÃ© Tunisienne de Distribution SARL",
      matriculeFiscal: "1234567/A/M/000",
      registreCommerce: "B0123452026",
      address: "12, Avenue Habib Bourguiba, 1001 Tunis",
      phone: "+216 71 234 567",
      email: "contact@std-tunisie.tn",
      fiscalYear: year,
      cnssNumber: "12345678-000",
    });
  }

  // â”€â”€ Plan comptable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await db.insert(accounts).values(
    CHART.map(([code, label, classNo, nature]) => ({ ownerId, code, label, classNo, nature })),
  );

  // â”€â”€ Tiers : 30 (20 clients + 10 fournisseurs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const partnerRows = [
    ...CLIENTS.map((name, i) => ({
      ownerId,
      type: "client",
      code: `CLI-${String(i + 1).padStart(3, "0")}`,
      name,
      matriculeFiscal: `${1000000 + i * 137}/A/M/000`,
      address: `${10 + i * 3}, Rue de la LibertÃ©, ${["Tunis", "Sfax", "Sousse", "Nabeul", "Bizerte"][i % 5]}`,
      email: `contact${i + 1}@client.tn`,
      phone: `+216 7${i % 10} ${200 + i} ${300 + i}`,
      paymentTerms: [30, 45, 60, 15][i % 4],
    })),
    ...SUPPLIERS.map((name, i) => ({
      ownerId,
      type: "fournisseur",
      code: `FOU-${String(i + 1).padStart(3, "0")}`,
      name,
      matriculeFiscal: `${2000000 + i * 211}/A/M/000`,
      address: `${5 + i * 4}, Zone Industrielle, ${["Tunis", "Sfax", "Sousse"][i % 3]}`,
      email: `contact${i + 1}@fournisseur.tn`,
      phone: `+216 7${i % 10} ${400 + i} ${500 + i}`,
      paymentTerms: [30, 60, 45][i % 3],
    })),
  ];
  const insertedPartners = await db.insert(partners).values(partnerRows).returning();
  breakdown.tiers = insertedPartners.length;
  const clients = insertedPartners.filter((p) => p.type === "client");
  const suppliers = insertedPartners.filter((p) => p.type === "fournisseur");

  // â”€â”€ Articles : 40 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const productRows = PRODUCTS.map(([name, kind, unit, price, vat], i) => {
    const p = Number(price);
    return {
      ownerId,
      reference: `ART-${String(i + 1).padStart(3, "0")}`,
      name: String(name),
      kind: String(kind),
      unit: String(unit),
      priceHt: Math.round(p * 1000),
      costPrice: Math.round(p * 1000 * 0.62),
      vatRate: Number(vat),
      accountCode: kind === "service" ? "706" : "701",
      stockQty: kind === "service" ? 0 : Math.round((20 + rng() * 180) * 1000),
      reorderLevel: kind === "service" ? 0 : Math.round((10 + rng() * 30) * 1000),
    };
  });
  const insertedProducts = await db.insert(products).values(productRows).returning();
  breakdown.articles = insertedProducts.length;
  const stockable = insertedProducts.filter((p) => p.kind === "produit");

  // â”€â”€ SalariÃ©s : 12 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const employeeRows = Array.from({ length: 12 }, (_, i) => {
    const base = 900 + Math.round(rng() * 2600);
    return {
      ownerId,
      matricule: `EMP-${String(i + 1).padStart(3, "0")}`,
      firstName: FIRST_NAMES[i % FIRST_NAMES.length],
      lastName: LAST_NAMES[i % LAST_NAMES.length],
      position: POSITIONS[i % POSITIONS.length],
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      hireDate: isoDate(year - 1 - (i % 4), 1 + (i % 12), 1 + (i % 27)),
      baseSalary: base * 1000,
      allowances: Math.round((50 + rng() * 250)) * 1000,
      maritalStatus: i % 3 === 0 ? "celibataire" : "marie",
      children: i % 4,
      headOfFamily: i % 3 !== 0,
      status: "actif",
      cnssNumber: `${30000000 + i * 1111}-000`,
    };
  });
  const insertedEmployees = await db.insert(employees).values(employeeRows).returning();
  breakdown.salaries = insertedEmployees.length;

  // â”€â”€ Immobilisations : 12 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const assetRows = Array.from({ length: 12 }, (_, i) => {
    const [cat, years, bp] = ASSET_CATEGORIES[i % ASSET_CATEGORIES.length];
    const cost = Math.round((3000 + rng() * 45000) * 1000);
    const acqMonth = 1 + (i % 12);
    return {
      ownerId,
      code: `IMM-${String(i + 1).padStart(3, "0")}`,
      label: `${cat} â€” lot ${i + 1}`,
      category: cat,
      acquisitionDate: isoDate(year - 1, acqMonth, 15),
      cost,
      durationYears: years,
      rateBp: bp,
      accumulated: Math.round(cost * 0.2),
      accountCode: i % 3 === 0 ? "2232" : i % 3 === 1 ? "2231" : "2281",
    };
  });
  const insertedAssets = await db.insert(assets).values(assetRows).returning();
  breakdown.immobilisations = insertedAssets.length;

  // â”€â”€ Factures de vente : 168 (14 par mois) + 168 lignes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const invoiceRows: (typeof invoices.$inferInsert)[] = [];
  const invoiceLinePlan: { idx: number; label: string; qty: number; price: number; vat: number; ht: number; vatAmt: number }[] = [];
  let invSeq = 0;

  for (let month = 1; month <= 12; month++) {
    for (let k = 0; k < 14; k++) {
      const day = 1 + Math.floor(rng() * (daysInMonth(year, month) - 1));
      const client = clients[Math.floor(rng() * clients.length)];
      const prod = insertedProducts[Math.floor(rng() * insertedProducts.length)];
      const qty = Math.max(1, Math.round((1 + rng() * 12) * 1000));
      const price = prod.priceHt;
      const ht = Math.round((qty * price) / 1000);
      const vatAmt = Math.round((ht * prod.vatRate) / 100);
      const stamp = STAMP_DUTY;
      const status = month < 11 ? (rng() > 0.25 ? "payee" : "validee") : rng() > 0.5 ? "validee" : "brouillon";
      invSeq++;
      invoiceRows.push({
        ownerId,
        number: `FA-${year}-${String(invSeq).padStart(4, "0")}`,
        partnerId: client.id,
        partnerName: client.name,
        issueDate: isoDate(year, month, day),
        dueDate: isoDate(year, month, Math.min(daysInMonth(year, month), day + client.paymentTerms)),
        status,
        totalHt: ht,
        totalVat: vatAmt,
        stampDuty: stamp,
        totalTtc: ht + vatAmt + stamp,
        notes: null,
      });
      invoiceLinePlan.push({ idx: invoiceRows.length - 1, label: prod.name, qty, price, vat: prod.vatRate, ht, vatAmt });
    }
  }
  const insertedInvoices = await db.insert(invoices).values(invoiceRows).returning();
  breakdown.factures = insertedInvoices.length;

  const invoiceLineRows = invoiceLinePlan.map((l) => ({
    ownerId,
    invoiceId: insertedInvoices[l.idx].id,
    productId: null,
    label: l.label,
    quantity: l.qty,
    unitPrice: l.price,
    vatRate: l.vat,
    lineHt: l.ht,
    lineVat: l.vatAmt,
    position: 0,
  }));
  await db.insert(invoiceLines).values(invoiceLineRows);
  breakdown.lignes_facture = invoiceLineRows.length;

  // â”€â”€ Achats : 108 (9 par mois) + 108 lignes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const billRows: (typeof bills.$inferInsert)[] = [];
  const billLinePlan: { idx: number; label: string; qty: number; price: number; vat: number; ht: number; vatAmt: number }[] = [];
  let billSeq = 0;

  for (let month = 1; month <= 12; month++) {
    for (let k = 0; k < 9; k++) {
      const day = 1 + Math.floor(rng() * (daysInMonth(year, month) - 1));
      const supplier = suppliers[Math.floor(rng() * suppliers.length)];
      const prod = insertedProducts[Math.floor(rng() * insertedProducts.length)];
      const qty = Math.max(1, Math.round((2 + rng() * 20) * 1000));
      const price = prod.costPrice || prod.priceHt;
      const ht = Math.round((qty * price) / 1000);
      const vatAmt = Math.round((ht * prod.vatRate) / 100);
      const status = month < 11 ? (rng() > 0.2 ? "payee" : "validee") : rng() > 0.5 ? "validee" : "brouillon";
      billSeq++;
      billRows.push({
        ownerId,
        number: `AC-${year}-${String(billSeq).padStart(4, "0")}`,
        partnerId: supplier.id,
        partnerName: supplier.name,
        issueDate: isoDate(year, month, day),
        dueDate: isoDate(year, month, Math.min(daysInMonth(year, month), day + supplier.paymentTerms)),
        status,
        totalHt: ht,
        totalVat: vatAmt,
        totalTtc: ht + vatAmt,
        withholding: 0,
        notes: null,
      });
      billLinePlan.push({ idx: billRows.length - 1, label: prod.name, qty, price, vat: prod.vatRate, ht, vatAmt });
    }
  }
  const insertedBills = await db.insert(bills).values(billRows).returning();
  breakdown.achats = insertedBills.length;

  const billLineRows = billLinePlan.map((l) => ({
    ownerId,
    billId: insertedBills[l.idx].id,
    label: l.label,
    quantity: l.qty,
    unitPrice: l.price,
    vatRate: l.vat,
    lineHt: l.ht,
    lineVat: l.vatAmt,
    position: 0,
  }));
  await db.insert(billLines).values(billLineRows);
  breakdown.lignes_achat = billLineRows.length;

  // â”€â”€ Paie : 12 cycles + 144 bulletins â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const runRows: (typeof payrollRuns.$inferInsert)[] = [];
  const slipPlan: { runIdx: number; slip: typeof payslips.$inferInsert }[] = [];

  for (let month = 1; month <= 12; month++) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const slips = insertedEmployees.map((e) => {
      const c = computePayslip({
        baseSalary: e.baseSalary,
        allowances: e.allowances,
        headOfFamily: e.headOfFamily,
        children: e.children,
      });
      return {
        ownerId,
        runId: "",
        employeeId: e.id,
        employeeName: `${e.firstName} ${e.lastName}`,
        matricule: e.matricule,
        baseSalary: e.baseSalary,
        allowances: e.allowances,
        gross: c.gross,
        cnssEmployee: c.cnssEmployee,
        cnssEmployer: c.cnssEmployer,
        css: c.css,
        taxableBase: c.taxableBase,
        irpp: c.irpp,
        net: c.net,
      };
    });
    const totals = slips.reduce(
      (a, s) => ({
        gross: a.gross + s.gross,
        cnssE: a.cnssE + s.cnssEmployee,
        cnssR: a.cnssR + s.cnssEmployer,
        css: a.css + s.css,
        irpp: a.irpp + s.irpp,
        net: a.net + s.net,
      }),
      { gross: 0, cnssE: 0, cnssR: 0, css: 0, irpp: 0, net: 0 },
    );
    runRows.push({
      ownerId,
      period,
      label: `Paie ${period}`,
      status: "validee",
      totalGross: totals.gross,
      totalCnssEmployee: totals.cnssE,
      totalCnssEmployer: totals.cnssR,
      totalCss: totals.css,
      totalIrpp: totals.irpp,
      totalNet: totals.net,
    });
    for (const s of slips) slipPlan.push({ runIdx: runRows.length - 1, slip: s });
  }
  const insertedRuns = await db.insert(payrollRuns).values(runRows).returning();
  breakdown.cycles_paie = insertedRuns.length;

  const slipRows = slipPlan.map((p) => ({ ...p.slip, runId: insertedRuns[p.runIdx].id }));
  await db.insert(payslips).values(slipRows);
  breakdown.bulletins = slipRows.length;

  // â”€â”€ Stock : 50 mouvements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const moveRows: (typeof stockMovements.$inferInsert)[] = [];
  for (let i = 0; i < 50; i++) {
    const prod = stockable[Math.floor(rng() * stockable.length)];
    const month = 1 + (i % 12);
    const day = 1 + Math.floor(rng() * (daysInMonth(year, month) - 1));
    const kind = i % 3 === 0 ? "entree" : i % 3 === 1 ? "sortie" : "inventaire";
    const qty = Math.round((5 + rng() * 40) * 1000);
    moveRows.push({
      ownerId,
      productId: prod.id,
      moveDate: isoDate(year, month, day),
      kind,
      quantity: qty,
      unitCost: prod.costPrice,
      reference: kind === "entree" ? `BL-${year}-${String(i + 1).padStart(3, "0")}` : `BS-${year}-${String(i + 1).padStart(3, "0")}`,
      note: kind === "inventaire" ? "RÃ©gularisation d'inventaire" : null,
    });
  }
  await db.insert(stockMovements).values(moveRows);
  breakdown.mouvements_stock = moveRows.length;

  // â”€â”€ TrÃ©sorerie : 3 comptes + 36 opÃ©rations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bankRows = await db
    .insert(bankAccounts)
    .values([
      { ownerId, label: "Compte courant BIAT", kind: "banque", bankName: "BIAT", rib: "08 123 4567890123456 78", openingBalance: 45000 * 1000, accountCode: "532" },
      { ownerId, label: "Compte professionnel Amen", kind: "banque", bankName: "Amen Bank", rib: "07 987 6543210987654 32", openingBalance: 22000 * 1000, accountCode: "532" },
      { ownerId, label: "Caisse principale", kind: "caisse", bankName: null, rib: null, openingBalance: 3500 * 1000, accountCode: "571" },
    ])
    .returning();

  const txRows: (typeof bankTransactions.$inferInsert)[] = [];
  for (let i = 0; i < 36; i++) {
    const month = 1 + (i % 12);
    const day = 1 + Math.floor(rng() * (daysInMonth(year, month) - 1));
    const acc = bankRows[i % 2];
    const isIn = i % 2 === 0;
    txRows.push({
      ownerId,
      accountId: acc.id,
      txDate: isoDate(year, month, day),
      label: isIn ? `Encaissement client â€” virement` : `Paiement fournisseur â€” virement`,
      direction: isIn ? "encaissement" : "decaissement",
      amount: Math.round((800 + rng() * 12000) * 1000),
      category: isIn ? "Ventes" : "Achats",
      reference: isIn ? `ENC-${year}-${String(i + 1).padStart(3, "0")}` : `DEC-${year}-${String(i + 1).padStart(3, "0")}`,
    });
  }
  await db.insert(bankTransactions).values(txRows);
  breakdown.operations_tresorerie = txRows.length;

  // â”€â”€ DÃ©clarations : 12 (une TVA par mois) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const declRows: (typeof taxDeclarations.$inferInsert)[] = [];
  for (let month = 1; month <= 12; month++) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const next = new Date(Date.UTC(year, month, 1));
    const dueDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-15`;
    const monthInv = insertedInvoices.filter((i) => i.issueDate.startsWith(period) && i.status !== "brouillon");
    const monthBills = insertedBills.filter((b) => b.issueDate.startsWith(period) && b.status !== "brouillon");
    const collected = monthInv.reduce((s, i) => s + i.totalVat, 0);
    const deductible = monthBills.reduce((s, b) => s + b.totalVat, 0);
    const base = monthInv.reduce((s, i) => s + i.totalHt, 0);
    const balance = collected - deductible;
    declRows.push({
      ownerId,
      kind: "TVA",
      period,
      dueDate,
      baseAmount: base,
      taxAmount: balance > 0 ? balance : 0,
      status: month < 11 ? "payee" : "a_declarer",
      notes: null,
      detail: { collectedVat: collected, deductibleVat: deductible, credit: balance < 0 ? -balance : 0, balance },
    });
  }
  await db.insert(taxDeclarations).values(declRows);
  breakdown.declarations = declRows.length;

  // â”€â”€ Ã‰critures comptables (partie double) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const entryRows: (typeof journalEntries.$inferInsert)[] = [];
  const linePlan: { entryIdx: number; code: string; debit: number; credit: number }[] = [];

  const pushEntry = (
    entryDate: string,
    journal: string,
    reference: string,
    label: string,
    source: string,
    sourceId: string,
    lines: { code: string; debit: number; credit: number }[],
  ) => {
    const d = lines.reduce((s, l) => s + l.debit, 0);
    const c = lines.reduce((s, l) => s + l.credit, 0);
    if (d !== c || d === 0) return; // jamais d'Ã©criture dÃ©sÃ©quilibrÃ©e
    entryRows.push({ ownerId, entryDate, journal, reference, label, source, sourceId });
    const idx = entryRows.length - 1;
    for (const l of lines) linePlan.push({ entryIdx: idx, code: l.code, debit: l.debit, credit: l.credit });
  };

  for (const inv of insertedInvoices) {
    if (inv.status === "brouillon" || inv.status === "annulee") continue;
    const lines = [
      { code: "411", debit: inv.totalTtc, credit: 0 },
      { code: "701", debit: 0, credit: inv.totalHt },
    ];
    if (inv.totalVat > 0) lines.push({ code: "436", debit: 0, credit: inv.totalVat });
    if (inv.stampDuty > 0) lines.push({ code: "448", debit: 0, credit: inv.stampDuty });
    pushEntry(inv.issueDate, "VE", inv.number, `Facture ${inv.number} â€” ${inv.partnerName}`, "facture", inv.id, lines);
  }

  for (const b of insertedBills) {
    if (b.status === "brouillon") continue;
    const lines = [{ code: "607", debit: b.totalHt, credit: 0 }];
    if (b.totalVat > 0) lines.push({ code: "445", debit: b.totalVat, credit: 0 });
    lines.push({ code: "401", debit: 0, credit: b.totalTtc });
    pushEntry(b.issueDate, "AC", b.number, `Achat ${b.number} â€” ${b.partnerName}`, "achat", b.id, lines);
  }

  for (const run of insertedRuns) {
    const lines = [{ code: "641", debit: run.totalGross, credit: 0 }];
    if (run.totalCnssEmployer > 0) lines.push({ code: "645", debit: run.totalCnssEmployer, credit: 0 });
    lines.push({ code: "421", debit: 0, credit: run.totalNet });
    const cnss = run.totalCnssEmployee + run.totalCnssEmployer;
    if (cnss > 0) lines.push({ code: "431", debit: 0, credit: cnss });
    if (run.totalIrpp > 0) lines.push({ code: "447", debit: 0, credit: run.totalIrpp });
    if (run.totalCss > 0) lines.push({ code: "448", debit: 0, credit: run.totalCss });
    pushEntry(`${run.period}-28`, "PA", run.period, `Paie ${run.period}`, "paie", run.id, lines);
  }

  // Ã‰criture d'ouverture : capital social en banque.
  pushEntry(`${year}-01-01`, "OD", "OUV-2026", "Apport en capital â€” ouverture d'exercice", "manuel", "ouverture", [
    { code: "532", debit: 60000 * 1000, credit: 0 },
    { code: "101", debit: 0, credit: 60000 * 1000 },
  ]);

  if (entryRows.length) {
    const insertedEntries = await db.insert(journalEntries).values(entryRows).returning();
    const journalLineRows = linePlan.map((l, i) => ({
      ownerId,
      entryId: insertedEntries[l.entryIdx].id,
      accountCode: l.code,
      accountLabel: ACCOUNT_LABELS[l.code] ?? "",
      debit: l.debit,
      credit: l.credit,
      position: i,
    }));
    // Insertion par lots pour rester sous la limite de paramÃ¨tres PostgreSQL.
    for (let i = 0; i < journalLineRows.length; i += 500) {
      await db.insert(journalLines).values(journalLineRows.slice(i, i + 500));
    }
    breakdown.ecritures = insertedEntries.length;
  }

  const total = Object.entries(breakdown)
    .filter(([k]) => k !== "ecritures")
    .reduce((s, [, v]) => s + v, 0);

  return { year, total, breakdown, journalEntries: breakdown.ecritures ?? 0 };
}
