import React, { useCallback, useEffect, useState } from 'react';

interface Partner {
  id: string;
  code: string;
  name: string;
  country: { code: string; currencyCode: string };
}

interface IntercompanyTransaction {
  id: string;
  reference: string;
  description: string;
  transactionDate: string;
  currencyCode: string;
  sellerAmount: number;
  buyerAmount: number;
  exchangeRate: number;
  status: string;
  sellerEntity: { id: string; code: string; name: string; country?: { currencyCode: string } };
  buyerEntity: { id: string; code: string; name: string; country?: { currencyCode: string } };
  sellerJournalEntry: { entryNumber: string; status: string };
  buyerJournalEntry: { entryNumber: string; status: string };
  sellerReconciledAt: string | null;
  buyerReconciledAt: string | null;
  sellerConventionApprovedAt: string | null;
  buyerConventionApprovedAt: string | null;
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getError(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'Le service intercompagnies est indisponible.';
}

async function request(path: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/intercompany${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(getError(payload));
  return payload;
}

export default function IntercompanyPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [transactions, setTransactions] = useState<IntercompanyTransaction[]>([]);
  const [buyerEntityId, setBuyerEntityId] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [transactionNature, setTransactionNature] = useState('OTHER');
  const [agreementReference, setAgreementReference] = useState('');
  const [supportingDocumentReference, setSupportingDocumentReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [currencyCode, setCurrencyCode] = useState('TND');
  const [sellerAmount, setSellerAmount] = useState('');
  const [buyerAmount, setBuyerAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [sellerReceivableAccountCode, setSellerReceivableAccountCode] = useState('');
  const [sellerRevenueAccountCode, setSellerRevenueAccountCode] = useState('');
  const [buyerInventoryAccountCode, setBuyerInventoryAccountCode] = useState('');
  const [buyerPayableAccountCode, setBuyerPayableAccountCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!accessToken || !entityId) return;
    const [partnerPayload, transactionPayload] = await Promise.all([
      request('/partners', accessToken),
      request('/transactions', accessToken),
    ]);
    if (!Array.isArray(partnerPayload) || !Array.isArray(transactionPayload)) {
      throw new Error('Réponse intercompagnies invalide.');
    }
    setPartners(partnerPayload as Partner[]);
    setTransactions(transactionPayload as IntercompanyTransaction[]);
    if (partnerPayload.length && !buyerEntityId) setBuyerEntityId((partnerPayload[0] as Partner).id);
  }, [accessToken, entityId, buyerEntityId]);

  useEffect(() => {
    if (!accessToken || !entityId) {
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour accéder aux intercompagnies.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return;
    }
    let active = true;
    setError('');
    void refresh().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Chargement intercompagnies impossible.');
    });
    return () => { active = false; };
  }, [accessToken, entityId, refresh]);

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(label);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action intercompagnie impossible.');
    } finally {
      setBusy(false);
    }
  };

  const createTransaction = (event: React.FormEvent) => {
    event.preventDefault();
    void runAction('Transaction interco créée. Les deux pièces restent soumises au contrôle comptable.', async () => {
      await request('/transactions', accessToken!, {
        method: 'POST',
        body: JSON.stringify({
          buyerEntityId,
          reference,
          description,
          transactionNature,
          agreementReference,
          supportingDocumentReference,
          date,
          currencyCode,
          sellerAmount: Number(sellerAmount),
          buyerAmount: Number(buyerAmount),
          exchangeRate: Number(exchangeRate),
          sellerReceivableAccountCode,
          sellerRevenueAccountCode,
          buyerInventoryAccountCode,
          buyerPayableAccountCode,
        }),
      });
      setReference('');
      setDescription('');
      setAgreementReference('');
      setSupportingDocumentReference('');
      setSellerAmount('');
      setBuyerAmount('');
    });
  };

  const transition = (transaction: IntercompanyTransaction, action: 'approve' | 'post' | 'reconcile', label: string) => {
    void runAction(label, () => request(`/transactions/${encodeURIComponent(transaction.id)}/${action}`, accessToken!, { method: 'POST' }));
  };

  return (
    <section style={{ display: 'grid', gap: 14, color: '#0F172A' }}>
      <header style={cardStyle}>
        <h2 style={{ margin: 0 }}>Transactions intercompagnies</h2>
        <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
          SAFE génère deux écritures miroirs équilibrées dans les sociétés liées. Approbation et comptabilisation sont atomiques sur la paire; le rapprochement requiert une confirmation de chaque société.
        </p>
      </header>
      <div role="note" style={{ ...cardStyle, background: '#EFF6FF', color: '#1E3A8A', borderColor: '#BFDBFE', fontSize: 13 }}>
        Pour deux entités tunisiennes, SAFE calcule la TVA selon la nature : carburant et honoraires comptables à 13 %, assurance à 0 %, autres opérations à 19 %. La pièce exige une référence de convention et une référence de facture/justificatif. Les échanges transfrontaliers restent bloqués tant que leurs plans comptables et règles locales ne sont pas configurés. Les avances/prêts intragroupe suivent une convention financière distincte.
      </div>
      {error && <div role="alert" style={{ ...cardStyle, background: '#FEF2F2', color: '#991B1B', borderColor: '#FCA5A5' }}>{error}</div>}
      {notice && <div role="status" style={{ ...cardStyle, background: '#F0FDF4', color: '#166534', borderColor: '#86EFAC' }}>{notice}</div>}
      {partners.length === 0 && (
        <div role="note" style={cardStyle}>Aucune contrepartie disponible. Ajoutez d’abord au moins une autre société au même groupe dans Consolidation Groupe.</div>
      )}
      <form onSubmit={createTransaction} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Créer une vente interco</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>Société acheteuse
            <select required value={buyerEntityId} onChange={(event) => setBuyerEntityId(event.target.value)}>
              <option value="">Choisir</option>
              {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.code} · {partner.name} · {partner.country.currencyCode}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Référence groupe
            <input required maxLength={80} value={reference} onChange={(event) => setReference(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Date
            <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Libellé
            <input required maxLength={250} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Nature (détermine la TVA tunisienne)
            <select required value={transactionNature} onChange={(event) => setTransactionNature(event.target.value)}>
              <option value="FUEL">Carburant — 13 %</option>
              <option value="ACCOUNTING_FEES">Honoraires comptables — 13 %</option>
              <option value="INSURANCE">Assurance — 0 % TVA</option>
              <option value="OTHER">Autre opération — 19 %</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Référence de convention intersociétés
            <input required maxLength={100} value={agreementReference} onChange={(event) => setAgreementReference(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Référence facture / pièce justificative
            <input required maxLength={120} value={supportingDocumentReference} onChange={(event) => setSupportingDocumentReference(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Devise vendeur
            <input required maxLength={3} pattern="[A-Za-z]{3}" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Montant vendeur HT
            <input required type="number" min="0.001" step="0.001" value={sellerAmount} onChange={(event) => setSellerAmount(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Taux vendeur → acheteur
            <input required type="number" min="0.000001" step="any" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Montant acheteur converti HT
            <input required type="number" min="0.001" step="0.001" value={buyerAmount} onChange={(event) => setBuyerAmount(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Compte créance vendeur
            <input required maxLength={50} value={sellerReceivableAccountCode} onChange={(event) => setSellerReceivableAccountCode(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Compte produit vendeur
            <input required maxLength={50} value={sellerRevenueAccountCode} onChange={(event) => setSellerRevenueAccountCode(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Compte achat acheteur
            <input required maxLength={50} value={buyerInventoryAccountCode} onChange={(event) => setBuyerInventoryAccountCode(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Compte dette acheteur
            <input required maxLength={50} value={buyerPayableAccountCode} onChange={(event) => setBuyerPayableAccountCode(event.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={busy || partners.length === 0 || !buyerEntityId}>Créer les deux écritures en revue</button>
      </form>

      <section style={{ ...cardStyle, overflowX: 'auto' }}>
        <h3 style={{ margin: '0 0 10px' }}>Journal interco et rapprochement</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
            <th style={{ padding: 8 }}>Référence / date</th><th style={{ padding: 8 }}>Sociétés</th><th style={{ padding: 8 }}>Montants / taux</th><th style={{ padding: 8 }}>Pièces miroir</th><th style={{ padding: 8 }}>État / confirmations</th><th style={{ padding: 8 }}>Actions</th>
          </tr></thead>
          <tbody>{transactions.map((transaction) => (
            <tr key={transaction.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: 8 }}>{transaction.reference}<br />{transaction.transactionDate.slice(0, 10)} · {transaction.description}</td>
              <td style={{ padding: 8 }}>{transaction.sellerEntity.code} → {transaction.buyerEntity.code}</td>
              <td style={{ padding: 8 }}>{transaction.sellerAmount.toFixed(3)} {transaction.currencyCode}<br />{transaction.buyerAmount.toFixed(3)} · taux {transaction.exchangeRate}</td>
              <td style={{ padding: 8 }}>{transaction.sellerJournalEntry.entryNumber} ({transaction.sellerJournalEntry.status})<br />{transaction.buyerJournalEntry.entryNumber} ({transaction.buyerJournalEntry.status})</td>
              <td style={{ padding: 8 }}>{transaction.status}<br />Convention vendeur: {transaction.sellerConventionApprovedAt ? 'approuvée' : 'à approuver'} · acheteur: {transaction.buyerConventionApprovedAt ? 'approuvée' : 'à approuver'}<br />Rapprochement vendeur: {transaction.sellerReconciledAt ? 'confirmé' : 'à confirmer'} · acheteur: {transaction.buyerReconciledAt ? 'confirmé' : 'à confirmer'}</td>
              <td style={{ padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {transaction.status === 'PENDING_APPROVAL'
                  && ((transaction.sellerEntity.id === entityId && !transaction.sellerConventionApprovedAt)
                    || (transaction.buyerEntity.id === entityId && !transaction.buyerConventionApprovedAt))
                  && <button type="button" disabled={busy} onClick={() => transition(transaction, 'approve', 'Approbation enregistrée pour votre société.')}>Approuver pour ma société</button>}
                {transaction.status === 'APPROVED' && <button type="button" disabled={busy} onClick={() => transition(transaction, 'post', 'Les deux pièces interco ont été comptabilisées ensemble.')}>Comptabiliser la paire</button>}
                {(transaction.status === 'POSTED' || transaction.status === 'RECONCILED')
                  && ((transaction.sellerEntity.id === entityId && !transaction.sellerReconciledAt)
                    || (transaction.buyerEntity.id === entityId && !transaction.buyerReconciledAt))
                  && <button type="button" disabled={busy} onClick={() => transition(transaction, 'reconcile', 'Confirmation de rapprochement enregistrée pour votre société.')}>Confirmer mon rapprochement</button>}
              </td>
            </tr>
          ))}
          {transactions.length === 0 && <tr><td colSpan={6} style={{ padding: 12 }}>Aucune transaction interco enregistrée pour cette société.</td></tr>}
          </tbody>
        </table>
      </section>
    </section>
  );
}
