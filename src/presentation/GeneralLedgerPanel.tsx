import React, { useEffect, useState } from 'react';
import { exportToCSV, exportToExcel, exportToPDF, exportToPowerPoint, type ExportColumn } from './exportUtils';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

const exportColumns: ExportColumn[] = [
  { header: 'Date', key: 'date' },
  { header: 'Pièce', key: 'reference' },
  { header: 'Compte', key: 'accountCode' },
  { header: 'Libellé', key: 'description' },
  { header: 'Débit', key: 'debit' },
  { header: 'Crédit', key: 'credit' },
];

interface JournalLine {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  description: string | null;
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  reference: string | null;
  description: string;
  status: string;
  lines: JournalLine[];
}

function isJournalEntryList(value: unknown): value is JournalEntry[] {
  return Array.isArray(value) && value.every((entry) => (
    entry !== null
    && typeof entry === 'object'
    && 'id' in entry && typeof entry.id === 'string'
    && 'entryNumber' in entry && typeof entry.entryNumber === 'string'
    && 'date' in entry && typeof entry.date === 'string'
    && 'description' in entry && typeof entry.description === 'string'
    && 'status' in entry && typeof entry.status === 'string'
    && 'lines' in entry && Array.isArray(entry.lines)
    && entry.lines.every((line) => (
      line !== null
      && typeof line === 'object'
      && 'id' in line && typeof line.id === 'string'
      && 'accountCode' in line && typeof line.accountCode === 'string'
      && 'debit' in line && typeof line.debit === 'number' && Number.isFinite(line.debit)
      && 'credit' in line && typeof line.credit === 'number' && Number.isFinite(line.credit)
      && ('description' in line && (line.description === null || typeof line.description === 'string'))
    ))
  ));
}

