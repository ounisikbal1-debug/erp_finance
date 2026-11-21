import React, { useReducer, useState } from 'react';
import {
  parseTunisianWithholdingInput,
  tunisianWithholdingRuleCatalog,
  type TunisianWithholdingCategory,
  type TunisianWithholdingInput,
} from '../application/modules/taxation/withholding';
import { reduceWithholdingPreviewState } from './withholding-preview-state';
import WithholdingCertificateWorkflow from './WithholdingCertificateWorkflow';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface WithholdingPreview {
  period: string;
  category: TunisianWithholdingCategory;
  status: 'CALCULATED' | 'NOT_APPLICABLE' | 'UNAVAILABLE';
  declarantType: 'PERSONNE_PHYSIQUE' | 'PERSONNE_MORALE' | null;
  currency: string;
  baseTtc: number | null;
  rate: number | null;
  amount: number | null;
  monthlyDeclarationDueDate: string | null;
  annualDeclarationDueDate: string | null;
  ruleBasis: string;
  ruleProvenance: {
    source: string;
    sourceDate: string | null;
    sourceDateStatus: string;
    effectiveFrom: string | null;
    validationStatus: string;
  };
  certificate: {
    required: boolean | null;
    recipient: 'supplier' | null;
    status: 'PREPARATION_AVAILABLE' | 'NOT_REQUIRED' | 'UNAVAILABLE';
  };
  diagnostics: string[];
  correctionActions: string[];
}

interface WithholdingPreviewPanelProps {
  accessToken: string | null;
  entityId: string | null;
  period: string;
}

const variableRateCategories: TunisianWithholdingCategory[] = ['distributeurs_telecom', 'location_materiel'];

function isWithholdingPreview(value: unknown): value is WithholdingPreview {
  if (!value || typeof value !== 'object') return false;
  const preview = value as Partial<WithholdingPreview>;
  return typeof preview.period === 'string'
    && typeof preview.category === 'string'
    && ['CALCULATED', 'NOT_APPLICABLE', 'UNAVAILABLE'].includes(String(preview.status))
    && typeof preview.currency === 'string'
    && (preview.baseTtc === null || typeof preview.baseTtc === 'number')
    && (preview.rate === null || typeof preview.rate === 'number')
    && (preview.amount === null || typeof preview.amount === 'number')
    && (preview.monthlyDeclarationDueDate === null || typeof preview.monthlyDeclarationDueDate === 'string')
    && (preview.annualDeclarationDueDate === null || typeof preview.annualDeclarationDueDate === 'string')
    && typeof preview.ruleBasis === 'string'
    && Boolean(preview.ruleProvenance && typeof preview.ruleProvenance.source === 'string')
    && Boolean(preview.certificate && typeof preview.certificate.status === 'string')
    && Array.isArray(preview.diagnostics)
    && preview.diagnostics.every((diagnostic) => typeof diagnostic === 'string')
    && Array.isArray(preview.correctionActions)
    && preview.correctionActions.every((action) => typeof action === 'string');
}

function formatTnd(amount: number | null, locale: string): string {
  return amount === null ? 'Indisponible' : `${amount.toLocaleString(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} TND`;
}

