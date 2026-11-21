import React, { useEffect, useState } from 'react';
import AdminUsersPanel from './AdminUsersPanel';
import { translateBusinessText, translateModuleLabel, translateRole, useInterfaceLanguage } from './localization';

type UserRole = 'ADMIN' | 'FINANCIAL_MANAGER' | 'ACCOUNTANT' | 'HR_MANAGER' | 'SALES_OFFICER' | 'LOGISTICS_MGR';

interface AccessPolicy {
  module: string;
  allowedRoles: UserRole[];
}

interface AccessPolicySnapshot {
  roles: UserRole[];
  policies: AccessPolicy[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  FINANCIAL_MANAGER: 'Responsable financier',
  ACCOUNTANT: 'Comptabilité',
  HR_MANAGER: 'Responsable RH',
  SALES_OFFICER: 'Commercial',
  LOGISTICS_MGR: 'Responsable logistique',
};
const USER_ROLE_SET: ReadonlySet<string> = new Set(Object.keys(ROLE_LABELS));

const MODULE_LABELS: Record<string, string> = {
  admin: 'Administration et paramètres pays',
  'advanced-finance': 'Analyse financière',
  ai: 'Assistant IA',
  anomalies: 'Anomalies financières',
  bi: 'Business intelligence',
  budget: 'Budgets',
  cashflow: 'Trésorerie et cash-flow',
  consolidation: 'Consolidation',
  intercompany: 'Transactions intercompagnies',
  controlling: 'Contrôle de gestion',
  dashboard: 'Tableau de bord',
  finance: 'Comptabilité et grand livre',
  'fx-rates': 'Cours de change',
  hr: 'Ressources humaines',
  'monthly-close': 'Clôture mensuelle',
  materials: 'Stocks et articles',
  production: 'Production',
  purchases: 'Achats',
  receivables: 'Créances clients',
  sales: 'Ventes',
  taxation: 'Fiscalité',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLE_SET.has(value);
}

function isPolicySnapshot(value: unknown): value is AccessPolicySnapshot {
  return isRecord(value)
    && Array.isArray(value.roles)
    && value.roles.length === Object.keys(ROLE_LABELS).length
    && value.roles.every(isRole)
    && Array.isArray(value.policies)
    && value.policies.every((policy) => isRecord(policy)
      && typeof policy.module === 'string'
      && policy.module.length > 0
      && Array.isArray(policy.allowedRoles)
      && policy.allowedRoles.length > 0
      && policy.allowedRoles.every(isRole));
}

function errorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'Impossible de charger les règles d’accès.';
}

export default function AccessPoliciesPanel({ accessToken, isGroupAdmin = false, scopeEntityId = null }: { accessToken: string | null; isGroupAdmin?: boolean; scopeEntityId?: string | null }) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [snapshot, setSnapshot] = useState<AccessPolicySnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError('');
    if (!accessToken) {
      setLoading(false);
      setError('Session API indisponible. Reconnectez-vous pour consulter les règles d’accès.');
      return () => controller.abort();
    }

    const loadPolicies = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/access-policies', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload));
        if (!isPolicySnapshot(payload)) throw new Error('La réponse des règles d’accès est invalide.');
        if (!controller.signal.aborted) setSnapshot(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error
            ? requestError.message
            : 'Impossible de charger les règles d’accès.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadPolicies();
    return () => controller.abort();
  }, [accessToken]);

  return (
    <section style={{ padding: '24px', color: '#0F172A' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.5rem' }}>{text('Sécurité et rôles d’accès')}</h1>
      <p style={{ margin: '0 0 20px', color: '#475569' }}>
        {text('Gérez les comptes persistés et consultez la matrice des règles d’accès réellement appliquées par l’API SAFE.')}
      </p>
      <AdminUsersPanel accessToken={accessToken} isGroupAdmin={isGroupAdmin} scopeEntityId={scopeEntityId} />
      {loading && <p role="status">{text('Chargement des règles d’accès…')}</p>}
      {error && <p role="alert" style={{ color: '#B91C1C' }}>{text(error)}</p>}
      {snapshot && (
        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px', background: '#FFFFFF' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', color: '#334155' }}>
                <th scope="col" style={{ padding: '12px 14px', minWidth: '220px' }}>{text('Module API')}</th>
                {snapshot.roles.map((role) => (
                  <th scope="col" key={role} style={{ padding: '12px 14px', minWidth: '140px' }}>
                    {translateRole(language, role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.policies.map((policy, index) => (
                <tr key={policy.module} style={{ background: index % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                  <th scope="row" style={{ padding: '10px 14px', fontWeight: 700, borderTop: '1px solid #E2E8F0' }}>
                    {translateModuleLabel(language, policy.module, MODULE_LABELS[policy.module] ?? policy.module)}
                  </th>
                  {snapshot.roles.map((role) => {
                    const allowed = policy.allowedRoles.includes(role);
                    return (
                      <td
                        key={role}
                        aria-label={`${translateRole(language, role)} : ${text(allowed ? 'autorisé' : 'non autorisé')}`}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'center',
                          color: allowed ? '#15803D' : '#64748B',
                          borderTop: '1px solid #E2E8F0',
                        }}
                      >
                        {allowed ? text('Autorisé') : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