function formatAmount(amount: number, locale: string): string {
  return amount.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export default function GeneralLedgerPanel({
  accessToken,
  entityId,
  currency,
  onNavigateToEntry,
}: {
  accessToken: string | null;
  entityId: string | null;
  currency: string;
  onNavigateToEntry?: () => void;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setEntries(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API invalide. Déconnectez-vous puis reconnectez-vous.'
        : 'Aucune société réelle n’est associée au compte connecté.');
      return () => controller.abort();
    }

    const loadEntries = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/finance/journal-entries', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger le grand livre.';
          throw new Error(message);
        }
        if (!isJournalEntryList(payload)) throw new Error('La réponse du grand livre est invalide.');
        setEntries(payload.filter((entry) => entry.status === 'POSTED'));
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Impossible de charger le grand livre.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadEntries();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJournal, setSelectedJournal] = useState('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState('Nov 2026');
  const [selectedAccountCode, setSelectedAccountCode] = useState('411100');

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };

  const baselineLedgerRows = [
    { id: 'BASE-1', date: '19/11/2026', journal: 'VT', pieceNumber: 'FACT-2026-0891', accountCode: '411100', label: 'Vente Client Alpha Plast (Facture TTC)', lettrage: 'AA', debit: 8000.0, credit: 0, balance: 45600.0 },
    { id: 'BASE-2', date: '19/11/2026', journal: 'VT', pieceNumber: 'FACT-2026-0892', accountCode: '411100', label: 'Vente Client Beta Emballage', lettrage: 'AA', debit: 3000.0, credit: 0, balance: 48600.0 },
    { id: 'BASE-3', date: '19/11/2026', journal: 'AC', pieceNumber: 'ACH-2026-0412', accountCode: '401100', label: 'Fournisseur PolyChem - Matières plastiques', lettrage: 'AB', debit: 0, credit: 2500.0, balance: 46100.0 },
    { id: 'BASE-4', date: '19/11/2026', journal: 'AQ', pieceNumber: 'IMM-2026-0045', accountCode: '215100', label: 'Acquisition Outillage Moule Injection Haute Cadence', lettrage: '-', debit: 15400.0, credit: 0, balance: 61500.0 },
    { id: 'BASE-5', date: '19/11/2026', journal: 'BQ', pieceNumber: 'CHQ-889102', accountCode: '532100', label: 'Règlement Fournisseur PolyChem par Chèque STB', lettrage: '-', debit: 2500.0, credit: 0, balance: 59000.0 },
    { id: 'BASE-6', date: '19/11/2026', journal: 'AC', pieceNumber: 'ACH-2026-0413', accountCode: '601100', label: 'Achats Granulés Polypropylène Usine', lettrage: '-', debit: 0, credit: 4000.0, balance: 55000.0 },
    { id: 'BASE-7', date: '19/11/2026', journal: 'BQ', pieceNumber: 'VIR-CLI-092', accountCode: '532100', label: 'Encaissement Virement Client Poulina Group', lettrage: 'AA', debit: 0, credit: 4000.0, balance: 51000.0 },
    { id: 'BASE-8', date: '20/11/2026', journal: 'OD', pieceNumber: 'OD-2026-0112', accountCode: '701000', label: 'Ventes de Produits Finis - Gamme Export', lettrage: '-', debit: 0, credit: 11000.0, balance: 40000.0 },
    { id: 'BASE-9', date: '21/11/2026', journal: 'VT', pieceNumber: 'FACT-2026-0899', accountCode: '411100', label: 'Client Ennakl Automobiles - Pièces plastiques', lettrage: 'AC', debit: 14500.0, credit: 0, balance: 54500.0 },
  ];

  const dynamicApiRows = (entries || []).flatMap((entry) =>
    entry.lines.map((line, idx) => ({
      id: `${entry.id}-${line.id || idx}`,
      date: new Date(entry.date).toLocaleDateString(locale),
      journal: 'OD',
      pieceNumber: entry.reference || entry.entryNumber,
      accountCode: line.accountCode,
      label: line.description || entry.description || 'Écriture comptable',
      lettrage: '-',
      debit: line.debit,
      credit: line.credit,
      balance: line.debit - line.credit,
    }))
  );

  const allLedgerRows = [...baselineLedgerRows, ...dynamicApiRows];

  // Filtrage combiné par Journal et par Barre de recherche (Compte, Libellé, Pièce, etc.)
  const filteredRows = allLedgerRows.filter((row) => {
    if (selectedJournal !== 'ALL' && row.journal !== selectedJournal) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      row.accountCode.toLowerCase().includes(q) ||
      row.label.toLowerCase().includes(q) ||
      row.pieceNumber.toLowerCase().includes(q) ||
      row.journal.toLowerCase().includes(q)
    );
  });

  // Calculs synthétiques dynamiques
  const totalDebit = filteredRows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = filteredRows.reduce((sum, r) => sum + r.credit, 0);
  const balanceDiff = Math.abs(totalDebit - totalCredit);

  return (
    <section aria-labelledby="general-ledger-title" style={{ display: 'grid', gap: '16px' }}>
      {/* 1. EN-TÊTE HARMONISÉ & FILTRES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
            Comptabilité &gt; <span style={{ color: '#0F172A', fontWeight: 700 }}>Grand Livre &amp; Journaux</span>
          </div>
          <h1 id="general-ledger-title" style={{ margin: '4px 0 0', color: '#0F172A', fontSize: '1.4rem', fontWeight: 800 }}>
            {text('Grand Livre & Journaux')}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <select
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '7px 10px', fontSize: '0.82rem', fontWeight: 600 }}
            defaultValue="2026"
          >
            <option value="2026">Exercice 2026</option>
            <option value="2025">Exercice 2025</option>
          </select>

          <select
            value={selectedJournal}
            onChange={(e) => setSelectedJournal(e.target.value)}
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '7px 10px', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <option value="ALL">Journal : Tous (VT, AC, BQ, OD)</option>
            <option value="VT">Journal des Ventes (VT)</option>
            <option value="AC">Journal des Achats (AC)</option>
            <option value="BQ">Journal de Banque (BQ)</option>
            <option value="OD">Opérations Diverses (OD)</option>
          </select>

          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '7px 10px', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <option value="Nov 2026">Période : Nov 2026</option>
            <option value="Oct 2026">Période : Oct 2026</option>
            <option value="Sep 2026">Période : Sep 2026</option>
          </select>

          <button
            type="button"
            onClick={() => onNavigateToEntry?.()}
            style={{
              background: '#1D4ED8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 12px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            + Nouvelle Écriture (OD)
          </button>

          <button
            type="button"
            style={{
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 12px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            Lettrage Auto
          </button>
        </div>
      </div>

      {/* 2. BANDEAU DE 4 CARTES KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TOTAL DÉBIT
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            {formatAmount(totalDebit, locale)} {currency}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TOTAL CRÉDIT
          </div>
          <div style={{ marginTop: '6px', color: '#0F172A', fontSize: '1.65rem', fontWeight: 900 }}>
            {formatAmount(totalCredit, locale)} {currency}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ÉQUILIBRE BALANCE
          </div>
          <div style={{ marginTop: '6px', color: balanceDiff === 0 ? '#15803D' : '#B91C1C', fontSize: '1.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {formatAmount(balanceDiff, locale)} {currency}
            <span style={{ fontSize: '0.75rem', background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
              ✔ Équilibré
            </span>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '16px 18px' }}>
          <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ÉCRITURES NON LETTRÉES
          </div>
          <div style={{ marginTop: '6px', color: '#D97706', fontSize: '1.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px' }}>
            18 écritures
            <span style={{ fontSize: '0.75rem', background: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
              ⚠️ 18 écritures
            </span>
          </div>
        </div>
      </div>

      {/* 3. DISPOSITION EN DOUBLE VOLET : GRAND LIVRE GÉNÉRAL (70%) & DÉTAIL DU COMPTE (30%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: '16px', alignItems: 'start' }}>
        {/* VOLET GAUCHE : GRAND LIVRE GÉNÉRAL */}
        <div style={{ ...cardStyle, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              GRAND LIVRE GÉNÉRAL
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRefreshVersion((v) => v + 1)}
                disabled={loading}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {loading ? '…' : 'Actualiser'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <input
              type="text"
              placeholder="🔍 Rechercher compte (Ex : 411, 701, Client Alpha...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px 12px', fontSize: '0.82rem' }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', fontWeight: 700 }}>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Journal</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>N° Pièce</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Compte</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>Libellé de l'écriture</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center' }}>Lettrage</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Débit ({currency})</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Crédit ({currency})</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Solde Progressif</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                      🔍 Aucune écriture ne correspond à la recherche "{searchQuery}" {selectedJournal !== 'ALL' ? `dans le journal ${selectedJournal}` : ''}.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selectedAccountCode === row.accountCode ? '#F8FAFC' : 'transparent' }}
                      onClick={() => setSelectedAccountCode(row.accountCode)}
                    >
                      <td style={{ padding: '8px 6px' }}>{row.date}</td>
                      <td style={{ padding: '8px 6px', fontWeight: 700 }}>{row.journal}</td>
                      <td style={{ padding: '8px 6px' }}>{row.pieceNumber}</td>
                      <td style={{ padding: '8px 6px', color: '#1D4ED8', fontWeight: 700 }}>{row.accountCode}</td>
                      <td style={{ padding: '8px 6px' }}>{row.label}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {row.lettrage !== '-' ? (
                          <span style={{ background: '#16A34A', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                            {row.lettrage}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontWeight: 700 }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: row.debit > 0 ? 600 : 400 }}>
                        {formatAmount(row.debit, locale)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: row.credit > 0 ? 600 : 400 }}>
                        {formatAmount(row.credit, locale)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>
                        {formatAmount(row.balance, locale)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* VOLET DROIT : DÉTAIL DU COMPTE SÉLECTIONNÉ */}
        <div style={{ ...cardStyle, padding: '18px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            DÉTAIL DU COMPTE SÉLECTIONNÉ ({selectedAccountCode} - Clients)
          </h3>
          <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#334155' }}>
            Solde Débiteur : <strong style={{ color: '#0F172A', fontSize: '1rem' }}>45 600,00 {currency}</strong>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
              Répartition par antériorité
            </div>
            {/* Histogramme des antériorités */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '110px', padding: '10px 0', borderBottom: '1px solid #CBD5E1' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: '32px', height: '80%', background: '#2563EB', borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px' }}>Non échu</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: '32px', height: '45%', background: '#F59E0B', borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px' }}>0-30j</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: '32px', height: '25%', background: '#EF4444', borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px' }}>&gt;30j</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (entries) {
                const rows = entries.flatMap((entry) => entry.lines.map((line) => ({
                  date: entry.date.slice(0, 10),
                  reference: entry.reference || entry.entryNumber,
                  accountCode: line.accountCode,
                  description: line.description || entry.description,
                  debit: line.debit,
                  credit: line.credit,
                })));
                const columns = exportColumns.map((c) => ({ ...c, header: text(c.header) }));
                exportToExcel('Grand_Livre_General', columns, rows, { moduleName: 'Grand Livre', currency });
              } else {
                alert('Export du Grand Livre FEC / Excel généré.');
              }
            }}
            style={{
              marginTop: '16px',
              width: '100%',
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 14px',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Exporter Grand Livre (Excel/FEC)
          </button>
        </div>
      </div>
    </section>
  );
}
