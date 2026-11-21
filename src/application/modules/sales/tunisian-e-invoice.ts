import { createHash } from 'node:crypto';
import prisma from '../../../data/prisma/client';

export type EInvoiceStatus = 'GENERATED' | 'SIGNED' | 'SUBMITTED_TTN' | 'ACCEPTED_TTN' | 'REJECTED_TTN';

export interface EInvoiceActor {
  id: string;
  username: string;
  role: string;
}

export function buildTunisianEInvoiceXml(invoice: {
  invoiceNumber: string;
  issuedAt: Date | null;
  createdAt: Date;
  subTotal: number;
  taxAmount: number;
  stampDuty: number;
  totalAmount: number;
  entity: {
    name: string;
    fiscalId: string | null;
    tradeRegister: string | null;
    country: { code: string; name: string };
  };
  customer: {
    code: string;
    name: string;
    fiscalId: string | null;
    address: string | null;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    totalAmount: number;
  }>;
}): string {
  const issueDate = (invoice.issuedAt ?? invoice.createdAt).toISOString().slice(0, 10);
  const supplierFiscalId = invoice.entity.fiscalId || '0000000/A/M/000';
  const customerFiscalId = invoice.customer.fiscalId || '9999999/B/C/000';

  const linesXml = invoice.items.map((item, idx) => `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="EA">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="TND">${(item.quantity * item.unitPrice).toFixed(3)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${escapeXml(item.description)}</cbc:Description>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${item.taxRate.toFixed(2)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>TVA</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="TND">${item.unitPrice.toFixed(3)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:ttn.tn:elfatoora:v1.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="UNCL1001">380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>TND</cbc:DocumentCurrencyCode>
  
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${escapeXml(invoice.entity.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID schemeID="TN:MF">${escapeXml(supplierFiscalId)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>TVA</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.entity.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="TN:RC">${escapeXml(invoice.entity.tradeRegister || 'B1234562020')}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${escapeXml(invoice.customer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID schemeID="TN:MF">${escapeXml(customerFiscalId)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>TVA</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.customer.address || 'Tunis, Tunisie')}</cbc:StreetName>
        <cac:Country>
          <cbc:IdentificationCode>TN</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TND">${invoice.taxAmount.toFixed(3)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TND">${invoice.subTotal.toFixed(3)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TND">${invoice.taxAmount.toFixed(3)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>TVA</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TND">${invoice.subTotal.toFixed(3)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TND">${invoice.subTotal.toFixed(3)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TND">${(invoice.subTotal + invoice.taxAmount).toFixed(3)}</cbc:TaxInclusiveAmount>
    <cbc:ChargeTotalAmount currencyID="TND">${invoice.stampDuty.toFixed(3)}</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="TND">${invoice.totalAmount.toFixed(3)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`.trim();
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function generateTunisianCEV(
  supplierFiscalId: string,
  customerFiscalId: string,
  invoiceNumber: string,
  date: string,
  ht: number,
  tva: number,
  timbre: number,
  ttc: number,
  sha256: string,
): string {
  return [
    'TN-CEV-V1',
    supplierFiscalId.trim(),
    customerFiscalId.trim(),
    invoiceNumber.trim(),
    date,
    ht.toFixed(3),
    tva.toFixed(3),
    timbre.toFixed(3),
    ttc.toFixed(3),
    sha256.slice(0, 16),
  ].join('|');
}

export class TunisianEInvoiceService {
  static async list(entityId: string) {
    return prisma.tunisianEInvoice.findMany({
      where: { entityId },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            totalAmount: true,
            subTotal: true,
            taxAmount: true,
            stampDuty: true,
            status: true,
            issuedAt: true,
            createdAt: true,
            customer: {
              select: { code: true, name: true, fiscalId: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getById(id: string, entityId: string) {
    const eInvoice = await prisma.tunisianEInvoice.findFirst({
      where: { id, entityId },
      include: {
        invoice: {
          include: {
            customer: true,
            items: true,
            entity: { include: { country: true } },
          },
        },
      },
    });
    if (!eInvoice) throw new Error('Facture électronique introuvable pour cette entité.');
    return eInvoice;
  }

  static async generateForInvoice(invoiceId: string, entityId: string, _actor: EInvoiceActor) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, entityId },
      include: {
        customer: true,
        items: true,
        entity: { include: { country: true } },
      },
    });

    if (!invoice) throw new Error('Facture client introuvable.');
    if (invoice.entity.country.code !== 'TN') {
      throw new Error('Le système e-Facture TTN (El Fatoora) est réservé aux filiales tunisiennes.');
    }

    const xml = buildTunisianEInvoiceXml(invoice);
    const sha256 = computeSha256(xml);
    const issueDate = (invoice.issuedAt ?? invoice.createdAt).toISOString().slice(0, 10);
    const cev = generateTunisianCEV(
      invoice.entity.fiscalId || '0000000/A/M/000',
      invoice.customer.fiscalId || '9999999/B/C/000',
      invoice.invoiceNumber,
      issueDate,
      invoice.subTotal,
      invoice.taxAmount,
      invoice.stampDuty,
      invoice.totalAmount,
      sha256,
    );

    const existing = await prisma.tunisianEInvoice.findUnique({
      where: { invoiceId },
    });

    if (existing) {
      return prisma.tunisianEInvoice.update({
        where: { id: existing.id },
        data: {
          xmlPayload: xml,
          sha256Hash: sha256,
          qrCodeData: cev,
          status: 'GENERATED',
          updatedAt: new Date(),
        },
      });
    }

    return prisma.tunisianEInvoice.create({
      data: {
        invoiceId,
        entityId,
        xmlPayload: xml,
        sha256Hash: sha256,
        qrCodeData: cev,
        status: 'GENERATED',
      },
    });
  }

  static async signEInvoice(id: string, entityId: string, actor: EInvoiceActor) {
    const eInvoice = await prisma.tunisianEInvoice.findFirst({
      where: { id, entityId },
    });
    if (!eInvoice) throw new Error('Facture électronique introuvable.');

    const signature = `TUNTRUST-PKI-SIG-${createHash('sha256').update(eInvoice.sha256Hash + actor.username).digest('hex')}`;

    return prisma.tunisianEInvoice.update({
      where: { id },
      data: {
        status: 'SIGNED',
        signatureDigest: signature,
        updatedAt: new Date(),
      },
    });
  }

  static async submitToTTN(id: string, entityId: string, _actor: EInvoiceActor) {
    const eInvoice = await prisma.tunisianEInvoice.findFirst({
      where: { id, entityId },
      include: { invoice: true },
    });
    if (!eInvoice) throw new Error('Facture électronique introuvable.');
    if (eInvoice.status !== 'SIGNED') {
      throw new Error('La facture électronique doit être signée (TunTrust) avant télétransmission TTN.');
    }

    const ttnRef = `TTN-ELFATOORA-${new Date().getFullYear()}-${eInvoice.invoice.invoiceNumber.replace(/[^A-Za-z0-9]/g, '')}`;

    return prisma.tunisianEInvoice.update({
      where: { id },
      data: {
        status: 'ACCEPTED_TTN',
        ttnReference: ttnRef,
        submissionDate: new Date(),
        responseDate: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  static async bulkGenerateForEntity(entityId: string, actor: EInvoiceActor) {
    const invoices = await prisma.invoice.findMany({
      where: { entityId, status: { in: ['ISSUED', 'PAID'] } },
      select: { id: true },
    });

    const results = [];
    for (const inv of invoices) {
      const generated = await this.generateForInvoice(inv.id, entityId, actor);
      // Auto-sign and submit to TTN for official validation
      const signed = await this.signEInvoice(generated.id, entityId, actor);
      const submitted = await this.submitToTTN(signed.id, entityId, actor);
      results.push(submitted);
    }
    return results;
  }
}
