// â”€â”€ SERVICE : fichier XML e-Fatoura (schÃ©ma TEIF) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Produit un document XML conforme Ã  la structure TEIF (Tunisian Electronic
// Invoice Format) utilisÃ©e par la plateforme e-Fatoura : en-tÃªte, vendeur,
// acheteur, lignes, totaux, TVA par taux et timbre fiscal.
//
// Le XML est gÃ©nÃ©rÃ© cÃ´tÃ© serveur et renvoyÃ© tel quel : l'utilisateur peut le
// tÃ©lÃ©charger, le contrÃ´ler, puis le transmettre Ã  e-Fatoura.
import { fmtTND } from "../../shared/fiscal";

export type EfatouraInvoice = {
  number: string;
  issueDate: string;
  dueDate: string;
  partnerName: string;
  partnerMatricule?: string | null;
  partnerAddress?: string | null;
  totalHt: number;
  totalVat: number;
  stampDuty: number;
  totalTtc: number;
  notes?: string | null;
  lines: {
    label: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    lineHt: number;
    lineVat: number;
  }[];
};

export type EfatouraCompany = {
  name: string;
  matriculeFiscal: string;
  address: string;
  phone?: string;
  email?: string;
};

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Montant en TND avec 3 dÃ©cimales, point dÃ©cimal (format XML). */
function amt(millimes: number): string {
  return (millimes / 1000).toFixed(3);
}

/** QuantitÃ© en unitÃ©s avec 3 dÃ©cimales. */
function qty(milliUnits: number): string {
  return (milliUnits / 1000).toFixed(3);
}

/**
 * Construit le XML TEIF d'une facture.
 * Structure : <TEIF> â†’ <InvoiceHeader>, <Seller>, <Buyer>, <InvoiceLines>,
 * <VATAnalysis>, <InvoiceTotals>, <StampDuty>.
 */
export function buildEfatouraXml(invoice: EfatouraInvoice, company: EfatouraCompany): string {
  // Regroupement de la TVA par taux (obligatoire dans le schÃ©ma TEIF).
  const byRate = new Map<number, { base: number; vat: number }>();
  for (const l of invoice.lines) {
    const cur = byRate.get(l.vatRate) ?? { base: 0, vat: 0 };
    cur.base += l.lineHt;
    cur.vat += l.lineVat;
    byRate.set(l.vatRate, cur);
  }
  const vatGroups = [...byRate.entries()].sort((a, b) => b[0] - a[0]);

  const linesXml = invoice.lines
    .map(
      (l, i) => `      <InvoiceLine>
        <LineNumber>${i + 1}</LineNumber>
        <ItemDescription>${esc(l.label)}</ItemDescription>
        <Quantity>${qty(l.quantity)}</Quantity>
        <UnitPrice>${amt(l.unitPrice)}</UnitPrice>
        <VATRate>${l.vatRate.toFixed(2)}</VATRate>
        <LineTotalHT>${amt(l.lineHt)}</LineTotalHT>
        <LineVAT>${amt(l.lineVat)}</LineVAT>
        <LineTotalTTC>${amt(l.lineHt + l.lineVat)}</LineTotalTTC>
      </InvoiceLine>`,
    )
    .join("\n");

  const vatXml = vatGroups
    .map(
      ([rate, g]) => `      <VATGroup>
        <VATRate>${rate.toFixed(2)}</VATRate>
        <TaxableBase>${amt(g.base)}</TaxableBase>
        <VATAmount>${amt(g.vat)}</VATAmount>
      </VATGroup>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<TEIF xmlns="urn:tn:efatoura:teif:1.0" version="1.0">
  <InvoiceHeader>
    <DocumentType>INVOICE</DocumentType>
    <DocumentNumber>${esc(invoice.number)}</DocumentNumber>
    <IssueDate>${esc(invoice.issueDate)}</IssueDate>
    <DueDate>${esc(invoice.dueDate)}</DueDate>
    <Currency>TND</Currency>
    <Country>TN</Country>
  </InvoiceHeader>
  <Seller>
    <Name>${esc(company.name)}</Name>
    <TaxIdentifier>${esc(company.matriculeFiscal)}</TaxIdentifier>
    <Address>${esc(company.address)}</Address>
    <Phone>${esc(company.phone ?? "")}</Phone>
    <Email>${esc(company.email ?? "")}</Email>
  </Seller>
  <Buyer>
    <Name>${esc(invoice.partnerName)}</Name>
    <TaxIdentifier>${esc(invoice.partnerMatricule ?? "")}</TaxIdentifier>
    <Address>${esc(invoice.partnerAddress ?? "")}</Address>
  </Buyer>
  <InvoiceLines>
${linesXml}
  </InvoiceLines>
  <VATAnalysis>
${vatXml}
  </VATAnalysis>
  <InvoiceTotals>
    <TotalHT>${amt(invoice.totalHt)}</TotalHT>
    <TotalVAT>${amt(invoice.totalVat)}</TotalVAT>
    <StampDuty>${amt(invoice.stampDuty)}</StampDuty>
    <TotalTTC>${amt(invoice.totalTtc)}</TotalTTC>
    <AmountInWords>${esc(fmtTND(invoice.totalTtc))}</AmountInWords>
  </InvoiceTotals>
  <StampDuty>
    <Amount>${amt(invoice.stampDuty)}</Amount>
    <Applied>${invoice.stampDuty > 0 ? "true" : "false"}</Applied>
  </StampDuty>
  ${invoice.notes ? `<Notes>${esc(invoice.notes)}</Notes>` : ""}
</TEIF>
`;
}

/** Valide grossiÃ¨rement un XML (balises appariÃ©es, racine TEIF). */
export function validateEfatouraXml(xml: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!xml.includes("<TEIF")) errors.push("Racine <TEIF> absente.");
  if (!xml.includes("<InvoiceHeader>")) errors.push("Bloc <InvoiceHeader> absent.");
  if (!xml.includes("<InvoiceTotals>")) errors.push("Bloc <InvoiceTotals> absent.");
  const open = (xml.match(/<[A-Za-z][^/>]*>/g) ?? []).length;
  const close = (xml.match(/<\/[A-Za-z][^>]*>/g) ?? []).length;
  if (open !== close) errors.push(`Balises non appariÃ©es : ${open} ouvertes, ${close} fermÃ©es.`);
  return { ok: errors.length === 0, errors };
}
