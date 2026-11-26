import React, { useState } from 'react';

interface SodConflict {
  ruleCode: string;
  name: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  mitigatingControl: string;
}

const SOD_RULES_CATALOG: SodConflict[] = [
  {
    ruleCode: 'SOD-001',
    name: 'Gestion Tiers Fournisseurs vs Autorisation des Règlements',
    severity: 'CRITICAL',
    description: 'Empêche qu’un même utilisateur puisse créer un RIB fournisseur et émettre un virement bancaire (Risque majeur de détournement).',
    mitigatingControl: 'Double validation bancaire électronique avec certificat RSA / Token.',
  },
  {
    ruleCode: 'SOD-002',
    name: 'Création Bon de Commande vs Validation Facture d’Achat',
    severity: 'HIGH',
    description: 'Empêche l’acheteur de valider le règlement de la facture sans rapprochement préalable (Bypass du 3-Way Matching).',
    mitigatingControl: 'Rapprochement automatique strict BC-BR-Facture (tolérance 0 DT).',
  },
  {
    ruleCode: 'SOD-003',
    name: 'Saisie des Écritures Comptables vs Clôture Périodique & Déverrouillage',
    severity: 'HIGH',
    description: 'Empêche le comptable de clôturer unilatéralement un exercice ou de modifier des écritures validées.',
    mitigatingControl: 'Revue obligatoire par le Directeur Financier avec horodatage immuable.',
  },
  {
    ruleCode: 'SOD-004',
    name: 'Établissement des Fiches de Paie vs Exécution des Virements de Salaires',
    severity: 'CRITICAL',
    description: 'Empêche la création d’employés fictifs ou la modification unilatérale des salaires nets versés.',
    mitigatingControl: 'Validation conjointe RH + DAF + Chaîne de blocs SHA-256.',
  },
];

interface UserProfileAudit {
  username: string;
  name: string;
  role: string;
  assignedFunctions: string[];
  status: 'COMPLIANT' | 'RISK_DETECTED';
  conflictRules: string[];
}

const INITIAL_AUDITED_USERS: UserProfileAudit[] = [
  {
    username: 'admin',
    name: 'Directeur Général (Administrateur)',
    role: 'ADMIN',
    assignedFunctions: ['ALL_SUPERUSER_ACCESS'],
    status: 'COMPLIANT',
    conflictRules: [],
  },
  {
    username: 'finmgr',
    name: 'Directeur Financier (DAF)',
    role: 'FINANCIAL_MANAGER',
    assignedFunctions: ['APPROVE_PURCHASE_INVOICE', 'AUTHORIZE_PAYMENTS', 'LOCK_MONTHLY_PERIOD'],
    status: 'COMPLIANT',
    conflictRules: [],
  },
  {
    username: 'compta',
    name: 'Comptable Fournisseurs & Trésorerie',
    role: 'ACCOUNTANT',
    assignedFunctions: ['POST_JOURNAL_ENTRY', 'MANAGE_VENDORS', 'AUTHORIZE_PAYMENTS'],
    status: 'RISK_DETECTED',
    conflictRules: ['SOD-001'],
  },
  {
    username: 'salesmgr',
    name: 'Responsable Commercial',
    role: 'SALES_OFFICER',
    assignedFunctions: ['CREATE_SALES_ORDER', 'GENERATE_INVOICE'],
    status: 'COMPLIANT',
    conflictRules: [],
  },
];