export default function WithholdingPreviewPanel({ accessToken, entityId, period }: WithholdingPreviewPanelProps) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const locale = getHtmlLanguage(language);
  const [category, setCategory] = useState<TunisianWithholdingCategory>('honoraires_reel');
  const [amountTtc, setAmountTtc] = useState('');
  const [declarantType, setDeclarantType] = useState('');
  const [isEmployer, setIsEmployer] = useState('');
  const [supplierFiscalIdPresent, setSupplierFiscalIdPresent] = useState('');
  const [selectedRate, setSelectedRate] = useState('');
  const [foreignTreatyReview, setForeignTreatyReview] = useState('');
  const [treatyAdjustedRate, setTreatyAdjustedRate] = useState('');
  const [previewState, dispatchPreviewState] = useReducer(
    reduceWithholdingPreviewState<WithholdingPreview, TunisianWithholdingInput>,
    { preview: null, withholdingInput: null },
  );
  const { preview, withholdingInput } = previewState;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isPurchase = category === 'achats';
  const isDeliveryWithCard = category === 'livraisons_avec_carte_fiscale';
  const isForeignPayment = category === 'paiements_etranger';
  const selectedRule = tunisianWithholdingRuleCatalog.find((rule) => rule.category === category);
  const requiresExplicitSelection = [
    'honoraires_non_residents',
    'honoraires_reel',
    'honoraires_forfaitaire',
    'architectes_ingenieurs_conseils',
    'artistes_sportifs',
    'commissions_courtage',
    'location_hotels',
  ].includes(category);
  const needsExplicitRate = variableRateCategories.includes(category)
    || requiresExplicitSelection
    || (isPurchase && supplierFiscalIdPresent === 'yes')
    || (isDeliveryWithCard && supplierFiscalIdPresent === 'yes');

  const calculatePreview = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    dispatchPreviewState({ type: 'input-changed' });
    if (!accessToken || !entityId) {
      setError('Une session et une société tunisienne doivent être disponibles.');
      return;
    }
    const body: Record<string, unknown> = {
      period,
      category,
      amountTtc: Number(amountTtc),
    };
    if (declarantType !== '') body.declarantType = declarantType;
    if (isEmployer !== '') body.isEmployer = isEmployer === 'yes';
    if ((isPurchase || isDeliveryWithCard) && supplierFiscalIdPresent !== '') {
      body.supplierFiscalIdPresent = supplierFiscalIdPresent === 'yes';
    }
    if (needsExplicitRate && selectedRate !== '') {
      body.selectedRate = Number(selectedRate);
    }
    if (isForeignPayment && foreignTreatyReview !== '') {
      body.foreignTreatyReview = foreignTreatyReview;
      if (foreignTreatyReview === 'adjusted_rate' && treatyAdjustedRate !== '') {
        body.treatyAdjustedRate = Number(treatyAdjustedRate);
      }
    }

    setLoading(true);
    try {
      const parsedInput = parseTunisianWithholdingInput(body);
      const response = await fetch('/api/taxation/withholding-preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'Impossible de calculer l’aperçu de retenue.';
        throw new Error(message);
      }
      if (!isWithholdingPreview(payload)) throw new Error('La réponse de retenue est invalide.');
      dispatchPreviewState({ type: 'calculated', preview: payload, withholdingInput: parsedInput });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de calculer l’aperçu de retenue.');
    } finally {
      setLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };
  const controlStyle: React.CSSProperties = {
    display: 'grid',
    gap: 5,
    color: '#334155',
    fontSize: '0.85rem',
    fontWeight: 700,
  };

  return (
    <section aria-labelledby="withholding-preview-title" style={{ ...cardStyle, display: 'grid', gap: 12 }}>
      <header>
        <h3 id="withholding-preview-title" style={{ margin: 0, color: '#0F172A' }}>{text('Aperçu consultatif des retenues TN')}</h3>
        <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
          {text('Saisie manuelle en TTC; règles fournies par l’utilisateur, à vérifier par un professionnel habilité. Aucun résultat n’est enregistré, déclaré ou certifié.')}
        </p>
      </header>

      <form
        onSubmit={calculatePreview}
        onChange={() => {
          dispatchPreviewState({ type: 'input-changed' });
          setError('');
        }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}
      >
        <label style={controlStyle}>
          {text('Catégorie')}
          <select disabled={loading} value={category} onChange={(event) => {
            setCategory(event.target.value as TunisianWithholdingCategory);
            setSelectedRate('');
            setSupplierFiscalIdPresent('');
            setForeignTreatyReview('');
            setTreatyAdjustedRate('');
          }}>
            {tunisianWithholdingRuleCatalog.map((rule) => (
              <option key={rule.category} value={rule.category}>{text(rule.label)}</option>
            ))}
          </select>
        </label>
        <label style={controlStyle}>
          {text('Période')}
          <input type="month" value={period} disabled />
        </label>
        <label style={controlStyle}>
          {text('Type de déclarant — échéance mensuelle')}
          <select disabled={loading} value={declarantType} onChange={(event) => setDeclarantType(event.target.value)} required>
            <option value="">{text('À préciser')}</option>
            <option value="PERSONNE_PHYSIQUE">{text('Personne physique — J+15')}</option>
            <option value="PERSONNE_MORALE">{text('Personne morale — J+28')}</option>
          </select>
        </label>
        <label style={controlStyle}>
          {text('Employeur — échéance annuelle')}
          <select disabled={loading} value={isEmployer} onChange={(event) => setIsEmployer(event.target.value)} required>
            <option value="">{text('À préciser')}</option>
            <option value="yes">{text('Oui — avant le 28 février')}</option>
            <option value="no">{text('Non')}</option>
          </select>
        </label>
        <label style={controlStyle}>
          {text('Montant TTC (TND)')}
          <input dir="ltr" disabled={loading} type="number" min="0" step="0.001" value={amountTtc} onChange={(event) => setAmountTtc(event.target.value)} required />
        </label>

        {(isPurchase || isDeliveryWithCard) && (
          <label style={controlStyle}>
            {text('Carte / matricule fiscal du fournisseur')}
            <select disabled={loading} value={supplierFiscalIdPresent} onChange={(event) => {
              setSupplierFiscalIdPresent(event.target.value);
              setSelectedRate('');
            }} required>
              <option value="">{text('À vérifier')}</option>
              <option value="yes">{text('Présent')}</option>
              {isPurchase && <option value="no">{text('Absent — taux fourni 15%')}</option>}
              {isDeliveryWithCard && <option value="no">{text('Absent — utiliser la catégorie sans carte')}</option>}
            </select>
          </label>
        )}

        {needsExplicitRate && (
          <label style={controlStyle}>
            {text('Taux RS explicitement sélectionné')}
            <select disabled={loading} value={selectedRate} onChange={(event) => setSelectedRate(event.target.value)} required>
              <option value="">{text('Sélectionner — règle ambiguë')}</option>
              {(selectedRule?.rates ?? [])
                .filter((rate) => !(isPurchase && supplierFiscalIdPresent === 'yes' && rate === 15))
                .map((rate) => (
                <option key={rate} value={rate}>{String(rate).replace('.', ',')}%</option>
                ))}
            </select>
          </label>
        )}

        {isForeignPayment && (
          <>
            <label style={controlStyle}>
              {text('Revue de convention fiscale')}
              <select disabled={loading} value={foreignTreatyReview} onChange={(event) => setForeignTreatyReview(event.target.value)} required>
                <option value="">{text('À vérifier — aucun taux calculé')}</option>
                <option value="no_adjustment">{text('Revue compétente — aucun ajustement')}</option>
                <option value="adjusted_rate">{text('Revue compétente — taux ajusté')}</option>
              </select>
            </label>
            {foreignTreatyReview === 'adjusted_rate' && (
              <label style={controlStyle}>
                {text('Taux ajusté justifié')}
                <input dir="ltr" disabled={loading} type="number" min="0" max="100" step="0.001" value={treatyAdjustedRate} onChange={(event) => setTreatyAdjustedRate(event.target.value)} required />
              </label>
            )}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button type="submit" disabled={loading} style={{ border: 0, borderRadius: 7, background: loading ? '#94A3B8' : '#2563EB', color: '#FFF', padding: '9px 13px', fontWeight: 700 }}>
            {loading ? text('Calcul…') : text('Calculer l’aperçu')}
          </button>
        </div>
      </form>

      {error && <div role="alert" style={{ color: '#991B1B' }}>{text(error)}</div>}
      {preview && (
        <div role="status" style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
          <p><strong>{text('Statut :')}</strong> {text(preview.status)} — {text('retenue')} {formatTnd(preview.amount, locale)} ({preview.rate === null ? text('taux indisponible') : `${preview.rate.toLocaleString(locale)}%`}) {text('sur base TTC')} {formatTnd(preview.baseTtc, locale)}</p>
          <p><strong>{text('Échéances fournies :')}</strong> {text('mensuelle')} {preview.monthlyDeclarationDueDate ? new Date(`${preview.monthlyDeclarationDueDate}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' }) : text('indisponible')}; {text('annuelle')} {preview.annualDeclarationDueDate ? new Date(`${preview.annualDeclarationDueDate}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' }) : text('indisponible')}</p>
          <p><strong>{text('Provenance de la règle :')}</strong> {text(preview.ruleProvenance.source)}; {text('date de transmission')} {preview.ruleProvenance.sourceDate ? new Date(`${preview.ruleProvenance.sourceDate}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' }) : text('non renseignée')} ({text(preview.ruleProvenance.sourceDateStatus)}); {text('date d’effet')} {preview.ruleProvenance.effectiveFrom ? new Date(`${preview.ruleProvenance.effectiveFrom}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' }) : text('non fournie')}; {text(preview.ruleProvenance.validationStatus)}.</p>
          <p><strong>{text('Certificat :')}</strong> {text(preview.certificate.status === 'PREPARATION_AVAILABLE' ? 'workflow interne de préparation/émission disponible après rapprochement de la pièce; aucune certification réglementaire' : preview.certificate.status === 'NOT_REQUIRED' ? 'non requis selon le cas calculé' : 'nécessité ou préparation indéterminée')}.</p>
          <p>{text('La pénalité fournie de 0,75% par mois ou fraction n’est pas calculée faute de dates et de faits de responsabilité validés.')}</p>
          {[...preview.diagnostics, ...preview.correctionActions].map((message, index) => <p key={`${index}-${message}`} style={{ margin: '6px 0', color: '#7C2D12' }}>{text(message)}</p>)}
          {preview.status === 'CALCULATED' && preview.amount !== null && preview.amount > 0 && withholdingInput && (
            <WithholdingCertificateWorkflow
              accessToken={accessToken}
              entityId={entityId}
              period={period}
              withholding={withholdingInput}
              allowed
            />
          )}
        </div>
      )}
    </section>
  );
}
