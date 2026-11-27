import React, { useState } from 'react';
import { exportToExcel, exportToPDF } from './exportUtils';

export interface BankAccount {
  id: string;
  bankName: string;
  agency: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  ribKey: string;
  fullRib: string;
  iban: string;
  bicSwift: string;
  currency: string;
  glAccountCode: string;
  currentBalance: number;
  isPrimary: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface EntityGeneralSettings {
  legalName: string;
  legalForm: string;
  tradeRegister: string; // RNE / Registre de Commerce
  taxRegistrationNumber: string; // Matricule Fiscal (MF / Code TVA / Code Douane)
  customsCode: string;
  vatCode: string;
  headquartersAddress: string;
  postalCode: string;
  city: string;
  governorate: string;
  country: string;
  shareCapital: number;
  mainActivity: string;
  phone: string;
  email: string;
  website: string;
  ceoName: string;
  accountingStandard: string;
  fiscalRegime: string;
  currency: string;
}

export interface GeneralSettingsPanelProps {
  accessToken: string | null;
  entityId: string | null;
  currency: string;
}

export default function GeneralSettingsPanel({
  accessToken: _accessToken,
  entityId: _entityId,
  currency = 'TND',
}: GeneralSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'entity' | 'banks'>('entity');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // 1. Informations de l'Entité (Tunisie)
  const [entityInfo, setEntityInfo] = useState<EntityGeneralSettings>({
    legalName: 'SAFE Tunisie Industrie Plastique SA',
    legalForm: 'Société Anonyme (SA)',
    tradeRegister: 'B0112482020',
    taxRegistrationNumber: '0459871/B/A/M/000',
    customsCode: 'CD-78412-TN',
    vatCode: 'A (Assujetti Total)',
    headquartersAddress: 'Zone Industrielle Ben Arous, Rue des Entrepreneurs',
    postalCode: '2013',
    city: 'Ben Arous',
    governorate: 'Ben Arous',
    country: 'Tunisie',
    shareCapital: 10000000.0,
    mainActivity: 'Transformation des polymères et fabrication de pièces techniques plastiques',
    phone: '+216 71 380 400',
    email: 'contact@safe-tn.com',
    website: 'https://www.safe-tn.com',
    ceoName: 'Karim Jaziri (Directeur Général)',
    accountingStandard: 'Système Comptable des Entreprises (SCE NC 01)',
    fiscalRegime: 'Régime Réel Normal - Déclaration Mensuelle G50',
    currency: 'TND',
  });

  // 2. Banques de l'Entité chez qui elle a des comptes
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    {
      id: 'BNK-01',
      bankName: 'Société Tunisienne de Banque (STB)',
      agency: 'Agence Tunis Lac II Corporate',
      bankCode: '10',
      branchCode: '004',
      accountNumber: '1004589214',
      ribKey: '45',
      fullRib: '10 004 1004589214 45',
      iban: 'TN59 1000 4100 4589 2144 5',
      bicSwift: 'STBKTNTT',
      currency: 'TND',
      glAccountCode: '532100',
      currentBalance: 4600000.0,
      isPrimary: true,
      status: 'ACTIVE',
    },
    {
      id: 'BNK-02',
      bankName: 'Banque Internationale Arabe de Tunisie (BIAT)',
      agency: 'Agence Habib Bourguiba Tunis',
      bankCode: '08',
      branchCode: '012',
      accountNumber: '0801245678',
      ribKey: '32',
      fullRib: '08 012 0801245678 32',
      iban: 'TN59 0801 2080 1245 6783 2',
      bicSwift: 'BIATTNTT',
      currency: 'TND',
      glAccountCode: '532200',
      currentBalance: 1850400.25,
      isPrimary: false,
      status: 'ACTIVE',
    },
    {
      id: 'BNK-03',
      bankName: 'BH Bank (Banque de l’Habitat)',
      agency: 'Agence Tunis Belvédère',
      bankCode: '14',
      branchCode: '001',
      accountNumber: '1400198765',
      ribKey: '19',
      fullRib: '14 001 1400198765 19',
      iban: 'TN59 1400 1140 0198 7651 9',
      bicSwift: 'BHBKTNTT',
      currency: 'TND',
      glAccountCode: '532300',
      currentBalance: 920150.0,
      isPrimary: false,
      status: 'ACTIVE',
    },
    {
      id: 'BNK-04',
      bankName: 'Attijariwafa Bank Tunisie',
      agency: 'Agence Charguia II Entreprises',
      bankCode: '04',
      branchCode: '025',
      accountNumber: '0402511223',
      ribKey: '88',
      fullRib: '04 025 0402511223 88',
      iban: 'TN59 0402 5040 2511 2238 8',
      bicSwift: 'BSTUTNTT',
      currency: 'EUR',
      glAccountCode: '532400',
      currentBalance: 420000.0,
      isPrimary: false,
      status: 'ACTIVE',
    },
  ]);

  // Modal d'ajout de compte bancaire
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBank, setNewBank] = useState<Partial<BankAccount>>({
    bankName: 'Banque Nationale Agricole (BNA)',
    agency: 'Agence Ariana',
    bankCode: '03',
    branchCode: '002',
    accountNumber: '0300233445',
    ribKey: '67',
    currency: 'TND',
    glAccountCode: '532500',
    currentBalance: 0,
    isPrimary: false,
  });

  const handleSaveEntity = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveNotice('Paramètres de l’entité enregistrés avec succès dans le registre officiel SAFE.');
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const handleAddBank = (e: React.FormEvent) => {
    e.preventDefault();
    const bankCode = newBank.bankCode || '01';
    const branchCode = newBank.branchCode || '001';
    const accountNum = newBank.accountNumber || '0000000000';
    const ribKey = newBank.ribKey || '00';
    const fullRib = `${bankCode} ${branchCode} ${accountNum} ${ribKey}`;
    const iban = `TN59 ${bankCode}${branchCode.slice(0, 2)} ${branchCode.slice(2)}${accountNum.slice(0, 3)} ${accountNum.slice(3, 7)} ${accountNum.slice(7)}${ribKey}`;

    const created: BankAccount = {
      id: `BNK-${String(bankAccounts.length + 1).padStart(2, '0')}`,
      bankName: newBank.bankName || 'Nouvelle Banque Tunisienne',
      agency: newBank.agency || 'Agence Siège',
      bankCode,
      branchCode,
      accountNumber: accountNum,
      ribKey,
      fullRib,
      iban,
      bicSwift: newBank.bicSwift || 'BANKTNTT',
      currency: newBank.currency || 'TND',
      glAccountCode: newBank.glAccountCode || '532000',
      currentBalance: Number(newBank.currentBalance) || 0,
      isPrimary: Boolean(newBank.isPrimary),
      status: 'ACTIVE',
    };

    setBankAccounts([...bankAccounts, created]);
    setShowAddModal(false);
    setSaveNotice(`Compte bancaire ${created.bankName} (${created.fullRib}) ajouté avec succès.`);
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const formatAmount = (val: number, cur: string) =>
    val.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' ' + cur;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
            Paramètres &gt; <span style={{ color: '#0F172A', fontWeight: 700 }}>Paramètres Généraux &amp; Banques</span>
          </div>
          <h1 style={{ margin: '4px 0 0', color: '#0F172A', fontSize: '1.4rem', fontWeight: 800 }}>
            Paramètres Généraux de l'Entité &amp; Comptes Bancaires
          </h1>
        </div>

        {/* Boutons d'export */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() =>
              exportToExcel(
                'Comptes_Bancaires_Entite',
                [
                  { header: 'Banque', key: 'bankName' },
                  { header: 'Agence', key: 'agency' },
                  { header: 'RIB Complet', key: 'fullRib' },
                  { header: 'IBAN', key: 'iban' },
                  { header: 'BIC/SWIFT', key: 'bicSwift' },
                  { header: 'Devise', key: 'currency' },
                  { header: 'Compte Comptable', key: 'glAccountCode' },
                  { header: 'Solde', key: 'currentBalance' },
                ],
                bankAccounts,
                { moduleName: 'Banques de l’Entité' }
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
            📊 Exporter Banques (Excel)
          </button>
          <button
            type="button"
            onClick={() =>
              exportToPDF(
                'Comptes_Bancaires_Entite',
                [
                  { header: 'Banque', key: 'bankName' },
                  { header: 'Agence', key: 'agency' },
                  { header: 'RIB Complet', key: 'fullRib' },
                  { header: 'IBAN', key: 'iban' },
                  { header: 'Devise', key: 'currency' },
                  { header: 'Solde', key: 'currentBalance' },
                ],
                bankAccounts,
                { moduleName: 'Banques de l’Entité' }
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
            🖨️ Imprimer Fiche (PDF)
          </button>
        </div>
      </div>

      {saveNotice && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#166534',
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
        >
          ✅ {saveNotice}
        </div>
      )}

      {/* Onglets */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E2E8F0', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('entity')}
          style={{
            padding: '10px 18px',
            fontWeight: 800,
            fontSize: '0.88rem',
            border: 'none',
            borderBottom: activeTab === 'entity' ? '3px solid #1D4ED8' : '3px solid transparent',
            background: 'none',
            color: activeTab === 'entity' ? '#1D4ED8' : '#64748B',
            cursor: 'pointer',
          }}
        >
          🏢 1. Fiche d’Identité &amp; Renseignements Juridiques
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('banks')}
          style={{
            padding: '10px 18px',
            fontWeight: 800,
            fontSize: '0.88rem',
            border: 'none',
            borderBottom: activeTab === 'banks' ? '3px solid #1D4ED8' : '3px solid transparent',
            background: 'none',
            color: activeTab === 'banks' ? '#1D4ED8' : '#64748B',
            cursor: 'pointer',
          }}
        >
          🏦 2. Comptes Bancaires de l'Entité ({bankAccounts.length})
        </button>
      </div>

      {/* CONTENU ONGLET 1 : FICHE IDENTITÉ DE L'ENTITÉ */}
      {activeTab === 'entity' && (
        <form onSubmit={handleSaveEntity} style={{ display: 'grid', gap: '16px' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase' }}>
              Identité de l'Entité &amp; Immatriculations Fiscales Tunisiennes
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Raison Sociale</label>
                <input
                  type="text"
                  value={entityInfo.legalName}
                  onChange={(e) => setEntityInfo({ ...entityInfo, legalName: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 700 }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Forme Juridique</label>
                <select
                  value={entityInfo.legalForm}
                  onChange={(e) => setEntityInfo({ ...entityInfo, legalForm: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                >
                  <option value="Société Anonyme (SA)">Société Anonyme (SA)</option>
                  <option value="Société à Responsabilité Limitée (SARL)">Société à Responsabilité Limitée (SARL)</option>
                  <option value="Société Unipersonnelle à Responsabilité Limitée (SUARL)">Société Unipersonnelle (SUARL)</option>
                  <option value="Société en Nom Collectif (SNC)">Société en Nom Collectif (SNC)</option>
                  <option value="Établissement Public / Entreprise Publique">Entreprise Publique</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Matricule Fiscal DGI (MF / TVA / Catégorie)
                </label>
                <input
                  type="text"
                  value={entityInfo.taxRegistrationNumber}
                  onChange={(e) => setEntityInfo({ ...entityInfo, taxRegistrationNumber: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 800, color: '#1D4ED8' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Registre National des Entreprises (RNE / RC)
                </label>
                <input
                  type="text"
                  value={entityInfo.tradeRegister}
                  onChange={(e) => setEntityInfo({ ...entityInfo, tradeRegister: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Code Douane Tunisienne</label>
                <input
                  type="text"
                  value={entityInfo.customsCode}
                  onChange={(e) => setEntityInfo({ ...entityInfo, customsCode: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Code TVA / Assujettissement</label>
                <input
                  type="text"
                  value={entityInfo.vatCode}
                  onChange={(e) => setEntityInfo({ ...entityInfo, vatCode: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Capital Social (TND)</label>
                <input
                  type="number"
                  step="0.001"
                  value={entityInfo.shareCapital}
                  onChange={(e) => setEntityInfo({ ...entityInfo, shareCapital: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Directeur Général / Gérant</label>
                <input
                  type="text"
                  value={entityInfo.ceoName}
                  onChange={(e) => setEntityInfo({ ...entityInfo, ceoName: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '16px', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                Coordonnées &amp; Siège Social
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Adresse Complète du Siège</label>
                  <input
                    type="text"
                    value={entityInfo.headquartersAddress}
                    onChange={(e) => setEntityInfo({ ...entityInfo, headquartersAddress: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Ville / Gouvernorat</label>
                  <input
                    type="text"
                    value={`${entityInfo.city} - ${entityInfo.governorate}`}
                    onChange={(e) => setEntityInfo({ ...entityInfo, city: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Code Postal</label>
                  <input
                    type="text"
                    value={entityInfo.postalCode}
                    onChange={(e) => setEntityInfo({ ...entityInfo, postalCode: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Téléphone</label>
                  <input
                    type="text"
                    value={entityInfo.phone}
                    onChange={(e) => setEntityInfo({ ...entityInfo, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Email Officiel</label>
                  <input
                    type="email"
                    value={entityInfo.email}
                    onChange={(e) => setEntityInfo({ ...entityInfo, email: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                style={{
                  background: '#1D4ED8',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                💾 Enregistrer les Modifications de l'Entité
              </button>
            </div>
          </div>
        </form>
      )}

      {/* CONTENU ONGLET 2 : COMPTES BANCAIRES */}
      {activeTab === 'banks' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Barre d'action */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
              {bankAccounts.length} comptes bancaires enregistrés pour cette entité (STB, BIAT, BH Bank, Attijari, etc.)
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                background: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>+</span> Ajouter un Compte Bancaire
            </button>
          </div>

          {/* Cartes et Tableau des Comptes Bancaires */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#0F172A', fontWeight: 800, textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px' }}>Banque &amp; Agence</th>
                  <th style={{ padding: '12px 14px' }}>Compte Comptable</th>
                  <th style={{ padding: '12px 14px' }}>RIB Tunisien (20 chiffres)</th>
                  <th style={{ padding: '12px 14px' }}>IBAN Tunisien</th>
                  <th style={{ padding: '12px 14px' }}>SWIFT / BIC</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Solde Comptable</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((account) => (
                  <tr key={account.id} style={{ borderBottom: '1px solid #E2E8F0', background: account.isPrimary ? '#F0FDF4' : '#FFFFFF' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.86rem' }}>
                        {account.bankName}
                        {account.isPrimary && (
                          <span style={{ marginLeft: '6px', background: '#16A34A', color: '#FFFFFF', fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                            Principal
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>{account.agency}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1D4ED8' }}>
                      {account.glAccountCode}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>
                      {account.fullRib}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#475569' }}>
                      {account.iban}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#334155' }}>
                      {account.bicSwift}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: '0.88rem', color: account.currentBalance >= 0 ? '#15803D' : '#DC2626' }}>
                      {formatAmount(account.currentBalance, account.currency)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span style={{ background: '#DCFCE7', color: '#166534', fontWeight: 800, fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px' }}>
                        ACTIF
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Modal Ajout Compte Bancaire */}
          {showAddModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 42, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px',
              }}
            >
              <div style={{ background: '#FFFFFF', borderRadius: '12px', width: '100%', maxWidth: '580px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                    Nouveau Compte Bancaire Tunisien
                  </h3>
                  <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748B' }}>
                    ✕
                  </button>
                </div>

                <form onSubmit={handleAddBank} style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Nom de la Banque</label>
                    <select
                      value={newBank.bankName}
                      onChange={(e) => {
                        const bName = e.target.value;
                        let bCode = '01';
                        let bic = 'BANKTNTT';
                        if (bName.includes('STB')) { bCode = '10'; bic = 'STBKTNTT'; }
                        else if (bName.includes('BIAT')) { bCode = '08'; bic = 'BIATTNTT'; }
                        else if (bName.includes('BH')) { bCode = '14'; bic = 'BHBKTNTT'; }
                        else if (bName.includes('BNA')) { bCode = '03'; bic = 'BNANTNTT'; }
                        else if (bName.includes('Attijari')) { bCode = '04'; bic = 'BSTUTNTT'; }
                        else if (bName.includes('UIB')) { bCode = '12'; bic = 'UIBKTNTT'; }
                        setNewBank({ ...newBank, bankName: bName, bankCode: bCode, bicSwift: bic });
                      }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem' }}
                    >
                      <option value="Société Tunisienne de Banque (STB)">Société Tunisienne de Banque (STB)</option>
                      <option value="Banque Internationale Arabe de Tunisie (BIAT)">Banque Internationale Arabe de Tunisie (BIAT)</option>
                      <option value="BH Bank (Banque de l’Habitat)">BH Bank (Banque de l’Habitat)</option>
                      <option value="Banque Nationale Agricole (BNA)">Banque Nationale Agricole (BNA)</option>
                      <option value="Attijariwafa Bank Tunisie">Attijariwafa Bank Tunisie</option>
                      <option value="Union Internationale de Banques (UIB)">Union Internationale de Banques (UIB)</option>
                      <option value="Amen Bank">Amen Bank</option>
                      <option value="Banque de Tunisie (BT)">Banque de Tunisie (BT)</option>
                      <option value="Autre Banque">Autre Banque</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Agence</label>
                      <input
                        type="text"
                        value={newBank.agency}
                        onChange={(e) => setNewBank({ ...newBank, agency: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Compte Comptable GL</label>
                      <input
                        type="text"
                        value={newBank.glAccountCode}
                        onChange={(e) => setNewBank({ ...newBank, glAccountCode: e.target.value })}
                        placeholder="Ex: 532100"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem' }}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 1fr 70px', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Code Bq</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={newBank.bankCode}
                        onChange={(e) => setNewBank({ ...newBank, bankCode: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem', textAlign: 'center' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Guichet</label>
                      <input
                        type="text"
                        maxLength={3}
                        value={newBank.branchCode}
                        onChange={(e) => setNewBank({ ...newBank, branchCode: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem', textAlign: 'center' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>N° de Compte (10 ch.)</label>
                      <input
                        type="text"
                        maxLength={10}
                        value={newBank.accountNumber}
                        onChange={(e) => setNewBank({ ...newBank, accountNumber: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Clé RIB</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={newBank.ribKey}
                        onChange={(e) => setNewBank({ ...newBank, ribKey: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem', textAlign: 'center' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Devise</label>
                      <select
                        value={newBank.currency}
                        onChange={(e) => setNewBank({ ...newBank, currency: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem' }}
                      >
                        <option value="TND">TND (Dinar Tunisien)</option>
                        <option value="EUR">EUR (Euro)</option>
                        <option value="USD">USD (Dollar US)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Solde Initial</label>
                      <input
                        type="number"
                        step="0.001"
                        value={newBank.currentBalance}
                        onChange={(e) => setNewBank({ ...newBank, currentBalance: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569', padding: '8px 16px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      style={{ background: '#10B981', color: '#FFFFFF', border: 'none', padding: '8px 18px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Enregistrer le Compte
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
