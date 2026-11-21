import React, { useEffect, useState } from 'react';
import OfflineDraftQueuePanel from './OfflineDraftQueuePanel';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';
import {
  buildWorkbookArabicTemplatePreview,
  buildWorkbookTaxFormPreview,
} from '../application/modules/admin/workbook-template-preview';
import {
  buildWorkbookConnectorRequestPreview,
  buildWorkbookConnectorResponsePreview,
} from '../application/modules/admin/workbook-connector-adapter';
import { isWorkbookConnectorFeatureKey } from '../application/modules/admin/workbook-connector-config';

interface WorkbookFeature {
  key: string;
  label: string;
  group: string;
  configuration: Record<string, unknown>;
  enabled: boolean;
  effectiveEnabled: boolean;
  runtimeAvailability: 'CONFIGURATION_ONLY' | 'CONFIGURED_ENGINE';
  activationAvailable: boolean;
  configurationStatus: 'NOT_CONFIGURED' | 'DRAFT' | 'CONFIRMED_DISABLED';
  sourceReference: string | null;
  confirmationNote: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  version: number;
  connectionStatus?: 'NOT_CONNECTED' | null;
}

interface ConnectorCredentialStatus {
  featureKey: string;
  credentialsConfigured: boolean;
  credentialFieldNames: string[];
  credentialUpdatedAt: string | null;
  connectionStatus: 'NOT_CONNECTED';
  testStatus: 'BLOCKED';
  networkRequestMade: false;
  connectionTestBlocker: string;
}

