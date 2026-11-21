export const MAX_INVOICE_UPLOAD_BYTES = 8 * 1024 * 1024;
export const PDF_UPLOAD_TYPE = 'application/pdf';
export const XLSX_UPLOAD_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type InvoiceUploadFile = Pick<File, 'name' | 'size' | 'type'>;

export type InvoiceUploadValidation =
  | { valid: true; contentType: typeof PDF_UPLOAD_TYPE | typeof XLSX_UPLOAD_TYPE }
  | { valid: false; error: string };

export function validateInvoiceUpload(file: InvoiceUploadFile): InvoiceUploadValidation {
  if (!file.size) return { valid: false, error: 'Le fichier est vide.' };
  if (file.size > MAX_INVOICE_UPLOAD_BYTES) {
    return { valid: false, error: 'Le fichier ne doit pas dépasser 8 Mo.' };
  }

  const extension = file.name.toLowerCase().split('.').pop();
  const contentType = extension === 'pdf'
    ? PDF_UPLOAD_TYPE
    : extension === 'xlsx'
      ? XLSX_UPLOAD_TYPE
      : null;
  if (!contentType) {
    return { valid: false, error: 'Sélectionnez un fichier PDF ou Excel .xlsx.' };
  }
  const reportedType = file.type.split(';', 1)[0].trim().toLowerCase();
  if (reportedType && reportedType !== contentType) {
    return { valid: false, error: 'Le type de fichier ne correspond pas à son extension.' };
  }
  return { valid: true, contentType };
}
