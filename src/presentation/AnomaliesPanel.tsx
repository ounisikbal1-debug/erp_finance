import React, { useEffect, useState } from 'react';
import type { AnomalyReport, AnomalySeverity } from '../application/modules/anomalies/types';
import { translateBusinessText, useInterfaceLanguage } from './localization';

interface AnomaliesPanelProps {
  accessToken: string | null;
}

const severityLabels: Record<AnomalySeverity, string> = {
  CRITICAL: 'Critique',
  HIGH: 'Élevée',
  MEDIUM: 'Moyenne',
};

const severityColors: Record<AnomalySeverity, { foreground: string; background: string }> = {
  CRITICAL: { foreground: '#B91C1C', background: '#FEF2F2' },
  HIGH: { foreground: '#C2410C', background: '#FFF7ED' },
  MEDIUM: { foreground: '#A16207', background: '#FEFCE8' },
};

export default function AnomaliesPanel({ accessToken }: AnomaliesPanelProps) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [report, setReport] = useState<AnomalyReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadReport = async () => {
      setLoading(true);
      setError('');
      setReport(null);
      if (!accessToken) {
        setError('Session API invalide. Déconnectez-vous puis reconnectez-vous.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/anomalies', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(typeof result.error === 'string' ? result.error : 'Le rapport anomalies est indisponible.');
        }
        setReport(result as AnomalyReport);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le rapport anomalies est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadReport();
    return () => controller.abort();
  }, [accessToken, refreshVersion]);

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  };

  return (
    <section aria-labelledby="anomalies-title" style={{ display: 'grid', gap: '14px' }}>
      <header style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div>
          <h2 id="anomalies-title" style={{ margin: 0, color: '#0F172A', fontSize: '1.2rem' }}>
            {text('Anomalies financières')}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
            {text('Contrôles en lecture seule sur les données comptables, ventes et paie de votre entité.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshVersion((version) => version + 1)}
          disabled={loading}
          style={{
            border: '1px solid #CBD5E1',
            borderRadius: '7px',
            background: '#FFFFFF',
            color: '#334155',
            padding: '8px 12px',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? text('Analyse') + '…' : text('Actualiser')}
        </button>
      </header>

      {loading && (
        <div role="status" style={{ ...cardStyle, color: '#475569' }}>
          {text('Vérification des écritures, factures et fiches de paie…')}
        </div>
      )}

      {!loading && error && (
        <div role="alert" style={{ ...cardStyle, color: '#991B1B', borderColor: '#FECACA', background: '#FEF2F2' }}>
          {error}
        </div>
      )}

      {!loading && report && (
        <>
          <div style={{
            ...cardStyle,
            borderColor: report.anomalies.length ? '#FED7AA' : '#BBF7D0',
            background: report.anomalies.length ? '#FFF7ED' : '#F0FDF4',
          }}>
            <div style={{ color: report.anomalies.length ? '#9A3412' : '#166534', fontWeight: 800 }}>
              {report.anomalies.length
                ? <><bdi dir="ltr">{report.anomalies.length}</bdi> {text(report.anomalies.length > 1 ? 'anomalies détectées' : 'anomalie détectée')}</>
                : text('Aucune anomalie détectée dans les contrôles exécutés')}
            </div>
            <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: '5px' }}>
              {text('Entité')} <bdi dir="ltr">{report.entityId}</bdi> · {text('Du')} <bdi dir="ltr">{new Date(report.periodFrom).toLocaleDateString('fr-FR')}</bdi> {text('au')} <bdi dir="ltr">{new Date(report.periodTo).toLocaleDateString('fr-FR')}</bdi> · {text('Rapport du')} <bdi dir="ltr">{new Date(report.generatedAt).toLocaleString('fr-FR')}</bdi>
            </div>
          </div>

          {report.anomalies.length > 0 && (
            <div style={{ display: 'grid', gap: '10px' }}>
              {report.anomalies.map((anomaly) => {
                const colors = severityColors[anomaly.severity];
                return (
                  <article key={anomaly.id} style={{ ...cardStyle, display: 'grid', gap: '7px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <strong style={{ color: '#0F172A', fontSize: '0.9rem' }}>{anomaly.reference}</strong>
                      <span style={{
                        borderRadius: '999px',
                        padding: '3px 9px',
                        background: colors.background,
                        color: colors.foreground,
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                      }}>
                        {text(severityLabels[anomaly.severity])}
                      </span>
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.84rem' }}>{anomaly.reason}</div>
                    <div style={{ color: '#64748B', fontSize: '0.75rem' }}>
                      {anomaly.category}{anomaly.date ? <> · <bdi dir="ltr">{new Date(anomaly.date).toLocaleString('fr-FR')}</bdi></> : ''}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 10px', color: '#0F172A', fontSize: '0.92rem' }}>{text('Contrôles exécutés')}</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '0.82rem', lineHeight: 1.7 }}>
              {report.checkedAreas.map((area) => <li key={area}>{area}</li>)}
            </ul>
          </div>

          <div style={{ ...cardStyle, borderColor: '#FDE68A', background: '#FFFBEB' }}>
            <h3 style={{ margin: '0 0 8px', color: '#854D0E', fontSize: '0.88rem' }}>{text('Contrôles non disponibles — résultat non exhaustif')}</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#713F12', fontSize: '0.8rem', lineHeight: 1.7 }}>
              {report.unavailableChecks.map((check) => <li key={check}>{check}</li>)}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
