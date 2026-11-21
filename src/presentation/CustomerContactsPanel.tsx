import React, { useEffect, useState } from 'react';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface CustomerContact {
  id: string;
  code: string;
  name: string;
  fiscalId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface ContactChange {
  id: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  actorUsername: string;
  createdAt: string;
}

interface CustomerScore {
  score: number;
  alertThreshold: number;
  alertTriggered: boolean;
  configurationVersion: number;
  calculatedAt: string;
  isCurrent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCustomerList(value: unknown): value is CustomerContact[] {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.code === 'string'
    && typeof item.name === 'string'
    && ['fiscalId', 'email', 'phone', 'address'].every((field) => (
      item[field] === null || typeof item[field] === 'string'
    )));
}

function isContactHistory(value: unknown): value is ContactChange[] {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.field === 'string'
    && typeof item.actorUsername === 'string'
    && typeof item.createdAt === 'string'
    && (item.previousValue === null || typeof item.previousValue === 'string')
    && (item.newValue === null || typeof item.newValue === 'string'));
}

function isCustomerScore(value: unknown): value is CustomerScore | null {
  return value === null || (isRecord(value)
    && typeof value.score === 'number'
    && Number.isFinite(value.score)
    && typeof value.alertThreshold === 'number'
    && Number.isFinite(value.alertThreshold)
    && typeof value.alertTriggered === 'boolean'
    && typeof value.configurationVersion === 'number'
    && Number.isInteger(value.configurationVersion)
    && typeof value.calculatedAt === 'string'
    && typeof value.isCurrent === 'boolean');
}

function getErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === 'string' ? value.error : fallback;
}