interface PartnerDispute {
  id: string;
  reference: string | null;
  note: string;
  status: string;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

interface WorkbookRevision {
  version: number;
  configurationJson: string;
  createdAt: string;
  actorUsername: string;
  enabled: boolean;
}

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `La requête a échoué (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

function isFeatureList(value: unknown): value is WorkbookFeature[] {
  return Array.isArray(value) && value.every((feature) => (
    feature !== null
    && typeof feature === 'object'
    && 'key' in feature
    && typeof feature.key === 'string'
    && 'configuration' in feature
    && typeof feature.configuration === 'object'
    && feature.configuration !== null
  ));
}

function isPartnerDisputeList(value: unknown): value is PartnerDispute[] {
  return Array.isArray(value) && value.every((dispute) => (
    dispute !== null
    && typeof dispute === 'object'
    && 'id' in dispute
    && typeof dispute.id === 'string'
    && 'note' in dispute
    && typeof dispute.note === 'string'
    && 'status' in dispute
    && typeof dispute.status === 'string'
  ));
}

function isWorkbookRevisionList(value: unknown): value is WorkbookRevision[] {
  return Array.isArray(value) && value.every((revision) => (
    revision !== null
    && typeof revision === 'object'
    && 'version' in revision
    && typeof revision.version === 'number'
    && 'configurationJson' in revision
    && typeof revision.configurationJson === 'string'
    && 'createdAt' in revision
    && typeof revision.createdAt === 'string'
    && 'actorUsername' in revision
    && typeof revision.actorUsername === 'string'
    && 'enabled' in revision
    && typeof revision.enabled === 'boolean'
  ));
}

function displayPreviewValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? '—';
}

export default function WorkbookReadinessPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [features, setFeatures] = useState<WorkbookFeature[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [configurationText, setConfigurationText] = useState('{}');
  const [sourceReference, setSourceReference] = useState('');
  const [confirmationNote, setConfirmationNote] = useState('');
  const [confirmConfiguration, setConfirmConfiguration] = useState(false);
  const [enableFeature, setEnableFeature] = useState(false);
  const [scoreSubjectType, setScoreSubjectType] = useState<'CUSTOMER' | 'SUPPLIER' | 'HEALTH'>('CUSTOMER');
  const [scorePartnerId, setScorePartnerId] = useState('');
  const [healthMetricsText, setHealthMetricsText] = useState('{}');
  const [healthSourceReference, setHealthSourceReference] = useState('');
  const [disputePartnerType, setDisputePartnerType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [disputePartnerId, setDisputePartnerId] = useState('');
  const [disputeReference, setDisputeReference] = useState('');
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeResolutionNote, setDisputeResolutionNote] = useState('');
  const [disputes, setDisputes] = useState<PartnerDispute[]>([]);
  const [revisions, setRevisions] = useState<WorkbookRevision[]>([]);
  const [draftValidation, setDraftValidation] = useState<Record<string, unknown> | null>(null);
  const [samplePayloadText, setSamplePayloadText] = useState('{}');
  const [sandboxPreview, setSandboxPreview] = useState<unknown>(null);
  const [connectorCredentialStatus, setConnectorCredentialStatus] = useState<ConnectorCredentialStatus | null>(null);
  const [connectorFieldName, setConnectorFieldName] = useState('');
  const [connectorSecretValue, setConnectorSecretValue] = useState('');
  const [connectorTestStatus, setConnectorTestStatus] = useState<ConnectorCredentialStatus | null>(null);
  const [scoreResult, setScoreResult] = useState<{
    score: number;
    alertTriggered: boolean;
    alertThreshold: number;
    calculatedAt: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!accessToken || !entityId) {
      setFeatures([]);
      setError('Une session administrateur et une entité sont nécessaires.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/workbook-features/${encodeURIComponent(entityId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await readJson(response);
      if (!isFeatureList(payload)) throw new Error('La liste de configurations reçue est invalide.');
      setFeatures(payload);
      setSelectedKey((previous) => payload.some((feature) => feature.key === previous)
        ? previous
        : payload[0]?.key ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger le registre de préparation.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, entityId]);

  const selected = features.find((feature) => feature.key === selectedKey) ?? null;

  useEffect(() => {
    setConfigurationText(selected ? JSON.stringify(selected.configuration, null, 2) : '{}');
    setSourceReference(selected?.sourceReference ?? '');
    setConfirmationNote(selected?.confirmationNote ?? '');
    setConfirmConfiguration(false);
    setEnableFeature(selected?.enabled ?? false);
    setScoreResult(null);
    setDraftValidation(null);
    setSandboxPreview(null);
    setConnectorCredentialStatus(null);
    setConnectorTestStatus(null);
    setConnectorFieldName('');
    setConnectorSecretValue('');
  }, [selectedKey, selected?.version, selected?.key]);

  useEffect(() => {
    if (!accessToken || !entityId || !selected || !isWorkbookConnectorFeatureKey(selected.key)) {
      setConnectorCredentialStatus(null);
      return;
    }
    let active = true;
    void fetch(
      `/api/admin/workbook-features/${encodeURIComponent(entityId)}/${encodeURIComponent(selected.key)}/credentials`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
    )
      .then(readJson)
      .then((payload) => {
        if (!active) return;
        if (!payload || typeof payload !== 'object'
          || !('credentialsConfigured' in payload) || typeof payload.credentialsConfigured !== 'boolean'
          || !('credentialFieldNames' in payload) || !Array.isArray(payload.credentialFieldNames)
          || !('connectionStatus' in payload) || payload.connectionStatus !== 'NOT_CONNECTED'
          || !('connectionTestBlocker' in payload) || typeof payload.connectionTestBlocker !== 'string') {
          throw new Error('Le statut des identifiants reçu est invalide.');
        }
        setConnectorCredentialStatus(payload as ConnectorCredentialStatus);
      })
      .catch((statusError: unknown) => {
        if (active) setError(statusError instanceof Error ? statusError.message : 'Impossible de charger le statut des identifiants.');
      });
    return () => { active = false; };
  }, [accessToken, entityId, selected?.key]);

  useEffect(() => {
    if (!accessToken || !entityId || !selectedKey) {
      setRevisions([]);
      return;
    }
    let active = true;
    void fetch(
      `/api/admin/workbook-features/${encodeURIComponent(entityId)}/${encodeURIComponent(selectedKey)}/revisions`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
      .then(readJson)
      .then((payload) => {
        if (!active) return;
      if (!isWorkbookRevisionList(payload)) throw new Error('L’historique de configuration reçu est invalide.');
      setRevisions(payload);
      })
      .catch((revisionError: unknown) => {
        if (active) {
          setRevisions([]);
          setError(revisionError instanceof Error
            ? revisionError.message
            : 'Impossible de charger l’historique de configuration.');
        }
      });
    return () => { active = false; };
  }, [accessToken, entityId, selectedKey, selected?.version]);

  const validateDraft = async () => {
    if (!accessToken || !entityId || !selected) return;
    let configuration: unknown;
    try {
      configuration = JSON.parse(configurationText);
    } catch {
      setError('Le JSON de configuration est invalide.');
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/admin/workbook-features/${encodeURIComponent(entityId)}/${encodeURIComponent(selected.key)}/validate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ configuration }),
        },
      );
      const result = await readJson(response);
      if (!result || typeof result !== 'object') throw new Error('Le résultat de validation est invalide.');
      setDraftValidation(result as Record<string, unknown>);
      setMessage('Configuration valide en mode brouillon; aucune activation ni connexion n’a eu lieu.');
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'La configuration n’a pas pu être validée.');
    } finally {
      setIsSaving(false);
    }
  };

  const previewConnector = (direction: 'request' | 'response') => {
    try {
      if (!selected) return;
      const configuration: unknown = JSON.parse(configurationText);
      const sample: unknown = JSON.parse(samplePayloadText);
      setSandboxPreview(direction === 'request'
        ? buildWorkbookConnectorRequestPreview(configuration, sample)
        : buildWorkbookConnectorResponsePreview(configuration, sample));
      setError('');
    } catch (previewError) {
      setSandboxPreview(null);
      setError(previewError instanceof Error ? previewError.message : 'Impossible de générer l’aperçu sandbox.');
    }
  };

  const saveConnectorCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || !selected || !isWorkbookConnectorFeatureKey(selected.key)) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/admin/workbook-features/${encodeURIComponent(entityId)}/${encodeURIComponent(selected.key)}/credentials`,
        {
          method: 'PUT',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fieldName: connectorFieldName, value: connectorSecretValue }),
        },
      );
      const payload = await readJson(response);
      if (!payload || typeof payload !== 'object'
        || !('credentialsConfigured' in payload) || typeof payload.credentialsConfigured !== 'boolean'
        || !('credentialFieldNames' in payload) || !Array.isArray(payload.credentialFieldNames)
        || !('connectionStatus' in payload) || payload.connectionStatus !== 'NOT_CONNECTED') {
        throw new Error('La réponse du coffre d’identifiants est invalide.');
      }
      setConnectorCredentialStatus(payload as ConnectorCredentialStatus);
      setConnectorFieldName('');
      setConnectorSecretValue('');
      setConnectorTestStatus(null);
      setMessage('Identifiant chiffré et enregistré. La connexion externe reste non testée et désactivée.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer cet identifiant.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteConnectorCredentials = async () => {
    if (!accessToken || !entityId || !selected || !isWorkbookConnectorFeatureKey(selected.key)) return;
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/workbook-features/${encodeURIComponent(entityId)}/${encodeURIComponent(selected.key)}/credentials`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
      );
      const payload = await readJson(response);
      if (!payload || typeof payload !== 'object'
        || !('credentialsConfigured' in payload) || payload.credentialsConfigured !== false
        || !('connectionStatus' in payload) || payload.connectionStatus !== 'NOT_CONNECTED') {
        throw new Error('La réponse du coffre d’identifiants est invalide.');
      }
      setConnectorCredentialStatus(payload as ConnectorCredentialStatus);
      setConnectorTestStatus(null);
      setMessage('Les identifiants chiffrés du profil ont été supprimés.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer les identifiants.');
    } finally {
      setIsSaving(false);
    }
  };

  const checkConnectorPrerequisites = async () => {
    if (!accessToken || !entityId || !selected || !isWorkbookConnectorFeatureKey(selected.key)) return;
    setIsSaving(true);
    setError('');
    setConnectorTestStatus(null);
    try {
      const response = await fetch(
        `/api/admin/workbook-features/${encodeURIComponent(entityId)}/${encodeURIComponent(selected.key)}/test-connection`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const payload = await readJson(response);
      if (!payload || typeof payload !== 'object'
        || !('testStatus' in payload) || payload.testStatus !== 'BLOCKED'
        || !('networkRequestMade' in payload) || payload.networkRequestMade !== false
        || !('connectionTestBlocker' in payload) || typeof payload.connectionTestBlocker !== 'string') {
        throw new Error('La réponse de vérification du connecteur est invalide.');
      }
      setConnectorTestStatus(payload as ConnectorCredentialStatus);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Impossible de vérifier les prérequis du connecteur.');
    } finally {
      setIsSaving(false);
    }
  };

  const previewTemplate = () => {
    try {
      if (!selected) return;
      const configuration: unknown = JSON.parse(configurationText);
      const sample: unknown = JSON.parse(samplePayloadText);
      if (selected.key === 'arabic-pdf-templates') {
        setSandboxPreview(buildWorkbookArabicTemplatePreview(configuration, sample));
      } else {
        if (!configuration || typeof configuration !== 'object' || !('templates' in configuration)
          || !Array.isArray(configuration.templates) || configuration.templates.length === 0) {
          throw new Error('Configurez au moins un type de formulaire fiscal.');
        }
        const documentType = configuration.templates[0]?.documentType;
        setSandboxPreview(buildWorkbookTaxFormPreview(documentType, configuration, sample));
      }
      setError('');
    } catch (previewError) {
      setSandboxPreview(null);
      setError(previewError instanceof Error ? previewError.message : 'Impossible de générer l’aperçu local.');
    }
  };

  const importConfiguration = async (file?: File) => {
    if (!file || !selected) return;
    try {
      const imported: unknown = JSON.parse(await file.text());
      let configuration = imported;
      if (imported && typeof imported === 'object' && !Array.isArray(imported)
        && 'featureKey' in imported) {
        if (imported.featureKey !== selected.key) {
          throw new Error('Le fichier appartient à une autre fonctionnalité.');
        }
        if (!('configuration' in imported)) throw new Error('Le fichier exporté est incomplet.');
        configuration = imported.configuration;
      }
      setConfigurationText(JSON.stringify(configuration, null, 2));
      setConfirmConfiguration(false);
      setEnableFeature(false);
      setDraftValidation(null);
      setSandboxPreview(null);
      setMessage('Fichier importé dans le brouillon local; aucune donnée n’a été enregistrée ou activée.');
      setError('');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Impossible d’importer ce fichier JSON.');
    }
  };

  const exportConfiguration = () => {
    if (!selected) return;
    try {
      const configuration: unknown = JSON.parse(configurationText);
      const blob = new Blob([JSON.stringify({
        featureKey: selected.key,
        version: selected.version + 1,
        sourceReference: sourceReference || null,
        configuration,
      }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selected.key}-draft.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Brouillon exporté localement; il n’a pas été activé.');
      setError('');
    } catch {
      setError('Le JSON de configuration est invalide et ne peut pas être exporté.');
    }
  };

  const save = async () => {
    if (!accessToken || !entityId || !selected) return;
    let configuration: unknown;
    try {
      configuration = JSON.parse(configurationText);
    } catch {
      setError('Le JSON de configuration est invalide.');
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/admin/workbook-features/${encodeURIComponent(entityId)}/${encodeURIComponent(selected.key)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            configuration,
            sourceReference: sourceReference || null,
            confirmationNote: confirmationNote || null,
            confirmConfiguration,
            enabled: enableFeature,
          }),
        },
      );
      await readJson(response);
      setMessage(enableFeature
        ? 'Configuration revue et activation du score enregistrées.'
        : confirmConfiguration
          ? 'Configuration revue et enregistrée. Son exécution reste désactivée.'
          : 'Brouillon de configuration enregistré; son exécution reste désactivée.');
      setConfirmConfiguration(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer la configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const calculateScore = async () => {
    if (!accessToken || !entityId || !selected) return;
    const subjectType = selected.key === 'financial-health-score' ? 'HEALTH' : scoreSubjectType;
    const partnerId = subjectType === 'HEALTH' ? entityId : scorePartnerId.trim();
    if (!partnerId) {
      setError('Renseignez l’identifiant du client ou fournisseur.');
      return;
    }
    if (subjectType === 'HEALTH' && !healthSourceReference.trim()) {
      setError('Renseignez la référence de la source des mesures de santé financière.');
      return;
    }
    let healthMetrics: unknown;
    if (subjectType === 'HEALTH') {
      try {
        healthMetrics = JSON.parse(healthMetricsText);
      } catch {
        setError('Les mesures du score de santé ne sont pas un JSON valide.');
        return;
      }
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/workbook-features/${encodeURIComponent(entityId)}/scores`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectType,
          partnerId,
          ...(subjectType === 'HEALTH' ? {
            metrics: healthMetrics,
            sourceReference: healthSourceReference.trim(),
          } : {}),
        }),
      });
      const payload = await readJson(response);
      if (!payload || typeof payload !== 'object' || !('score' in payload)
        || typeof payload.score !== 'number' || !('alertTriggered' in payload)
        || typeof payload.alertTriggered !== 'boolean' || !('alertThreshold' in payload)
        || typeof payload.alertThreshold !== 'number' || !('calculatedAt' in payload)
        || typeof payload.calculatedAt !== 'string') {
        throw new Error('Le résultat du score reçu est invalide.');
      }
      setScoreResult({
        score: payload.score,
        alertTriggered: payload.alertTriggered,
        alertThreshold: payload.alertThreshold,
        calculatedAt: payload.calculatedAt,
      });
      setMessage(subjectType === 'HEALTH'
        ? 'Score calculé et historisé à partir des mesures manuelles. Vérifiez-les avant toute décision.'
        : 'Score calculé et historisé depuis l’historique des règlements, litiges et expositions.');
    } catch (scoreError) {
      setError(scoreError instanceof Error ? scoreError.message : 'Impossible de calculer le score.');
    } finally {
      setIsSaving(false);
    }
  };

  const loadDisputes = async () => {
    if (!accessToken || !entityId || !disputePartnerId.trim()) {
      setError('Renseignez le code ou l’identifiant du partenaire pour charger ses litiges.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/workbook-features/${encodeURIComponent(entityId)}/disputes/${disputePartnerType}/${encodeURIComponent(disputePartnerId.trim())}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const payload = await readJson(response);
      if (!isPartnerDisputeList(payload)) throw new Error('La liste des litiges reçue est invalide.');
      setDisputes(payload);
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : 'Impossible de charger les litiges.');
    } finally {
      setIsSaving(false);
    }
  };

  const recordDispute = async () => {
    if (!accessToken || !entityId || !disputePartnerId.trim()) {
      setError('Renseignez le code ou l’identifiant du partenaire.');
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/workbook-features/${encodeURIComponent(entityId)}/disputes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partnerType: disputePartnerType,
          partnerId: disputePartnerId.trim(),
          reference: disputeReference || null,
          note: disputeNote,
        }),
      });
      await readJson(response);
      setDisputeNote('');
      setMessage('Litige enregistré; il sera pris en compte dans le prochain calcul.');
      await loadDisputes();
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : 'Impossible d’enregistrer le litige.');
    } finally {
      setIsSaving(false);
    }
  };

  const closeDispute = async (disputeId: string) => {
    if (!accessToken || !entityId || !disputeResolutionNote.trim()) {
      setError('Une note de clôture est requise.');
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/admin/workbook-features/${encodeURIComponent(entityId)}/disputes/${encodeURIComponent(disputeId)}/status`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'RESOLVED', resolutionNote: disputeResolutionNote }),
        },
      );
      await readJson(response);
      setDisputeResolutionNote('');
      setMessage('Litige clôturé avec sa note de résolution.');
      await loadDisputes();
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : 'Impossible de clôturer le litige.');
    } finally {
      setIsSaving(false);
    }
  };

  const statusLabel = selected?.effectiveEnabled
    ? text('Actif après revue administrateur')
    : selected?.configurationStatus === 'CONFIRMED_DISABLED'
    ? `${text('Revue par')} ${selected.confirmedBy ?? text('administrateur')} — ${text('exécution désactivée')}`
    : selected?.configurationStatus === 'DRAFT'
      ? text('Brouillon — exécution désactivée')
      : text('Non configurée — exécution désactivée');

  return (
    <section style={{ background: '#FFFFFF', color: '#0F172A', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{text('Préparation des fonctionnalités du classeur')}</h2>
      <p style={{ margin: '0 0 20px', color: '#475569', lineHeight: 1.5 }}>
        {text('Les paramètres sont enregistrés par entité. Les capacités non validées restent désactivées, même après revue. N’enregistrez aucun mot de passe, jeton, clé API ou donnée financière réelle dans ces configurations.')}
      </p>

      {error && <p role="alert" style={{ color: '#B91C1C' }}>{text(error)}</p>}
      {message && <p role="status" style={{ color: '#047857' }}>{text(message)}</p>}
      {!accessToken || !entityId ? (
        <p>{text('Cette vue requiert une session administrateur reliée à une entité.')}</p>
      ) : isLoading && features.length === 0 ? (
        <p>{text('Chargement…')}</p>
      ) : (
        <>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: 8 }} htmlFor="workbook-feature">
            {text('Fonctionnalité')}
          </label>
          <select
            id="workbook-feature"
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            style={{ width: '100%', maxWidth: 620, padding: 10, marginBottom: 12 }}
          >
            {features.map((feature) => (
              <option key={feature.key} value={feature.key}>{text(feature.group)} — {text(feature.label)}</option>
            ))}
          </select>

          {selected && (
            <>
              <p style={{ color: '#92400E', fontWeight: 700 }} role="status">{statusLabel}</p>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 8 }} htmlFor="workbook-feature-json">
                {text('Configuration brouillon (JSON)')}
              </label>
              <textarea
                id="workbook-feature-json"
                value={configurationText}
                onChange={(event) => setConfigurationText(event.target.value)}
                rows={12}
                spellCheck={false}
                style={{ boxSizing: 'border-box', width: '100%', fontFamily: 'monospace', padding: 12, border: '1px solid #CBD5E1', borderRadius: 6 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 16px' }}>
                <button type="button" disabled={isSaving} onClick={() => void validateDraft()}>
                  {text('Valider sans enregistrer')}
                </button>
                <label style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' }}>
                  {text('Importer JSON (brouillon)')}
                  <input
                    type="file"
                    accept="application/json,.json"
                    aria-label={text('Importer une configuration JSON')}
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      void importConfiguration(event.target.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <button type="button" onClick={exportConfiguration}>{text('Exporter JSON')}</button>
              </div>
              {draftValidation && (
                <div role="status" style={{ background: '#F0FDF4', border: '1px solid #86EFAC', padding: 12, marginBottom: 16 }}>
                  <strong>{text('Valide — aucune activation effectuée.')}</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {JSON.stringify(draftValidation, null, 2)}
                  </pre>
                </div>
              )}
              {isWorkbookConnectorFeatureKey(selected.key) && (
                <section aria-label={text('Identifiants du connecteur')} style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 8px' }}>{text('Identifiants du connecteur')}</h3>
                  <p style={{ color: '#475569', lineHeight: 1.5 }}>
                    {text('Les valeurs sont chiffrées côté serveur AES-256-GCM et ne sont jamais relues dans l’interface. Configurez SAFE_ERP_CONNECTOR_ENCRYPTION_KEY côté serveur avant l’enregistrement. Ne saisissez que des identifiants de test autorisés.')}
                  </p>
                  <p role="status">
                    {text('État de connexion')}: <strong>{text('Non connecté')}</strong>
                  </p>
                  {connectorCredentialStatus?.credentialsConfigured ? (
                    <p>{text('Champs enregistrés')}: {connectorCredentialStatus.credentialFieldNames.join(', ')} — {text('valeurs masquées')}</p>
                  ) : (
                    <p>{text('Aucun identifiant enregistré.')}</p>
                  )}
                  <form onSubmit={(event) => void saveConnectorCredential(event)} style={{ display: 'grid', gap: 8, maxWidth: 620 }}>
                    <label htmlFor="connector-field-name">{text('Nom du champ identifiant')}</label>
                    <input
                      id="connector-field-name"
                      autoComplete="off"
                      maxLength={64}
                      value={connectorFieldName}
                      onChange={(event) => setConnectorFieldName(event.target.value)}
                    />
                    <label htmlFor="connector-secret-value">{text('Valeur secrète')}</label>
                    <input
                      id="connector-secret-value"
                      type="password"
                      autoComplete="new-password"
                      maxLength={8192}
                      value={connectorSecretValue}
                      onChange={(event) => setConnectorSecretValue(event.target.value)}
                    />
                    <button type="submit" disabled={isSaving || !connectorFieldName || !connectorSecretValue}>
                      {text('Enregistrer ou remplacer le champ chiffré')}
                    </button>
                  </form>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <button type="button" disabled={isSaving} onClick={() => void checkConnectorPrerequisites()}>
                      {text('Vérifier les prérequis (aucun appel externe)')}
                    </button>
                    <button type="button" disabled={isSaving || !connectorCredentialStatus?.credentialsConfigured} onClick={() => void deleteConnectorCredentials()}>
                      {text('Supprimer tous les identifiants')}
                    </button>
                  </div>
                  {connectorTestStatus && (
                    <p role="alert" style={{ color: '#92400E', fontWeight: 700 }}>
                      {text('Test bloqué; aucune connexion réseau tentée.')}: {text(connectorTestStatus.connectionTestBlocker)}
                    </p>
                  )}
                </section>
              )}
              <label style={{ display: 'block', fontWeight: 700, margin: '14px 0 6px' }} htmlFor="workbook-feature-source">
                {text('Source/version de référence (facultatif)')}
              </label>
              <input
                id="workbook-feature-source"
                value={sourceReference}
                onChange={(event) => setSourceReference(event.target.value)}
                maxLength={500}
                style={{ boxSizing: 'border-box', width: '100%', padding: 10, border: '1px solid #CBD5E1', borderRadius: 6 }}
              />
              {revisions.length > 0 && (
                <details style={{ margin: '12px 0 16px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{text('Historique des versions')} ({revisions.length})</summary>
                  {revisions.map((revision) => (
                    <div key={revision.version} style={{ borderTop: '1px solid #E2E8F0', padding: '10px 0' }}>
                      <strong>{text('Version')} {revision.version}</strong>
                      <span> — {revision.actorUsername} — {new Date(revision.createdAt).toLocaleString(getHtmlLanguage(language))}</span>
                      <button
                        type="button"
                        style={{ display: 'block', marginTop: 6 }}
                        onClick={() => {
                          try {
                            setConfigurationText(JSON.stringify(JSON.parse(revision.configurationJson), null, 2));
                            setConfirmConfiguration(false);
                            setEnableFeature(false);
                            setDraftValidation(null);
                            setSandboxPreview(null);
                            setMessage(`${text('Version')} ${revision.version} ${text('chargée comme brouillon local; elle n’est ni enregistrée ni activée.')}`);
                          } catch {
                            setError(`${text('La version')} ${revision.version} ${text('contient un JSON invalide.')}`);
                          }
                        }}
                      >
                        {text('Charger comme brouillon')}
                      </button>
                    </div>
                  ))}
                </details>
              )}
              <label style={{ display: 'block', fontWeight: 700, margin: '14px 0 6px' }} htmlFor="workbook-feature-note">
                {text('Note de revue')}
              </label>
              <textarea
                id="workbook-feature-note"
                value={confirmationNote}
                onChange={(event) => setConfirmationNote(event.target.value)}
                maxLength={1000}
                rows={3}
                style={{ boxSizing: 'border-box', width: '100%', padding: 10, border: '1px solid #CBD5E1', borderRadius: 6 }}
              />
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '14px 0', color: '#334155' }}>
                <input
                  type="checkbox"
                  checked={confirmConfiguration}
                  onChange={(event) => setConfirmConfiguration(event.target.checked)}
                />
                <span>{text('J’ai vérifié cette configuration. Une confirmation seule n’active jamais la fonctionnalité.')}</span>
              </label>
              {selected.activationAvailable && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '14px 0', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={enableFeature}
                    onChange={(event) => setEnableFeature(event.target.checked)}
                  />
                  <span>{text('Activer ce score paramétré après ma revue explicite. Les résultats restent des indicateurs d’aide et ne déclenchent aucune décision automatique.')}</span>
                </label>
              )}
              {(isWorkbookConnectorFeatureKey(selected.key)
                || selected.key === 'dgi-tax-templates' || selected.key === 'arabic-pdf-templates') && (
                <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 20, paddingTop: 16 }}>
                  <h3 style={{ margin: '0 0 8px' }}>{text('Prévisualisation locale — données synthétiques uniquement')}</h3>
                  <p style={{ color: '#475569', lineHeight: 1.5 }}>
                    {text('Ces aperçus n’appellent aucun service et ne produisent aucun document officiel. Les connecteurs restent non connectés.')}
                  </p>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="workbook-sample-payload">
                    {text('Échantillon JSON synthétique')}
                  </label>
                  <textarea
                    id="workbook-sample-payload"
                    value={samplePayloadText}
                    onChange={(event) => setSamplePayloadText(event.target.value)}
                    rows={5}
                    spellCheck={false}
                    style={{ boxSizing: 'border-box', width: '100%', maxWidth: 700, padding: 10, fontFamily: 'monospace' }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {isWorkbookConnectorFeatureKey(selected.key) ? (
                      <>
                        <button type="button" onClick={() => previewConnector('request')}>{text('Prévisualiser la requête mappée')}</button>
                        <button type="button" onClick={() => previewConnector('response')}>{text('Prévisualiser une réponse synthétique')}</button>
                      </>
                    ) : (
                      <button type="button" onClick={previewTemplate}>{text('Prévisualiser le formulaire')}</button>
                    )}
                  </div>
                  {sandboxPreview && (
                    selected.key === 'arabic-pdf-templates'
                    && typeof sandboxPreview === 'object'
                    && 'fields' in sandboxPreview
                    && Array.isArray(sandboxPreview.fields) ? (
                      <div dir="rtl" lang="ar" style={{ marginTop: 12, border: '1px solid #CBD5E1', padding: 14, maxWidth: 700 }}>
                        <p>{'notice' in sandboxPreview && typeof sandboxPreview.notice === 'string' ? sandboxPreview.notice : ''}</p>
                        {sandboxPreview.fields.map((field: unknown, index: number) => {
                          if (!field || typeof field !== 'object') return null;
                          const row = field as Record<string, unknown>;
                          return (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid #E2E8F0', padding: 8 }}>
                              <span>{displayPreviewValue(row.ar)} / <span dir="ltr">{displayPreviewValue(row.fr)}</span></span>
                              <bdi dir="ltr">{row.available === true ? displayPreviewValue(row.value) : '—'}</bdi>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <pre dir="auto" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#F8FAFC', padding: 12, marginTop: 12 }}>
                        {JSON.stringify(sandboxPreview, null, 2)}
                      </pre>
                    )
                  )}
                </div>
              )}
              {selected.key === 'customer-supplier-scoring' && (
                <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 24, paddingTop: 20 }}>
                  <h3 style={{ margin: '0 0 8px' }}>{text('Suivi des litiges partenaires')}</h3>
                  <p style={{ color: '#475569', lineHeight: 1.5 }}>
                    {text('La mesure « disputes » utilise le nombre de litiges ouverts, enregistrés et clôturés par un administrateur.')}
                  </p>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="dispute-type">
                    {text('Type de partenaire')}
                  </label>
                  <select
                    id="dispute-type"
                    value={disputePartnerType}
                    onChange={(event) => setDisputePartnerType(event.target.value as 'CUSTOMER' | 'SUPPLIER')}
                    style={{ display: 'block', width: '100%', maxWidth: 420, padding: 10, marginBottom: 12 }}
                  >
                    <option value="CUSTOMER">{text('Client')}</option>
                    <option value="SUPPLIER">{text('Fournisseur')}</option>
                  </select>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="dispute-partner-id">
                    {text('Code ou identifiant du partenaire')}
                  </label>
                  <input
                    id="dispute-partner-id"
                    value={disputePartnerId}
                    onChange={(event) => setDisputePartnerId(event.target.value)}
                    maxLength={100}
                    style={{ display: 'block', width: '100%', maxWidth: 420, padding: 10, marginBottom: 12 }}
                  />
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="dispute-reference">
                    {text('Référence (facultative)')}
                  </label>
                  <input
                    id="dispute-reference"
                    value={disputeReference}
                    onChange={(event) => setDisputeReference(event.target.value)}
                    maxLength={100}
                    style={{ display: 'block', width: '100%', maxWidth: 420, padding: 10, marginBottom: 12 }}
                  />
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="dispute-note">
                    {text('Motif du litige')}
                  </label>
                  <textarea
                    id="dispute-note"
                    value={disputeNote}
                    onChange={(event) => setDisputeNote(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    style={{ boxSizing: 'border-box', width: '100%', padding: 10, border: '1px solid #CBD5E1', borderRadius: 6 }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void loadDisputes()}
                      style={{ border: '1px solid #CBD5E1', borderRadius: 6, background: '#FFFFFF', color: '#334155', padding: '9px 14px', fontWeight: 700 }}
                    >
                      {text('Charger les litiges')}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void recordDispute()}
                      style={{ border: 0, borderRadius: 6, background: '#475569', color: '#FFFFFF', padding: '9px 14px', fontWeight: 700 }}
                    >
                      {text('Enregistrer un litige ouvert')}
                    </button>
                  </div>
                  {disputes.map((dispute) => (
                    <div key={dispute.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginTop: 10 }}>
                      <strong>{text(dispute.status)} · {dispute.reference || text('Sans référence')}</strong>
                      <p style={{ margin: '6px 0', color: '#475569' }}>{dispute.note}</p>
                      {dispute.status === 'OPEN' ? (
                        <>
                          <input
                            aria-label={`${text('Note de clôture')} ${dispute.id}`}
                            value={disputeResolutionNote}
                            onChange={(event) => setDisputeResolutionNote(event.target.value)}
                            maxLength={2000}
                            placeholder={text('Note de résolution (obligatoire)')}
                            style={{ width: '100%', maxWidth: 620, padding: 8, marginRight: 8 }}
                          />
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void closeDispute(dispute.id)}
                            style={{ marginTop: 8, border: 0, borderRadius: 6, background: '#0F766E', color: '#FFFFFF', padding: '8px 12px', fontWeight: 700 }}
                          >
                            {text('Clôturer le litige')}
                          </button>
                        </>
                      ) : (
                        <p style={{ margin: '6px 0', color: '#64748B' }}>{dispute.resolutionNote}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {selected.effectiveEnabled && (
                <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 24, paddingTop: 20 }}>
                  <h3 style={{ margin: '0 0 8px' }}>{text('Calcul ponctuel et historisé')}</h3>
                  <p style={{ color: '#475569', lineHeight: 1.5 }}>
                    {text('SAFE calcule le score depuis les règlements historisés, les litiges ouverts et l’exposition courante. La période de règlements est définie dans la configuration; une donnée incohérente bloque le calcul.')}
                  </p>
                  {selected.key === 'customer-supplier-scoring' && (
                    <>
                      <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="score-subject-type">
                        {text('Type de partenaire')}
                      </label>
                      <select
                        id="score-subject-type"
                        value={scoreSubjectType}
                        onChange={(event) => setScoreSubjectType(event.target.value as 'CUSTOMER' | 'SUPPLIER')}
                        style={{ display: 'block', width: '100%', maxWidth: 420, padding: 10, marginBottom: 12 }}
                      >
                        <option value="CUSTOMER">{text('Client')}</option>
                        <option value="SUPPLIER">{text('Fournisseur')}</option>
                      </select>
                      <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="score-partner-id">
                        {text('Identifiant du partenaire')}
                      </label>
                      <input
                        id="score-partner-id"
                        value={scorePartnerId}
                        onChange={(event) => setScorePartnerId(event.target.value)}
                        maxLength={100}
                        style={{ display: 'block', width: '100%', maxWidth: 420, padding: 10, marginBottom: 12 }}
                      />
                    </>
                  )}
                  {selected.key === 'financial-health-score' && (
                    <>
                      <p style={{ color: '#475569', lineHeight: 1.5 }}>
                        {text('Saisissez les mesures correspondant exactement aux composants configurés et indiquez leur source. SAFE ne les extrait pas automatiquement des états financiers; vérifiez-les avant le calcul.')}
                      </p>
                      <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="health-score-metrics">
                        {text('Mesures configurées (JSON)')}
                      </label>
                      <textarea
                        id="health-score-metrics"
                        value={healthMetricsText}
                        onChange={(event) => setHealthMetricsText(event.target.value)}
                        rows={5}
                        spellCheck={false}
                        style={{ display: 'block', width: '100%', maxWidth: 620, padding: 10, marginBottom: 12, fontFamily: 'monospace' }}
                      />
                      <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="health-score-source">
                        {text('Référence de la source des mesures')}
                      </label>
                      <input
                        id="health-score-source"
                        value={healthSourceReference}
                        onChange={(event) => setHealthSourceReference(event.target.value)}
                        maxLength={500}
                        style={{ display: 'block', width: '100%', maxWidth: 620, padding: 10, marginBottom: 12 }}
                      />
                    </>
                  )}
                  {selected.key === 'offline-sync' && entityId && (
                    <OfflineDraftQueuePanel
                      entityId={entityId}
                      accessToken={accessToken}
                      configuration={selected.configuration}
                      confirmed={selected.configurationStatus === 'CONFIRMED_DISABLED' || selected.effectiveEnabled}
                      syncEnabled={selected.effectiveEnabled}
                    />
                  )}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void calculateScore()}
                    style={{ marginTop: 12, border: 0, borderRadius: 6, background: '#1D4ED8', color: '#FFFFFF', padding: '10px 16px', fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer' }}
                  >
                    {isSaving
                      ? text('Calcul…')
                      : selected.key === 'financial-health-score'
                        ? text('Calculer depuis les mesures vérifiées et historiser')
                        : text('Calculer depuis l’historique et historiser')}
                  </button>
                  {scoreResult && (
                    <>
                      <div
                        role="meter"
                        aria-label={text('Score de santé financière sur 100')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={scoreResult.score}
                        style={{ height: 14, maxWidth: 620, background: '#E2E8F0', borderRadius: 8, overflow: 'hidden', marginTop: 16 }}
                      >
                        <div style={{ width: `${scoreResult.score}%`, height: '100%', background: scoreResult.alertTriggered ? '#DC2626' : '#0F766E' }} />
                      </div>
                      <p role="status" style={{ fontWeight: 700, color: scoreResult.alertTriggered ? '#B91C1C' : '#047857' }}>
                        {text('Score')} {scoreResult.score.toFixed(2)}/100 — {text('seuil configuré')} {scoreResult.alertThreshold}/100
                        {scoreResult.alertTriggered ? ` — ${text('alerte de seuil')}` : ''} — {new Date(scoreResult.calculatedAt).toLocaleString(getHtmlLanguage(language))}
                      </p>
                    </>
                  )}
                </div>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void save()}
                style={{ border: 0, borderRadius: 6, background: '#0F766E', color: '#FFFFFF', padding: '10px 16px', fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer' }}
              >
                {isSaving ? text('Enregistrement…') : text('Enregistrer la configuration')}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
