import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createReceivableReminderDraft,
  getReminderEligibleInvoices,
  type ReceivableReminderInvoice,
} from './receivables-reminders';

function invoice(overrides: Partial<ReceivableReminderInvoice> = {}): ReceivableReminderInvoice {
  return {
    id: 'invoice-1',
    invoiceNumber: 'FAC-2026-001',
    customerName: 'Client Exemple',
    dueDate: '2026-03-01',
    daysOverdue: 30,
    status: 'ISSUED',
    outstandingAmount: 125.5,
    diagnostic: null,
    ...overrides,
  };
}

describe('receivables reminder drafts', () => {
  it('only includes reliable overdue issued invoices for today’s aging snapshot', () => {
    const eligible = getReminderEligibleInvoices([
      invoice(),
      invoice({ id: 'future-date', daysOverdue: 0 }),
      invoice({ id: 'unknown-due', dueDate: null }),
      invoice({ id: 'invalid-date', dueDate: '2026-02-30' }),
      invoice({ id: 'invalid', diagnostic: 'Allocation invalide.' }),
      invoice({ id: 'paid', status: 'PAID' }),
      invoice({ id: 'zero', outstandingAmount: 0 }),
      invoice({ id: 'unknown-balance', outstandingAmount: null }),
    ], '2026-03-31', '2026-03-31');

    assert.deepEqual(eligible.map(({ id }) => id), ['invoice-1']);
    assert.deepEqual(getReminderEligibleInvoices([invoice()], '2026-03-30', '2026-03-31'), []);
  });

  it('prepares an editable, factual message and labels the balance as a SAFE snapshot', () => {
    const draft = createReceivableReminderDraft(invoice(), 'TND');
    assert.match(draft, /Objet : Rappel de paiement – facture FAC-2026-001/);
    assert.match(draft, /Solde restant dû selon SAFE : 125,500 TND/);
    assert.match(draft, /Si votre règlement a déjà été effectué/);
    assert.match(draft, /date prévisionnelle de règlement/);
  });

  it('rejects a draft when required invoice information is unreliable', () => {
    assert.throws(
      () => createReceivableReminderDraft(invoice({ dueDate: null }), 'TND'),
      /informations de facture sont insuffisantes/,
    );
    assert.throws(
      () => createReceivableReminderDraft(invoice({ diagnostic: 'invalid' }), 'TND'),
      /informations de facture sont insuffisantes/,
    );
    assert.throws(
      () => createReceivableReminderDraft(invoice({ status: 'PAID' }), 'TND'),
      /informations de facture sont insuffisantes/,
    );
  });
});
