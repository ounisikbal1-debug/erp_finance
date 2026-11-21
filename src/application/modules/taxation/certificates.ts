import { parseTunisianWithholdingInput, type TunisianWithholdingInput } from './withholding';

export type WithholdingCertificateSourceType = 'PURCHASE_INVOICE' | 'SUPPLIER_PAYMENT' | 'OTHER';

export interface WithholdingCertificateActor {
  id: string;
  username: string;
  role: string;
}

export interface PrepareWithholdingCertificateInput {
  withholding: TunisianWithholdingInput;
  certificateNumber: string;
  beneficiaryName?: string;
  beneficiaryFiscalId?: string | null;
  sourceType: WithholdingCertificateSourceType;
  sourceReference: string;
}

export class WithholdingCertificateError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'WithholdingCertificateError';
  }
}

function getOptionalText(input: Record<string, unknown>, field: string, maxLength: number): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new WithholdingCertificateError(`${field} doit être un texte non vide de ${maxLength} caractères maximum.`, 400);
  }
  return value.trim();
}

export function parseWithholdingCertificateInput(value: unknown): PrepareWithholdingCertificateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WithholdingCertificateError('Les paramètres du certificat doivent former un objet.', 400);
  }
  const input = value as Record<string, unknown>;
  const allowedFields = [
    'period',
    'category',
    'amountTtc',
    'declarantType',
    'isEmployer',
    'supplierFiscalIdPresent',
    'selectedRate',
    'foreignTreatyReview',
    'treatyAdjustedRate',
    'certificateNumber',
    'beneficiaryName',
    'beneficiaryFiscalId',
    'sourceType',
    'sourceReference',
  ];
  const unknownFields = Object.keys(input).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new WithholdingCertificateError(`Paramètres de certificat inconnus : ${unknownFields.join(', ')}.`, 400);
  }

  const certificateNumber = getOptionalText(input, 'certificateNumber', 80);
  const beneficiaryName = getOptionalText(input, 'beneficiaryName', 200);
  const beneficiaryFiscalId = input.beneficiaryFiscalId === undefined
    ? undefined
    : input.beneficiaryFiscalId === null
      ? null
      : getOptionalText(input, 'beneficiaryFiscalId', 80);
  const sourceReference = getOptionalText(input, 'sourceReference', 150);
  if (!certificateNumber || !sourceReference) {
    throw new WithholdingCertificateError('Le numéro de certificat et la référence de facture/paiement sont obligatoires.', 400);
  }
  if (!['PURCHASE_INVOICE', 'SUPPLIER_PAYMENT', 'OTHER'].includes(String(input.sourceType))) {
    throw new WithholdingCertificateError('Le type de source doit être PURCHASE_INVOICE, SUPPLIER_PAYMENT ou OTHER.', 400);
  }
  const sourceType = input.sourceType as WithholdingCertificateSourceType;
  if (sourceType === 'OTHER' && !beneficiaryName) {
    throw new WithholdingCertificateError('Le bénéficiaire doit être fourni pour une source non référencée dans SAFE.', 400);
  }

  const withholding = parseTunisianWithholdingInput({
    period: input.period,
    category: input.category,
    amountTtc: input.amountTtc,
    declarantType: input.declarantType,
    isEmployer: input.isEmployer,
    supplierFiscalIdPresent: input.supplierFiscalIdPresent,
    selectedRate: input.selectedRate,
    foreignTreatyReview: input.foreignTreatyReview,
    treatyAdjustedRate: input.treatyAdjustedRate,
  });
  return {
    withholding,
    certificateNumber,
    beneficiaryName,
    beneficiaryFiscalId,
    sourceType,
    sourceReference,
  };
}