const CONTACT_FIELDS = [
  { key: 'fiscalId', label: 'Matricule fiscal' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Téléphone' },
  { key: 'address', label: 'Adresse' },
] as const;
type ContactField = (typeof CONTACT_FIELDS)[number]['key'];
type ContactForm = Record<ContactField, string>;

const EMPTY_FORM: ContactForm = { fiscalId: '', email: '', phone: '', address: '' };

export default function CustomerContactsPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [customers, setCustomers] = useState<CustomerContact[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [history, setHistory] = useState<ContactChange[]>([]);
  const [customerScore, setCustomerScore] = useState<CustomerScore | null>(null);
  const [scoreError, setScoreError] = useState('');
  const [scoreLoading, setScoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    if (!accessToken || !entityId) {
      setCustomers([]);
      setCustomerId('');
      setHistory([]);
      setError(!accessToken ? 'Session API indisponible.' : 'Aucune société authentifiée.');
      return () => controller.abort();
    }

    const loadCustomers = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/sales/customers', {
          headers: { Authorization: 'Bearer ' + accessToken },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(getErrorMessage(payload, 'Impossible de charger les clients.'));
        if (!isCustomerList(payload)) throw new Error('La liste des clients est invalide.');
        if (!controller.signal.aborted) {
          setCustomers(payload);
          setCustomerId((current) => payload.some((customer) => customer.id === current)
            ? current
            : payload[0]?.id ?? '');
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Impossible de charger les clients.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadCustomers();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory([]);
    if (!accessToken || !entityId || !customerId) return () => controller.abort();
    const loadHistory = async () => {
      try {
        const response = await fetch(`/api/sales/customers/${encodeURIComponent(customerId)}/contact-history`, {
          headers: { Authorization: 'Bearer ' + accessToken },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(getErrorMessage(payload, 'Impossible de charger l’historique.'));
        if (!isContactHistory(payload)) throw new Error('L’historique des coordonnées est invalide.');
        if (!controller.signal.aborted) setHistory(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Impossible de charger l’historique.');
        }
      }
    };
    void loadHistory();
    return () => controller.abort();
  }, [accessToken, entityId, customerId, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setCustomerScore(null);
    setScoreError('');
    if (!accessToken || !entityId || !customerId) {
      setScoreLoading(false);
      return () => controller.abort();
    }
    const loadScore = async () => {
      setScoreLoading(true);
      try {
        const response = await fetch(`/api/sales/customers/${encodeURIComponent(customerId)}/score`, {
          headers: { Authorization: 'Bearer ' + accessToken },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(getErrorMessage(payload, 'Impossible de charger le score client.'));
        if (!isCustomerScore(payload)) throw new Error('Le score client reçu est invalide.');
        if (!controller.signal.aborted) setCustomerScore(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setScoreError(requestError instanceof Error ? requestError.message : 'Impossible de charger le score client.');
        }
      } finally {
        if (!controller.signal.aborted) setScoreLoading(false);
      }
    };
    void loadScore();
    return () => controller.abort();
  }, [accessToken, entityId, customerId, refreshVersion]);

  useEffect(() => {
    setForm({
      fiscalId: selectedCustomer?.fiscalId ?? '',
      email: selectedCustomer?.email ?? '',
      phone: selectedCustomer?.phone ?? '',
      address: selectedCustomer?.address ?? '',
    });
  }, [customerId, selectedCustomer?.fiscalId, selectedCustomer?.email, selectedCustomer?.phone, selectedCustomer?.address]);

  const saveContacts = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !entityId || !selectedCustomer) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/sales/customers/${encodeURIComponent(selectedCustomer.id)}/contacts`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, ...form }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, 'Les coordonnées n’ont pas été enregistrées.'));
      if (!isRecord(payload) || typeof payload.id !== 'string') throw new Error('La réponse client est invalide.');
      setNotice('Coordonnées enregistrées; les champs modifiés sont consignés dans l’historique.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Les coordonnées n’ont pas été enregistrées.');
    } finally {
      setSaving(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };

  return (
    <section aria-labelledby="customer-contacts-title" style={{ display: 'grid', gap: 12 }}>
      <header style={cardStyle}>
        <h2 id="customer-contacts-title" style={{ margin: 0 }}>{text('Fiche clients — coordonnées et historique')}</h2>
        <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
          {text('Les coordonnées sont modifiables pour les clients de votre société. Chaque changement effectif est tracé avec l’utilisateur et l’horodatage.')}
        </p>
      </header>
      {!loading && customers.length === 0 && !error && (
        <div role="status" style={cardStyle}>{text('Aucun client n’est enregistré pour cette société.')}</div>
      )}
      {error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2' }}>{text(error)}</div>}
      {notice && <div role="status" style={{ ...cardStyle, color: '#166534', background: '#F0FDF4' }}>{text(notice)}</div>}
      {customers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <form onSubmit={saveContacts} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4, fontWeight: 700 }}>
              {text('Client')}
              <select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setNotice(''); }}
                style={{ padding: 8, border: '1px solid #CBD5E1', borderRadius: 6 }}>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>
                ))}
              </select>
            </label>
            {CONTACT_FIELDS.map(({ key, label }) => (
              <label key={key} style={{ display: 'grid', gap: 4, fontWeight: 700 }}>
                {text(label)}
                <input
                  maxLength={key === 'email' ? 254 : key === 'address' ? 500 : key === 'fiscalId' ? 50 : 40}
                  type={key === 'email' ? 'email' : 'text'}
                  dir={key === 'email' || key === 'fiscalId' || key === 'phone' ? 'ltr' : undefined}
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  style={{ padding: 8, border: '1px solid #CBD5E1', borderRadius: 6 }}
                />
              </label>
            ))}
            <section aria-label={text('Score de confiance du client')} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
              <h3 style={{ margin: '0 0 6px' }}>{text('Score client')}</h3>
              {scoreLoading ? <p style={{ margin: 0 }}>{text('Chargement du dernier score…')}</p>
                : scoreError ? <p role="alert" style={{ margin: 0, color: '#991B1B' }}>{text(scoreError)}</p>
                  : customerScore ? (
                    <>
                      <p style={{ margin: '0 0 4px', fontWeight: 700 }}>
                        {customerScore.score.toLocaleString(getHtmlLanguage(language), { maximumFractionDigits: 1 })} / 100
                        {customerScore.alertTriggered ? ` — ${text('seuil d’alerte déclenché')}` : ''}
                      </p>
                      <small>
                        {text(customerScore.isCurrent ? 'Configuration confirmée' : 'Score historique — configuration non active ou modifiée')}
                        {' · v'}{customerScore.configurationVersion}
                        {' · '}{new Date(customerScore.calculatedAt).toLocaleString(getHtmlLanguage(language))}
                      </small>
                    </>
                  ) : <p style={{ margin: 0 }}>{text('Aucun score calculé avec une configuration confirmée.')}</p>}
            </section>
            <button type="submit" disabled={saving || !selectedCustomer}
              style={{ justifySelf: 'start', border: 0, borderRadius: 6, background: '#2563EB', color: '#FFFFFF', padding: '9px 13px', fontWeight: 700 }}>
              {saving ? text('Enregistrement…') : text('Enregistrer les coordonnées')}
            </button>
          </form>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{text('Historique des coordonnées')}</h3>
            {history.length === 0
              ? <p>{text('Aucun changement de coordonnées enregistré.')}</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: 13 }}>
                <thead><tr><th>{text('Champ')}</th><th>{text('Ancienne valeur')}</th><th>{text('Nouvelle valeur')}</th><th>{text('Par')}</th><th>{text('Le')}</th></tr></thead>
                <tbody>{history.map((change) => (
                  <tr key={change.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td>{text(CONTACT_FIELDS.find((field) => field.key === change.field)?.label ?? change.field)}</td>
                    <td>{change.previousValue ?? '—'}</td>
                    <td>{change.newValue ?? '—'}</td>
                    <td>{change.actorUsername}</td>
                    <td>{new Date(change.createdAt).toLocaleString(getHtmlLanguage(language))}</td>
                  </tr>
                ))}</tbody>
              </table>}
          </div>
        </div>
      )}
    </section>
  );
}
