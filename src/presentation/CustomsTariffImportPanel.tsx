import React, { useEffect, useState } from 'react';
import {
  createCustomsTariffCsvTemplate,
  CUSTOMS_TARIFF_CSV_TEMPLATE_COLUMNS,
} from '../application/modules/customs/tariff-import';
import { translateBusinessText, useInterfaceLanguage } from './localization';

interface CustomsTariffImportPreview {
  canImport: boolean;
  rowCount: number;
  validCount: number;
  errors: string[];
}

interface CustomsTariffDraft {
  id: string;
  tariffCode: string;
  description: string;
  customsDutyRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  sourceName: string | null;
  sourceReference: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  consumptionDutyRate: number;
  fodecRate: number;
  importVatRate: number;
  customsServiceFeeRate: number;
  preferentialCustomsDutyRate: number | null;
  originCountryCode: string | null;
  preferentialAgreementCode: string | null;
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

export default function CustomsTariffImportPanel({
  accessToken,
  countryCode,
}: {
  accessToken: string | null;
  countryCode: string;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [fileName, setFileName] = useState('');
  const [ngpLookup, setNgpLookup] = useState('');
  const [ngpCopyMessage, setNgpCopyMessage] = useState('');
  const [tariffFilter, setTariffFilter] = useState('');
  const [csv, setCsv] = useState('');
  const [sourceName, setSourceName] = useState('Douane tunisienne — Tarif Web 2026');
  const [sourceUrl, setSourceUrl] = useState('https://www.douane.gov.tn/tarifweb2026/');
  const [sourceReference, setSourceReference] = useState('');
  const [delimiter, setDelimiter] = useState<',' | ';' | '\t'>(';');
  const [decimalSeparator, setDecimalSeparator] = useState<'.' | ','>('.');
  const [dateFormat, setDateFormat] = useState<'YYYY-MM-DD' | 'DD/MM/YYYY'>('YYYY-MM-DD');
  const [columns, setColumns] = useState(JSON.stringify(CUSTOMS_TARIFF_CSV_TEMPLATE_COLUMNS, null, 2));
  const [bases, setBases] = useState('{}');
  const [preview, setPreview] = useState<CustomsTariffImportPreview | null>(null);
  const [tariffs, setTariffs] = useState<CustomsTariffDraft[]>([]);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const filteredTariffs = tariffs.filter((tariff) => {
    const query = tariffFilter.trim().toLowerCase();
    return !query || tariff.tariffCode.includes(query)
      || tariff.description.toLowerCase().includes(query)
      || (tariff.originCountryCode ?? '').toLowerCase().includes(query)
      || (tariff.preferentialAgreementCode ?? '').toLowerCase().includes(query);
  });

  const loadTariffs = async () => {
    if (!accessToken) return;
    try {
      const payload = await readJson(await fetch(
        `/api/admin/countries/${encodeURIComponent(countryCode)}/customs-tariffs`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ));
      if (!Array.isArray(payload)) throw new Error('La liste des barèmes reçue est invalide.');
      setTariffs(payload as CustomsTariffDraft[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text('Impossible de charger les barèmes.'));
    }
  };

  useEffect(() => {
    void loadTariffs();
  }, [accessToken, countryCode]);

  const buildRequest = () => ({
    csv,
    settings: {
      sourceName,
      sourceUrl,
      sourceReference,
      delimiter,
      decimalSeparator,
      dateFormat,
      columns: JSON.parse(columns) as unknown,
      bases: JSON.parse(bases) as unknown,
    },
  });

  const downloadCsvTemplate = () => {
    const url = URL.createObjectURL(new Blob(
      [createCustomsTariffCsvTemplate()],
      { type: 'text/csv;charset=utf-8' },
    ));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modele-baremes-douaniers.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const previewImport = async () => {
    if (!accessToken || !csv) return;
    setBusy(true);
    setError('');
    setMessage('');
    setPreview(null);
    setImportConfirmed(false);
    try {
      const response = await fetch(
        `/api/admin/countries/${encodeURIComponent(countryCode)}/customs-tariffs/import-preview`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildRequest()),
        },
      );
      const result: unknown = await readJson(response);
      if (!result || typeof result !== 'object'
        || !('canImport' in result) || typeof result.canImport !== 'boolean'
        || !('rowCount' in result) || typeof result.rowCount !== 'number'
        || !('validCount' in result) || typeof result.validCount !== 'number'
        || !('errors' in result) || !Array.isArray(result.errors)) {
        throw new Error('L’aperçu d’import reçu est invalide.');
      }
      setPreview(result as CustomsTariffImportPreview);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : text('Impossible de prévisualiser ce fichier.'));
    } finally {
      setBusy(false);
    }
  };

  const importDrafts = async () => {
    if (!accessToken || !preview?.canImport || !importConfirmed) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/admin/countries/${encodeURIComponent(countryCode)}/customs-tariffs/import`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...buildRequest(), importConfirmed: true }),
        },
      );
      const result: unknown = await readJson(response);
      if (!result || typeof result !== 'object'
        || !('importedCount' in result) || typeof result.importedCount !== 'number') {
        throw new Error('Le résultat d’import reçu est invalide.');
      }
      setMessage(`${result.importedCount} ${text('barèmes importés en brouillon. Ils restent inactifs jusqu’à vérification individuelle.')}`);
      setPreview(null);
      setImportConfirmed(false);
      await loadTariffs();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : text('Impossible d’importer les brouillons.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyTariff = async (tariff: CustomsTariffDraft) => {
    if (!accessToken
      || !globalThis.confirm(`Confirmer la vérification manuelle de ${tariff.tariffCode} à partir de la source officielle enregistrée ?`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await readJson(await fetch(
        `/api/admin/countries/${encodeURIComponent(countryCode)}/customs-tariffs/${encodeURIComponent(tariff.id)}/verify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ verificationConfirmed: true }),
        },
      ));
      setMessage(`${text('Barème')} ${tariff.tariffCode} ${text('vérifié; il pourra être utilisé pour les dates valides après contrôle du classement.')}`);
      await loadTariffs();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : text('Impossible de vérifier ce barème.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
      <h2 style={{ margin: '0 0 8px' }}>{text('Recherche et import du Tarif Web officiel')}</h2>
      <p style={{ color: '#475569', lineHeight: 1.5 }}>
        {text('Consultez le Tarif Web officiel pour chaque code NGP à 10 chiffres et téléchargez ou exportez les données depuis ce portail si cette fonction est proposée. SAFE ne récupère pas automatiquement son contenu. Aucun taux général ou taux supposé n’est appliqué.')}
      </p>
      <div role="note" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, margin: '12px 0' }}>
        <strong>{text('Consultation officielle par code NGP')}</strong>
        <p style={{ margin: '6px 0', color: '#334155' }}>
          {text('Saisissez un code NGP complet à 10 chiffres, ouvrez le portail officiel dans un nouvel onglet et recherchez ce code. Recopiez les taux, la période et l’accord éventuel uniquement à partir de la fiche officielle consultée.')}
        </p>
        <label htmlFor="customs-ngp-lookup" style={{ fontWeight: 700 }}>{text('Code NGP à rechercher')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          <input
            id="customs-ngp-lookup"
            value={ngpLookup}
            onChange={(event) => {
              setNgpLookup(event.target.value.replace(/\D/g, '').slice(0, 10));
              setNgpCopyMessage('');
            }}
            inputMode="numeric"
            maxLength={10}
            placeholder="10 chiffres"
            dir="ltr"
            style={{ padding: 8 }}
          />
          <button
            type="button"
            disabled={ngpLookup.length !== 10}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ngpLookup);
                setNgpCopyMessage(text('Code NGP copié; collez-le dans la recherche du portail.'));
              } catch {
                setNgpCopyMessage(text('Copiez manuellement le code NGP affiché.'));
              }
            }}
          >
            {text('Copier le code NGP')}
          </button>
          <a
            href="https://www.douane.gov.tn/tarifweb2026/"
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            style={{ display: 'inline-block', padding: '9px 12px', borderRadius: 6, background: '#1D4ED8', color: '#FFFFFF', textDecoration: 'none', fontWeight: 700 }}
          >
            {text('Ouvrir le site officiel des Douanes')}
          </a>
        </div>
        {ngpCopyMessage && <p role="status">{ngpCopyMessage}</p>}
        <p style={{ margin: '8px 0 0', color: '#475569', fontSize: '0.85rem' }}>
          {text('Le portail officiel peut être indisponible selon la connexion. Le lien n’effectue aucune requête depuis SAFE et ne préremplit pas un endpoint de recherche non documenté.')}
        </p>
      </div>
      <h3>{text('Importer les données téléchargées depuis la source officielle')}</h3>
      <p style={{ color: '#475569', lineHeight: 1.5 }}>
        {text('L’import accepte un CSV UTF-8, vérifie les codes NGP et périodes, calcule une empreinte SHA-256 et crée des brouillons. Toute activation exige un contrôle humain de chaque barème.')}
      </p>
      <p style={{ color: '#475569', lineHeight: 1.5 }}>
        {text('Le modèle ne contient aucun taux d’exemple. Ajoutez uniquement les données vérifiées dans la source officielle et définissez séparément les assiettes validées avant l’aperçu.')}
      </p>
      <button type="button" onClick={downloadCsvTemplate}>
        {text('Télécharger le modèle CSV vierge')}
      </button>
      <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="customs-tariff-csv">
        {text('Fichier CSV (500 Ko maximum)')}
      </label>
      <input
        id="customs-tariff-csv"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          setPreview(null);
          setImportConfirmed(false);
          setError('');
          if (!file) return;
          setFileName(file.name);
          if (file.size > 500_000) {
            setCsv('');
            setError(text('Le CSV dépasse 500 Ko.'));
            return;
          }
          void file.text().then(setCsv).catch(() => setError(text('Impossible de lire ce fichier CSV UTF-8.')));
        }}
      />
      {fileName && <p>{text('Fichier choisi')} : <bdi dir="ltr">{fileName}</bdi></p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 5 }}>{text('Nom de la source')}
          <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} maxLength={160} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>{text('URL officielle de source')}
          <input dir="ltr" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2000} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>{text('Édition, date ou référence du tarif')}
          <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} maxLength={400} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>{text('Séparateur CSV')}
          <select value={delimiter} onChange={(event) => setDelimiter(event.target.value as ',' | ';' | '\t')}>
            <option value=";">{text('Point-virgule')}</option>
            <option value=",">{text('Virgule')}</option>
            <option value={'\t'}>{text('Tabulation')}</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5 }}>{text('Séparateur décimal')}
          <select value={decimalSeparator} onChange={(event) => setDecimalSeparator(event.target.value as '.' | ',')}>
            <option value=".">{text('Point')}</option>
            <option value=",">{text('Virgule')}</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5 }}>{text('Format de date')}
          <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as 'YYYY-MM-DD' | 'DD/MM/YYYY')}>
            <option value="YYYY-MM-DD">AAAA-MM-JJ</option>
            <option value="DD/MM/YYYY">JJ/MM/AAAA</option>
          </select>
        </label>
      </div>
      <label style={{ display: 'block', fontWeight: 700, margin: '14px 0 6px' }} htmlFor="customs-tariff-columns">
        {text('Correspondance des colonnes CSV (JSON)')}
      </label>
      <textarea
        id="customs-tariff-columns"
        dir="ltr"
        value={columns}
        onChange={(event) => setColumns(event.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={'{"tariffCode":"NGP","description":"Libellé","customsDutyRate":"DD",...}'}
        style={{ boxSizing: 'border-box', width: '100%', fontFamily: 'monospace', padding: 10 }}
      />
      <label style={{ display: 'block', fontWeight: 700, margin: '14px 0 6px' }} htmlFor="customs-tariff-bases">
        {text('Assiettes configurées (JSON; aucune formule n’est déduite)')}
      </label>
      <textarea
        id="customs-tariff-bases"
        dir="ltr"
        value={bases}
        onChange={(event) => setBases(event.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={'{"customsDutyBaseComponents":["CIF"],"...":"..."}'}
        style={{ boxSizing: 'border-box', width: '100%', fontFamily: 'monospace', padding: 10 }}
      />
      <button type="button" disabled={busy || !accessToken || !csv} onClick={() => void previewImport()} style={{ marginTop: 10 }}>
        {busy ? text('Validation…') : text('Valider et prévisualiser sans sauvegarder')}
      </button>
      {error && <p role="alert" style={{ color: '#B91C1C' }}>{text(error)}</p>}
      {message && <p role="status" style={{ color: '#047857' }}>{text(message)}</p>}
      {preview && (
        <div role="status" style={{ marginTop: 12, padding: 12, background: preview.canImport ? '#F0FDF4' : '#FFF7ED' }}>
          <strong>{preview.canImport ? text('Aperçu valide') : text('Import bloqué')} — {preview.validCount}/{preview.rowCount} {text('lignes valides')}.</strong>
          {preview.errors.length > 0 && (
            <ul>{preview.errors.map((line, index) => <li key={index}>{line}</li>)}</ul>
          )}
          {preview.canImport && (
            <>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
                <input type="checkbox" checked={importConfirmed} onChange={(event) => setImportConfirmed(event.target.checked)} />
                <span>{text('Je confirme l’origine officielle et l’édition de la source. Les valeurs et assiettes ont été vérifiées.')}</span>
              </label>
              <button type="button" disabled={busy || !importConfirmed} onClick={() => void importDrafts()} style={{ marginTop: 8 }}>
                {text('Importer uniquement en brouillons')}
              </button>
            </>
          )}
        </div>
      )}
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{text('Barèmes existants')} ({tariffs.length})</summary>
        <label style={{ display: 'grid', gap: 5, maxWidth: 420, marginTop: 10 }}>
          {text('Filtrer par code NGP, désignation, origine ou accord')}
          <input value={tariffFilter} onChange={(event) => setTariffFilter(event.target.value)} />
        </label>
        {filteredTariffs.map((tariff) => (
          <div key={tariff.id} style={{ borderTop: '1px solid #E2E8F0', padding: 10, marginTop: 8 }}>
            <strong><bdi dir="ltr">{tariff.tariffCode}</bdi> — {text(tariff.status === 'DRAFT' ? 'Brouillon' : tariff.status)}</strong>
            <div>{tariff.description} · DD {tariff.customsDutyRate}% · DC {tariff.consumptionDutyRate}% · FODEC {tariff.fodecRate}% · TVA import {tariff.importVatRate}% · RPD {tariff.customsServiceFeeRate}% · <bdi dir="ltr">{tariff.effectiveFrom}</bdi>
              {tariff.effectiveTo && <> — <bdi dir="ltr">{tariff.effectiveTo}</bdi></>}
            </div>
            {tariff.preferentialCustomsDutyRate !== null && (
              <div>{text('Droit préférentiel')} {tariff.preferentialCustomsDutyRate}% · {text('Origine')} <bdi dir="ltr">{tariff.originCountryCode}</bdi> · {text('Accord')} <bdi dir="ltr">{tariff.preferentialAgreementCode}</bdi></div>
            )}
            <div>{text('Source')} : {tariff.sourceName ?? text('inconnue')} · <bdi dir="ltr">{tariff.sourceReference ?? text('sans édition')}</bdi></div>
            {tariff.sourceUrl && <a href={tariff.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{text('Ouvrir la référence source')}</a>}
            {tariff.status === 'VERIFIED' && tariff.verifiedAt && (
              <div role="status">{text('Vérifié manuellement le')} <bdi dir="ltr">{new Date(tariff.verifiedAt).toLocaleString()}</bdi> — {text('la validité dépend de la période et de la source indiquées.')}</div>
            )}
            {tariff.status === 'VERIFIED' && (
              <a href="https://www.douane.gov.tn/tarifweb2026/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" style={{ display: 'inline-block', marginTop: 5 }}>
                {text('Rechercher ce code dans le portail officiel')}
              </a>
            )}
            {tariff.status === 'DRAFT' && (
              <button type="button" disabled={busy} onClick={() => void verifyTariff(tariff)} style={{ display: 'block', marginTop: 6 }}>
                {text('Vérifier manuellement cette ligne')}
              </button>
            )}
          </div>
        ))}
        {filteredTariffs.length === 0 && <p>{text(tariffs.length === 0
          ? 'Aucun taux n’est chargé; aucun taux fictif ne sera appliqué.'
          : 'Aucun barème ne correspond au filtre.')}</p>}
      </details>
    </section>
  );
}
