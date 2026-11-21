export interface ReceivableReminderInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string | null;
  daysOverdue: number | null;
  status: string;
  outstandingAmount: number | null;
  diagnostic: string | null;
}

export interface ReceivablesReminder {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  daysOverdue: number;
  outstandingAmount: number;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getReminderEligibleInvoices(
  invoices: readonly ReceivableReminderInvoice[],
  asOf: string,
  today: string,
): ReceivableReminderInvoice[] {
  if (asOf !== today || !isCalendarDate(asOf)) return [];
  return invoices.filter((invoice) => invoice.status === 'ISSUED'
    && invoice.dueDate !== null
    && isCalendarDate(invoice.dueDate)
    && invoice.daysOverdue !== null
    && Number.isSafeInteger(invoice.daysOverdue)
    && invoice.daysOverdue > 0
    && invoice.outstandingAmount !== null
    && Number.isFinite(invoice.outstandingAmount)
    && invoice.outstandingAmount > 0
    && invoice.diagnostic === null)
    .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? '')
      || left.invoiceNumber.localeCompare(right.invoiceNumber));
}

export function createReceivableReminderDraft(
  invoice: ReceivableReminderInvoice,
  currencyCode: string,
): string {
  if (invoice.status !== 'ISSUED'
    || invoice.dueDate === null || !isCalendarDate(invoice.dueDate)
    || invoice.daysOverdue === null || !Number.isSafeInteger(invoice.daysOverdue) || invoice.daysOverdue <= 0
    || invoice.outstandingAmount === null || !Number.isFinite(invoice.outstandingAmount) || invoice.outstandingAmount <= 0
    || invoice.diagnostic !== null) {
    throw new Error('Les informations de facture sont insuffisantes pour préparer une relance.');
  }
  const amount = `${invoice.outstandingAmount.toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} ${currencyCode}`;
  const subject = `Rappel de paiement – facture ${invoice.invoiceNumber}`;
  const opening = invoice.daysOverdue <= 30
    ? 'Nous nous permettons de vous rappeler que cette facture semble arrivée à échéance.'
    : `Notre suivi indique que cette facture semble échue depuis ${invoice.daysOverdue} jours.`;
  return [
    `Objet : ${subject}`,
    '',
    `Bonjour ${invoice.customerName},`,
    '',
    opening,
    `Facture : ${invoice.invoiceNumber}`,
    `Échéance : ${invoice.dueDate}`,
    `Solde restant dû selon SAFE : ${amount}`,
    '',
    'Pourriez-vous nous indiquer la date prévisionnelle de règlement ? Si votre règlement a déjà été effectué, merci de ne pas tenir compte de ce rappel et de nous le signaler afin que nous puissions vérifier nos informations.',
    '',
    'Bien cordialement,',
  ].join('\n');
}
