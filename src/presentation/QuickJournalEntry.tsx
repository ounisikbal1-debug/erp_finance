import React, { useState, useRef, useEffect } from 'react';

interface EntryLine {
  id: string;
  account: string;
  accountName: string;
  label: string;
  debit: number;
  credit: number;
  thirdParty: string;
}

export const QuickJournalEntry: React.FC = () => {
  const [journal, setJournal] = useState('OD');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pieceRef, setPieceRef] = useState('');
  
  const [lines, setLines] = useState<EntryLine[]>([
    { id: '1', account: '607000', accountName: 'Achats de marchandises', label: 'Facture F2026-001', debit: 1000, credit: 0, thirdParty: 'FOURN_01' },
    { id: '2', account: '436660', accountName: 'TVA déductible sur ABS', label: 'Facture F2026-001', debit: 190, credit: 0, thirdParty: '' },
    { id: '3', account: '401000', accountName: 'Fournisseurs', label: 'Facture F2026-001', debit: 0, credit: 1190, thirdParty: 'FOURN_01' }
  ]);

  const [currentAccount, setCurrentAccount] = useState('');
  const [currentLabel, setCurrentLabel] = useState('');
  const [currentDebit, setCurrentDebit] = useState('');
  const [currentCredit, setCurrentCredit] = useState('');

  const accountRef = useRef<HTMLInputElement>(null);

  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.001 && lines.length > 0;

  const handleAddLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount) return;

    const newLine: EntryLine = {
      id: Date.now().toString(),
      account: currentAccount,
      accountName: 'Compte ' + currentAccount,
      label: currentLabel || 'Écriture courante',
      debit: parseFloat(currentDebit) || 0,
      credit: parseFloat(currentCredit) || 0,
      thirdParty: ''
    };

    setLines([...lines, newLine]);
    setCurrentAccount('');
    setCurrentDebit('');
    setCurrentCredit('');
    accountRef.current?.focus();
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚡ Saisie Rapide d'Écritures au Kilomètre (Mode Comptable Express)
          </h1>
          <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '14px' }}>
            Optimisé pour la saisie exclusive au clavier avec pavé numérique — Contrôle d'équilibre Débit/Crédit temps réel
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            disabled={!isBalanced}
            style={{
              padding: '10px 20px',
              backgroundColor: isBalanced ? '#16a34a' : '#334155',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: isBalanced ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={() => alert('Écriture validée et enregistrée au Grand Livre ! Pièce : ' + (pieceRef || 'AUTO-2026'))}
          >
            💾 Valider l'Écriture (F10)
          </button>
        </div>
      </div>

      {/* Barre d'en-tête de pièce */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        backgroundColor: '#1e293b',
        padding: '16px',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #334155'
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Code Journal</label>
          <select
            value={journal}
            onChange={e => setJournal(e.target.value)}
            style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
          >
            <option value="AC">AC - Achats</option>
            <option value="VE">VE - Ventes</option>
            <option value="BQ">BQ - Banque</option>
            <option value="CA">CA - Caisse</option>
            <option value="OD">OD - Opérations Diverses</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Date d'Écriture</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>N° Pièce / Réf Document</label>
          <input
            type="text"
            placeholder="ex: F2026-0891"
            value={pieceRef}
            onChange={e => setPieceRef(e.target.value)}
            style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Statut d'Équilibre</label>
          <div style={{
            padding: '8px',
            borderRadius: '4px',
            backgroundColor: isBalanced ? 'rgba(22, 163, 74, 0.2)' : 'rgba(220, 38, 38, 0.2)',
            border: `1px solid ${isBalanced ? '#16a34a' : '#dc2626'}`,
            color: isBalanced ? '#4ade80' : '#f87171',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '13px'
          }}>
            {isBalanced ? '✅ Équilibrée (Solde 0.000)' : `âŒ Déséquilibrée (-${diff.toFixed(3)} TND)`}
          </div>
        </div>
      </div>

      {/* Formulaire de saisie ultra-rapide */}
      <form onSubmit={handleAddLine} style={{
        display: 'grid',
        gridTemplateColumns: '150px 1fr 140px 140px 100px',
        gap: '8px',
        backgroundColor: '#1e293b',
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid #3b82f6'
      }}>
        <input
          ref={accountRef}
          type="text"
          placeholder="N° Compte (ex: 601)"
          value={currentAccount}
          onChange={e => setCurrentAccount(e.target.value)}
          style={{ padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
        />
        <input
          type="text"
          placeholder="Libellé de la ligne"
          value={currentLabel}
          onChange={e => setCurrentLabel(e.target.value)}
          style={{ padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
        />
        <input
          type="number"
          step="0.001"
          placeholder="Débit"
          value={currentDebit}
          onChange={e => setCurrentDebit(e.target.value)}
          style={{ padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', textAlign: 'right' }}
        />
        <input
          type="number"
          step="0.001"
          placeholder="Crédit"
          value={currentCredit}
          onChange={e => setCurrentCredit(e.target.value)}
          style={{ padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', textAlign: 'right' }}
        />
        <button
          type="submit"
          style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
        >
          + Ajouter
        </button>
      </form>

      {/* Grille des lignes saisies */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
              <th style={{ padding: '12px' }}>Compte</th>
              <th style={{ padding: '12px' }}>Intitulé</th>
              <th style={{ padding: '12px' }}>Libellé de l'Écriture</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Débit (TND)</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Crédit (TND)</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #334155', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#38bdf8' }}>{l.account}</td>
                <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{l.accountName}</td>
                <td style={{ padding: '10px 12px' }}>{l.label}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{l.debit > 0 ? l.debit.toFixed(3) : '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{l.credit > 0 ? l.credit.toFixed(3) : '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <button
                    onClick={() => setLines(lines.filter(x => x.id !== l.id))}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px' }}
                  >
                    🗑ï¸
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#0f172a', fontWeight: 'bold', fontSize: '14px', borderTop: '2px solid #334155' }}>
              <td colSpan={3} style={{ padding: '12px', textAlign: 'right' }}>Totaux :</td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#4ade80' }}>{totalDebit.toFixed(3)} TND</td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#4ade80' }}>{totalCredit.toFixed(3)} TND</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
