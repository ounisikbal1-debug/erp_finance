export const MAX_HR_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const HR_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type HrDocumentMimeType = (typeof HR_DOCUMENT_MIME_TYPES)[number];
