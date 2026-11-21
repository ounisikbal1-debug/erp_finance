import React, { useEffect, useState } from 'react';
import {
  tunisianWithholdingRuleCatalog,
  type TunisianWithholdingInput,
} from '../application/modules/taxation/withholding';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface Certificate {
  id: string;
  certificateNumber: string;
  beneficiaryName: string;
  category: string;
  grossAmountTtc: number;
  withholdingRate: number;
  withholdingAmount: number;
  period: string;
  sourceType: string;
  sourceReference: string;
  ruleSource: string;
  ruleSourceDate: string | null;
  ruleEffectiveFrom: string | null;
  status: 'PREPARED' | 'ISSUED' | 'CANCELLED' | 'REVOKED';
  workflowEvents: Array<{ action: string; actorUsername: string; note: string; createdAt: string }>;
}

interface WithholdingCertificateWorkflowProps {
  accessToken: string | null;
  entityId: string | null;
  period: string;
  withholding: TunisianWithholdingInput;
  allowed: boolean;
}

function isCertificate(value: unknown): value is Certificate {
  if (!value || typeof value !== 'object') return false;
  const certificate = value as Partial<Certificate>;
  return typeof certificate.id === 'string'
    && typeof certificate.certificateNumber === 'string'
    && typeof certificate.beneficiaryName === 'string'
    && typeof certificate.category === 'string'
    && typeof certificate.grossAmountTtc === 'number'
    && typeof certificate.withholdingRate === 'number'
    && typeof certificate.withholdingAmount === 'number'
    && typeof certificate.period === 'string'
    && typeof certificate.sourceType === 'string'
    && typeof certificate.sourceReference === 'string'
    && typeof certificate.ruleSource === 'string'
    && (certificate.ruleSourceDate === null || typeof certificate.ruleSourceDate === 'string')
    && (certificate.ruleEffectiveFrom === null || typeof certificate.ruleEffectiveFrom === 'string')
    && ['PREPARED', 'ISSUED', 'CANCELLED', 'REVOKED'].includes(String(certificate.status))
    && Array.isArray(certificate.workflowEvents);
}

function isCertificateList(value: unknown): value is Certificate[] {
  return Array.isArray(value) && value.every(isCertificate);
}

function getErrorMessage(value: unknown): string {
  return value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
    ? value.error
    : 'Impossible de traiter le certificat.';
}

