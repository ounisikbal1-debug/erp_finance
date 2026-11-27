import React, { useState } from 'react';
import { exportToExcel, exportToPDF } from './exportUtils';

export interface BalanceSheetItem {
  code: string;
  label: string;
  noteRef: string;
  grossAmount: number;
  depreciationAmortization: number;
  netCurrentYear: number;
  netPriorYear: number;
}

export interface BalanceSheetPanelProps {
  accessToken: string | null;
  entityId: string | null;
  currency: string;
}

export default function BalanceSheetPanel({
  accessToken: _accessToken,
  entityId: _entityId,
  currency = 'TND',
}: BalanceSheetPanelProps) {
  const [exerciseYear, setExerciseYear] = useState('2026');
  const [asOfDate, setAsOfDate] = useState('2026-12-31');

  // Formatage TND
  const fmt = (val: number) =>
    val.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' ' + currency;

  // 1. ACTIF DU BILAN (Système Comptable des Entreprises - SCE NC 01)
  const nonCurrentAssets: BalanceSheetItem[] = [
    { code: '21', label: 'Immobilisations Incorporelles (Brevets, Licences, Logiciels)', noteRef: 'Note 4', grossAmount: 450000, depreciationAmortization: 180000, netCurrentYear: 270000, netPriorYear: 290000 },
    { code: '22', label: 'Terrains et Aménagements de Terrains', noteRef: 'Note 5', grossAmount: 1800000, depreciationAmortization: 0, netCurrentYear: 1800000, netPriorYear: 1800000 },
    { code: '23', label: 'Constructions & Bâtiments Industriels', noteRef: 'Note 5', grossAmount: 4200000, depreciationAmortization: 840000, netCurrentYear: 3360000, netPriorYear: 3570000 },
    { code: '24', label: 'Installations Techniques, Matériel & Outillage Industriel', noteRef: 'Note 5', grossAmount: 6850000, depreciationAmortization: 2280000, netCurrentYear: 4570000, netPriorYear: 4120000 },
    { code: '25', label: 'Matériel de Transport & Logistique Flotte', noteRef: 'Note 5', grossAmount: 950000, depreciationAmortization: 380000, netCurrentYear: 570000, netPriorYear: 520000 },
    { code: '26', label: 'Autres Immobilisations Corporelles (Mobilier, Équipements IT)', noteRef: 'Note 5', grossAmount: 620000, depreciationAmortization: 240000, netCurrentYear: 380000, netPriorYear: 340000 },
    { code: '27', label: 'Immobilisations Financières (Titres de participation, Dépôts)', noteRef: 'Note 6', grossAmount: 480000, depreciationAmortization: 0, netCurrentYear: 480000, netPriorYear: 450000 },
  ];

  const currentAssets: BalanceSheetItem[] = [
    { code: '31/32', label: 'Stocks de Matières Premières & Fournitures Liées', noteRef: 'Note 7', grossAmount: 2450000, depreciationAmortization: 50000, netCurrentYear: 2400000, netPriorYear: 2150000 },
    { code: '35', label: 'Stocks de Produits Finis & En-cours de Production', noteRef: 'Note 7', grossAmount: 1980000, depreciationAmortization: 0, netCurrentYear: 1980000, netPriorYear: 1720000 },
    { code: '411', label: 'Clients & Comptes Rattachés (Créances d’Exploitation)', noteRef: 'Note 8', grossAmount: 4950000, depreciationAmortization: 250000, netCurrentYear: 4700000, netPriorYear: 4250000 },
    { code: '4366', label: 'État, TVA Déductible & Crédits d’Impôts', noteRef: 'Note 9', grossAmount: 340000, depreciationAmortization: 0, netCurrentYear: 340000, netPriorYear: 290000 },
    { code: '45/46', label: 'Autres Actifs Courants & Débiteurs Divers', noteRef: 'Note 10', grossAmount: 280000, depreciationAmortization: 0, netCurrentYear: 280000, netPriorYear: 210000 },
    { code: '532', label: 'Banques & Équivalents de Liquidités (STB, BIAT, BH)', noteRef: 'Note 11', grossAmount: 4600000, depreciationAmortization: 0, netCurrentYear: 4600000, netPriorYear: 3950000 },
    { code: '54', label: 'Caisse & Régies d’Avances', noteRef: 'Note 11', grossAmount: 15000, depreciationAmortization: 0, netCurrentYear: 15000, netPriorYear: 12000 },
  ];

  // Totaux Actif
  const totalNetNonCurrent = nonCurrentAssets.reduce((acc, item) => acc + item.netCurrentYear, 0);
  const totalNetCurrent = currentAssets.reduce((acc, item) => acc + item.netCurrentYear, 0);
  const totalActifNet = totalNetNonCurrent + totalNetCurrent;

  const totalNetNonCurrentPrior = nonCurrentAssets.reduce((acc, item) => acc + item.netPriorYear, 0);
  const totalNetCurrentPrior = currentAssets.reduce((acc, item) => acc + item.netPriorYear, 0);
  const totalActifNetPrior = totalNetNonCurrentPrior + totalNetCurrentPrior;

  // 2. PASSIF DU BILAN (Capitaux Propres & Passifs)
  const equityItems = [
    { code: '101', label: 'Capital Social Souscrit et Libéré', noteRef: 'Note 12', currentYear: 10000000, priorYear: 10000000 },
    { code: '111', label: 'Réserve Légale (10% du capital souscrit)', noteRef: 'Note 13', currentYear: 1000000, priorYear: 880000 },
    { code: '112/118', label: 'Réserves Statutaires & Réglementées', noteRef: 'Note 13', currentYear: 1850000, priorYear: 1450000 },
    { code: '12', label: 'Résultats Reportés (Report à Nouveau)', noteRef: 'Note 14', currentYear: 2640000, priorYear: 2120000 },
    { code: '13', label: 'Résultat Net de l’Exercice (Bénéfice Net)', noteRef: 'Note 15', currentYear: 1855000, priorYear: 1680000 },
  ];

  const nonCurrentLiabilities = [
    { code: '16', label: 'Emprunts Bancaires à Moyen et Long Terme', noteRef: 'Note 16', currentYear: 3200000, priorYear: 3750000 },
    { code: '17', label: 'Dettes de Location-Financement (Leasing)', noteRef: 'Note 16', currentYear: 450000, priorYear: 580000 },
  ];

  const currentLiabilities = [
    { code: '401', label: 'Fournisseurs d’Exploitation & Comptes Rattachés', noteRef: 'Note 17', currentYear: 3350000, priorYear: 2980000 },
    { code: '421/428', label: 'Personnel, Salaires & Rémunérations Dues', noteRef: 'Note 18', currentYear: 380000, priorYear: 340000 },
    { code: '431', label: 'Organismes Sociaux (Cotisations CNSS à Payer)', noteRef: 'Note 18', currentYear: 215000, priorYear: 195000 },
    { code: '4367', label: 'État, TVA Collectée & Retenues à la Source (RS)', noteRef: 'Note 19', currentYear: 485000, priorYear: 410000 },
    { code: '44', label: 'Impôt sur les Sociétés (IS) Dû', noteRef: 'Note 19', currentYear: 230000, priorYear: 210000 },
    { code: '505', label: 'Concours Bancaires Courants & Facilités de Caisse', noteRef: 'Note 20', currentYear: 300000, priorYear: 387000 },
  ];

  const totalEquity = equityItems.reduce((acc, item) => acc + item.currentYear, 0);
  const totalEquityPrior = equityItems.reduce((acc, item) => acc + item.priorYear, 0);

  const totalNonCurrentLiab = nonCurrentLiabilities.reduce((acc, item) => acc + item.currentYear, 0);
  const totalNonCurrentLiabPrior = nonCurrentLiabilities.reduce((acc, item) => acc + item.priorYear, 0);

  const totalCurrentLiab = currentLiabilities.reduce((acc, item) => acc + item.currentYear, 0);
  const totalCurrentLiabPrior = currentLiabilities.reduce((acc, item) => acc + item.priorYear, 0);

  const totalPassif = totalEquity + totalNonCurrentLiab + totalCurrentLiab;
  const totalPassifPrior = totalEquityPrior + totalNonCurrentLiabPrior + totalCurrentLiabPrior;

  const ecartEquilibre = Math.abs(totalActifNet - totalPassif);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
            Comptabilité &gt; <span style={{ color: '#0F172A', fontWeight: 700 }}>États Financiers Légaux</span>
          </div>
          <h1 style={{ margin: '4px 0 0', color: '#0F172A', fontSize: '1.4rem', fontWeight: 800 }}>
            Bilan Comptable Officiel (SCE NC 01)
          </h1>
          <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '2px' }}>
            Actif &amp; Passif au 31 Décembre {exerciseYear} • Système Comptable des Entreprises Tunisien
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={exerciseYear}
            onChange={(e) => {
              setExerciseYear(e.target.value);
              setAsOfDate(`${e.target.value}-12-31`);
            }}
            style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px 12px', fontSize: '0.84rem', fontWeight: 700 }}
          >
            <option value="2026">Exercice 2026 (Arrêté au 31/12/2026)</option>
            <option value="2025">Exercice 2025 (Clos &amp; Audité)</option>
          </select>

          <button
            type="button"
            onClick={() =>
              exportToExcel(
                `Bilan_Comptable_SCE_${exerciseYear}`,
                [
                  { header: 'Poste', key: 'label' },
                  { header: 'Réf. Note', key: 'noteRef' },
                  { header: `Exercice ${exerciseYear}`, key: 'netCurrentYear' },
                  { header: `Exercice ${parseInt(exerciseYear, 10) - 1}`, key: 'netPriorYear' },
                ],
                [...nonCurrentAssets, ...currentAssets],
                { moduleName: `Bilan Actif SCE NC 01 - ${exerciseYear}` }
              )
            }
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              padding: '7px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            📊 Exporter Bilan Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              background: '#1D4ED8',
              color: '#FFFFFF',
              border: 'none',
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🖨️ Imprimer la Liasse
          </button>
        </div>
      </div>

      {/* Cartes d'équilibre et indicateurs financiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
          <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>
            TOTAL DE L'ACTIF NET
          </div>
          <div style={{ marginTop: '4px', fontSize: '1.45rem', fontWeight: 900, color: '#1E3A8A' }}>
            {fmt(totalActifNet)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#16A34A', fontWeight: 700, marginTop: '2px' }}>
            + {fmt(totalActifNet - totalActifNetPrior)} vs N-1
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
          <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>
            TOTAL DU PASSIF (CAPITAUX + DETTES)
          </div>
          <div style={{ marginTop: '4px', fontSize: '1.45rem', fontWeight: 900, color: '#1E3A8A' }}>
            {fmt(totalPassif)}
          </div>
          <div style={{ fontSize: '0.74rem', color: ecartEquilibre === 0 ? '#16A34A' : '#DC2626', fontWeight: 800, marginTop: '2px' }}>
            {ecartEquilibre === 0 ? '✅ Équilibre Parfait (Écart : 0.000 DT)' : `⚠️ Écart : ${fmt(ecartEquilibre)}`}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
          <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>
            CAPITAUX PROPRES (NETS)
          </div>
          <div style={{ marginTop: '4px', fontSize: '1.45rem', fontWeight: 900, color: '#0F172A' }}>
            {fmt(totalEquity)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
            Autonomie financière : {((totalEquity / totalPassif) * 100).toFixed(1)} %
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
          <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>
            FONDS DE ROULEMENT NET GLOBAL (FRNG)
          </div>
          <div style={{ marginTop: '4px', fontSize: '1.45rem', fontWeight: 900, color: '#15803D' }}>
            {fmt((totalEquity + totalNonCurrentLiab) - totalNetNonCurrent)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#15803D', fontWeight: 700, marginTop: '2px' }}>
            Structure financière saine
          </div>
        </div>
      </div>

      {/* BILAN : DISPOSITION EN DEUX VOLETS (ACTIF & PASSIF) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
        
        {/* VOLET GAUCHE : ACTIF */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ background: '#1E3A8A', color: '#FFFFFF', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ACTIF (Emplois Durables &amp; Circulants)
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Net {exerciseYear}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', fontWeight: 700, textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Rubrique</th>
                <th style={{ padding: '8px 6px', textAlign: 'center' }}>Note</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net {exerciseYear}</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net N-1</th>
              </tr>
            </thead>
            <tbody>
              {/* SECTION 1 : ACTIFS NON COURANTS */}
              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                <td colSpan={4} style={{ padding: '8px 12px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                  I. ACTIFS NON COURANTS (IMMOBILISATIONS)
                </td>
              </tr>
              {nonCurrentAssets.map((item) => (
                <tr key={item.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.label}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>{item.noteRef}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{item.netCurrentYear.toLocaleString('fr-TN')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B' }}>{item.netPriorYear.toLocaleString('fr-TN')}</td>
                </tr>
              ))}
              <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '9px 12px', color: '#1E3A8A' }}>TOTAL ACTIFS NON COURANTS (I)</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#1E3A8A' }}>{totalNetNonCurrent.toLocaleString('fr-TN')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748B' }}>{totalNetNonCurrentPrior.toLocaleString('fr-TN')}</td>
              </tr>

              {/* SECTION 2 : ACTIFS COURANTS */}
              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                <td colSpan={4} style={{ padding: '8px 12px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                  II. ACTIFS COURANTS (EXPLOITATION &amp; TRÉSORERIE)
                </td>
              </tr>
              {currentAssets.map((item) => (
                <tr key={item.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.label}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>{item.noteRef}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{item.netCurrentYear.toLocaleString('fr-TN')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B' }}>{item.netPriorYear.toLocaleString('fr-TN')}</td>
                </tr>
              ))}
              <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '9px 12px', color: '#1E3A8A' }}>TOTAL ACTIFS COURANTS (II)</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#1E3A8A' }}>{totalNetCurrent.toLocaleString('fr-TN')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748B' }}>{totalNetCurrentPrior.toLocaleString('fr-TN')}</td>
              </tr>

              {/* TOTAL GÉNÉRAL ACTIF */}
              <tr style={{ background: '#0F172A', color: '#FFFFFF', fontWeight: 900, fontSize: '0.88rem' }}>
                <td colSpan={2} style={{ padding: '12px 14px' }}>TOTAL GÉNÉRAL DE L'ACTIF (I + II)</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', color: '#38BDF8' }}>{totalActifNet.toLocaleString('fr-TN')} {currency}</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', color: '#94A3B8' }}>{totalActifNetPrior.toLocaleString('fr-TN')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* VOLET DROIT : PASSIF */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ background: '#0F766E', color: '#FFFFFF', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              PASSIF (Capitaux Propres &amp; Dettes)
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Net {exerciseYear}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', fontWeight: 700, textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Rubrique</th>
                <th style={{ padding: '8px 6px', textAlign: 'center' }}>Note</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Exercice {exerciseYear}</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Exercice N-1</th>
              </tr>
            </thead>
            <tbody>
              {/* SECTION 1 : CAPITAUX PROPRES */}
              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                <td colSpan={4} style={{ padding: '8px 12px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                  I. CAPITAUX PROPRES (FONDS PROPRES)
                </td>
              </tr>
              {equityItems.map((item) => (
                <tr key={item.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.label}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>{item.noteRef}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{item.currentYear.toLocaleString('fr-TN')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B' }}>{item.priorYear.toLocaleString('fr-TN')}</td>
                </tr>
              ))}
              <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '9px 12px', color: '#0F766E' }}>TOTAL CAPITAUX PROPRES (I)</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#0F766E' }}>{totalEquity.toLocaleString('fr-TN')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748B' }}>{totalEquityPrior.toLocaleString('fr-TN')}</td>
              </tr>

              {/* SECTION 2 : PASSIFS NON COURANTS */}
              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                <td colSpan={4} style={{ padding: '8px 12px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                  II. PASSIFS NON COURANTS (DETTES LT)
                </td>
              </tr>
              {nonCurrentLiabilities.map((item) => (
                <tr key={item.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.label}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>{item.noteRef}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{item.currentYear.toLocaleString('fr-TN')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B' }}>{item.priorYear.toLocaleString('fr-TN')}</td>
                </tr>
              ))}
              <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '9px 12px', color: '#0F766E' }}>TOTAL PASSIFS NON COURANTS (II)</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#0F766E' }}>{totalNonCurrentLiab.toLocaleString('fr-TN')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748B' }}>{totalNonCurrentLiabPrior.toLocaleString('fr-TN')}</td>
              </tr>

              {/* SECTION 3 : PASSIFS COURANTS */}
              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                <td colSpan={4} style={{ padding: '8px 12px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                  III. PASSIFS COURANTS (FOURNISSEURS, ÉTAT &amp; DETTES CT)
                </td>
              </tr>
              {currentLiabilities.map((item) => (
                <tr key={item.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.label}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>{item.noteRef}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{item.currentYear.toLocaleString('fr-TN')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B' }}>{item.priorYear.toLocaleString('fr-TN')}</td>
                </tr>
              ))}
              <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '9px 12px', color: '#0F766E' }}>TOTAL PASSIFS COURANTS (III)</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#0F766E' }}>{totalCurrentLiab.toLocaleString('fr-TN')}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748B' }}>{totalCurrentLiabPrior.toLocaleString('fr-TN')}</td>
              </tr>

              {/* TOTAL GÉNÉRAL PASSIF */}
              <tr style={{ background: '#0F172A', color: '#FFFFFF', fontWeight: 900, fontSize: '0.88rem' }}>
                <td colSpan={2} style={{ padding: '12px 14px' }}>TOTAL GÉNÉRAL DU PASSIF (I + II + III)</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', color: '#34D399' }}>{totalPassif.toLocaleString('fr-TN')} {currency}</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', color: '#94A3B8' }}>{totalPassifPrior.toLocaleString('fr-TN')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