export default function GovernanceSodPanel({
  accessToken: _accessToken,
  entityId: _entityId,
}: {
  accessToken: string | null;
  entityId?: string | null;
}) {
  const [users, setUsers] = useState<UserProfileAudit[]>(INITIAL_AUDITED_USERS);
  const [testAmount, setTestAmount] = useState<number>(12500);
  const [testRole, setTestRole] = useState<string>('OPERATIONAL_MANAGER');
  const [testResult, setTestResult] = useState<{ authorized: boolean; tier: string; msg: string } | null>(null);

  const handleRemediateUser = (username: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.username === username) {
          return {
            ...u,
            assignedFunctions: u.assignedFunctions.filter((f) => f !== 'AUTHORIZE_PAYMENTS'),
            status: 'COMPLIANT',
            conflictRules: [],
          };
        }
        return u;
      })
    );
  };

  const handleCheckDelegation = () => {
    let auth = false;
    let tier = '';
    let msg = '';

    if (testAmount <= 5000) {
      tier = 'Niveau 1 : Opérationnel N+1 (Jusqu’à 5 000 DT)';
      auth = ['OPERATIONAL_MANAGER', 'FINANCIAL_MANAGER', 'ADMIN'].includes(testRole);
      msg = auth ? 'Dépense autorisée dans la limite du pouvoir opérationnel.' : 'Refusé : Rôle insuffisant.';
    } else if (testAmount <= 50000) {
      tier = 'Niveau 2 : Direction Financière (5 000 - 50 000 DT)';
      auth = ['FINANCIAL_MANAGER', 'ADMIN'].includes(testRole);
      msg = auth ? 'Dépense autorisée par la Direction Financière.' : 'Refusé : Dépassement du seuil opérationnel (DAF requis).';
    } else {
      tier = 'Niveau 3 : Direction Générale (> 50 000 DT)';
      auth = testRole === 'ADMIN';
      msg = auth ? 'Investissement majeur validé par la Direction Générale.' : 'Refusé : Approbation exclusive de la Direction Générale (ADMIN).';
    }

    setTestResult({ authorized: auth, tier, msg });
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#111827' }}>
            🛡️ Gouvernance, Risques & Séparation des Tâches (Gouvernance SAFE)
          </h1>
          <p style={{ margin: 0, color: '#6B7280', fontSize: '14px' }}>
            Contrôle interne, matrice SoD (Segregation of Duties), détection des conflits toxiques et délégation des pouvoirs.
          </p>
        </div>
        <span style={{ background: '#FEF3C7', color: '#92400E', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 600 }}>
          Contrôle Interne Conforme COSO / SOX
        </span>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Règles SoD Actives</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginTop: '4px' }}>{SOD_RULES_CATALOG.length} Règles</div>
          <div style={{ fontSize: '12px', color: '#059669', marginTop: '2px' }}>Couverture Finance & Achats</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Utilisateurs Audités</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginTop: '4px' }}>{users.length} Profils</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Conflits Détectés</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: users.some((u) => u.status === 'RISK_DETECTED') ? '#DC2626' : '#059669', marginTop: '4px' }}>
            {users.filter((u) => u.status === 'RISK_DETECTED').length} Alerte Critique
          </div>
          <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '2px' }}>Combinaison toxique détectée</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Niveaux de Délégation</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563EB', marginTop: '4px' }}>3 Paliers</div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>5 kDT / 50 kDT / Illimité</div>
        </div>
      </div>

      {/* SoD User Audit Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Matrice d'Audit des Profils Utilisateurs</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#4B5563' }}>
              <th style={{ padding: '10px 16px' }}>Utilisateur</th>
              <th style={{ padding: '10px 16px' }}>Rôle Métier</th>
              <th style={{ padding: '10px 16px' }}>Privilèges & Fonctions Attribuées</th>
              <th style={{ padding: '10px 16px' }}>Diagnostic SoD</th>
              <th style={{ padding: '10px 16px', textAlign: 'center' }}>Action de Remédiation</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{u.name}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>@{u.username}</div>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ background: '#E5E7EB', color: '#374151', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {u.assignedFunctions.map((f) => (
                      <span key={f} style={{ background: '#EEF2FF', color: '#4338CA', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  {u.status === 'RISK_DETECTED' ? (
                    <div>
                      <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        ⛔ CONFLIT TOXIQUE ({u.conflictRules.join(', ')})
                      </span>
                      <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '2px' }}>
                        Peut modifier un RIB et autoriser le virement
                      </div>
                    </div>
                  ) : (
                    <span style={{ background: '#DEF7EC', color: '#03543F', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                      ✅ CONFORME
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  {u.status === 'RISK_DETECTED' ? (
                    <button
                      onClick={() => handleRemediateUser(u.username)}
                      style={{
                        background: '#DC2626',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      🛡️ Retirer le Droit en Conflit
                    </button>
                  ) : (
                    <span style={{ color: '#6B7280', fontSize: '12px' }}>Aucune action requise</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delegation Simulator */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 12px 0' }}>
          ⚖️ Simulateur des Seuils d'Engagement Financier & Délégations de Signature
        </h2>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Montant de la dépense (DT)
            </label>
            <input
              type="number"
              value={testAmount}
              onChange={(e) => setTestAmount(Number(e.target.value))}
              style={{ padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', width: '180px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Rôle du signataire
            </label>
            <select
              value={testRole}
              onChange={(e) => setTestRole(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px' }}
            >
              <option value="OPERATIONAL_MANAGER">Manager Opérationnel N+1</option>
              <option value="FINANCIAL_MANAGER">Directeur Financier (DAF)</option>
              <option value="ADMIN">Direction Générale (DG / Admin)</option>
            </select>
          </div>
          <button
            onClick={handleCheckDelegation}
            style={{
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '9px 18px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Tester l'Autorisation
          </button>
        </div>

        {testResult && (
          <div style={{
            background: testResult.authorized ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${testResult.authorized ? '#10B981' : '#EF4444'}`,
            borderRadius: '8px',
            padding: '16px',
          }}>
            <div style={{ fontWeight: 'bold', color: testResult.authorized ? '#065F46' : '#991B1B', fontSize: '15px' }}>
              {testResult.authorized ? '✅ DÉPENSE AUTORISÉE' : '⛔ REFUS DE DÉLÉGATION'}
            </div>
            <div style={{ fontSize: '13px', color: '#374151', marginTop: '4px' }}>
              <strong>Palier applicable :</strong> {testResult.tier}
            </div>
            <div style={{ fontSize: '13px', color: '#4B5563', marginTop: '2px' }}>
              <strong>Motif du contrôle :</strong> {testResult.msg}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