export default function WithholdingCertificateWorkflow({
  accessToken,
  entityId,
  period,
  withholding,
  allowed,
}: WithholdingCertificateWorkflowProps) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [certificateNumber, setCertificateNumber] = useState('');
  const [sourceType, setSourceType] = useState('PURCHASE_INVOICE');
  const [sourceReference, setSourceReference] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryFiscalId, setBeneficiaryFiscalId] = useState('');
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!accessToken || !entityId) {
      setCertificates([]);
      return () => controller.abort();
    }

    void fetch(`/api/taxation/withholding-certificates?period=${encodeURIComponent(period)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    }).then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload));
      if (!isCertificateList(payload)) throw new Error('La réponse des certificats est invalide.');
      setCertificates(payload);
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'Impossible de lire les certificats.');
      }
    });
    return () => controller.abort();
  }, [accessToken, entityId, period]);

  const request = async (url: string, method: 'POST', body: Record<string, unknown>) => {
    if (!accessToken || !entityId) throw new Error('Session API invalide.');
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(getErrorMessage(payload));
    return payload;
  };

  const prepare = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = await request('/api/taxation/withholding-certificates', 'POST', {
        ...withholding,
        certificateNumber,
        sourceType,
        sourceReference,
        ...(sourceType === 'OTHER' ? { beneficiaryName, beneficiaryFiscalId: beneficiaryFiscalId || null } : {}),
      });
      if (!isCertificate(payload)) throw new Error('Le certificat préparé est invalide.');
      setCertificates((current) => [payload, ...current]);
      setCertificateNumber('');
      setSourceReference('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de préparer le certificat.');
    } finally {
      setLoading(false);
    }
  };

  const transition = async (certificate: Certificate, action: 'issue' | 'cancel' | 'revoke') => {
    setError('');
    setLoading(true);
    try {
      const payload = await request(
        `/api/taxation/withholding-certificates/${encodeURIComponent(certificate.id)}/${action}`,
        'POST',
        action === 'issue' ? {} : { reason },
      );
      if (!isCertificate(payload)) throw new Error('La réponse de changement de statut est invalide.');
      setCertificates((current) => current.map((item) => item.id === payload.id ? payload : item));
      setReason('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de modifier le statut du certificat.');
    } finally {
      setLoading(false);
    }
  };

  const controlStyle: React.CSSProperties = {
    display: 'grid',
    gap: 5,
    color: '#334155',
    fontSize: '0.85rem',
    fontWeight: 700,
  };

  return (
    <div style={{ display: 'grid', gap: 12, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
      <div>
        <h4 style={{ margin: 0, color: '#0F172A' }}>{text('Workflow interne de certificats RS')}</h4>
        <p style={{ margin: '6px 0', color: '#64748B', fontSize: '0.82rem' }}>
          {text('L’émission est une trace opérationnelle interne après contrôle humain; elle ne constitue ni une certification réglementaire ni un dépôt fiscal.')}
          {' '}{text('Les bases des factures/paiements SAFE doivent être exactement rapprochées; les cas partiels ou en devise autre que TND sont bloqués.')}
        </p>
      </div>

      {allowed && (
        <form onSubmit={prepare} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <label style={controlStyle}>
            {text('Numéro du certificat')}
            <input value={certificateNumber} onChange={(event) => setCertificateNumber(event.target.value)} maxLength={80} required />
          </label>
          <label style={controlStyle}>
            {text('Source')}
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              <option value="PURCHASE_INVOICE">{text('Facture fournisseur postée')}</option>
              <option value="SUPPLIER_PAYMENT">{text('Paiement fournisseur lié')}</option>
              <option value="OTHER">{text('Autre pièce — saisie manuelle')}</option>
            </select>
          </label>
          <label style={controlStyle}>
            {text('Référence de la source')}
            <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} maxLength={150} required />
          </label>
          {sourceType === 'OTHER' && (
            <>
              <label style={controlStyle}>
                {text('Bénéficiaire')}
                <input value={beneficiaryName} onChange={(event) => setBeneficiaryName(event.target.value)} maxLength={200} required />
              </label>
              <label style={controlStyle}>
                {text('Matricule fiscal — si disponible')}
                <input value={beneficiaryFiscalId} onChange={(event) => setBeneficiaryFiscalId(event.target.value)} maxLength={80} />
              </label>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="submit" disabled={loading} style={{ border: 0, borderRadius: 7, background: loading ? '#94A3B8' : '#0F766E', color: '#FFF', padding: '9px 13px', fontWeight: 700 }}>
              {loading ? text('Enregistrement…') : text('Préparer le certificat')}
            </button>
          </div>
        </form>
      )}

      {certificates.some((certificate) => certificate.status === 'ISSUED' || certificate.status === 'PREPARED') && (
        <label style={controlStyle}>
          {text('Motif obligatoire pour annulation/révocation')}
          <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} />
        </label>
      )}

      {error && <div role="alert" style={{ color: '#991B1B' }}>{error}</div>}
      {certificates.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {certificates.map((certificate) => (
            <article key={certificate.id} style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 10 }}>
              <strong dir="ltr">{certificate.certificateNumber}</strong> — {text(certificate.status)} — {certificate.beneficiaryName}
              <div>{text(tunisianWithholdingRuleCatalog.find((rule) => rule.category === certificate.category)?.label ?? certificate.category)}; {text('brut')} {certificate.grossAmountTtc.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND; RS {certificate.withholdingAmount.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND ({certificate.withholdingRate.toLocaleString(locale)}%); {text('période')} <span dir="ltr">{certificate.period}</span></div>
              <div>{text('Source')} {text(certificate.sourceType)}: <span dir="ltr">{certificate.sourceReference}</span></div>
              <div>{text('Provenance du taux')}: {text(certificate.ruleSource)}; {text('date de source')} {certificate.ruleSourceDate ?? text('non renseignée')}; {text('effet')} {certificate.ruleEffectiveFrom ?? text('non fourni')}.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {allowed && certificate.status === 'PREPARED' && (
                  <>
                    <button type="button" disabled={loading} onClick={() => void transition(certificate, 'issue')}>{text('Émettre en interne')}</button>
                    <button type="button" disabled={loading || reason.trim().length < 10} onClick={() => void transition(certificate, 'cancel')}>{text('Annuler')}</button>
                  </>
                )}
                {allowed && certificate.status === 'ISSUED' && (
                  <button type="button" disabled={loading || reason.trim().length < 10} onClick={() => void transition(certificate, 'revoke')}>{text('Révoquer')}</button>
                )}
              </div>
              <details style={{ marginTop: 6 }}>
                <summary>{text('Historique d’audit')} ({certificate.workflowEvents.length})</summary>
                {certificate.workflowEvents.map((event, index) => (
                  <div key={`${event.action}-${index}`}>{new Date(event.createdAt).toLocaleString(locale)} — {text(event.action)} {text('par')} <span dir="ltr">{event.actorUsername}</span>: {text(event.note)}</div>
                ))}
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
