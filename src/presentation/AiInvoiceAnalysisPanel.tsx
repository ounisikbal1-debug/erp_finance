import { useState } from 'react';
import type { FormEvent } from 'react';
import { validateInvoiceUpload } from './invoice-upload-validation';

interface InvoiceSuggestion {
  description: string;
  amount: number | null;
  accountCode: string | null;
  accountDescription: string | null;
  confidence: 'low' | 'medium' | 'high';
  explanation: {
    modelRationale: string;
    sourceQuote: string;
    accountCode: string | null;
    accountDescription: string | null;
    matchedTerms: string[];
    score: {
      matchedTermCount: number;
      citedTermCount: number;
    };
    ruleChecks: Array<{ rule: string; passed: boolean }>;
  };
}

interface InvoiceAnalysis {
  provider: 'ollama-local';
  model: string;
  sourceFormat: 'pdf' | 'xlsx';
  extractedText: string;
  pageCount?: number;
  rowCount?: number;
  invoice: {
    supplierName: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
  };
  suggestions: InvoiceSuggestion[];
  approvalRequired: true;
  postingCreated: false;
  disclaimer: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInvoiceAnalysis(value: unknown): value is InvoiceAnalysis {
  if (!isRecord(value)
    || value.provider !== 'ollama-local'
    || typeof value.model !== 'string'
    || (value.sourceFormat !== 'pdf' && value.sourceFormat !== 'xlsx')
    || typeof value.extractedText !== 'string'
    || !isRecord(value.invoice)
    || (value.invoice.supplierName !== null && typeof value.invoice.supplierName !== 'string')
    || (value.invoice.invoiceNumber !== null && typeof value.invoice.invoiceNumber !== 'string')
    || (value.invoice.invoiceDate !== null && typeof value.invoice.invoiceDate !== 'string')
    || !Array.isArray(value.suggestions)
    || value.approvalRequired !== true
    || value.postingCreated !== false
    || typeof value.disclaimer !== 'string') return false;
  return value.suggestions.every((suggestion) => isRecord(suggestion)
    && typeof suggestion.description === 'string'
    && (suggestion.amount === null || (typeof suggestion.amount === 'number' && Number.isFinite(suggestion.amount)))
    && (suggestion.accountCode === null || typeof suggestion.accountCode === 'string')
    && (suggestion.accountDescription === null || typeof suggestion.accountDescription === 'string')
    && (suggestion.confidence === 'low' || suggestion.confidence === 'medium' || suggestion.confidence === 'high')
    && isRecord(suggestion.explanation)
    && typeof suggestion.explanation.modelRationale === 'string'
    && typeof suggestion.explanation.sourceQuote === 'string'
    && Array.isArray(suggestion.explanation.matchedTerms)
    && suggestion.explanation.matchedTerms.every((term) => typeof term === 'string')
    && isRecord(suggestion.explanation.score)
    && Number.isSafeInteger(suggestion.explanation.score.matchedTermCount)
    && Number.isSafeInteger(suggestion.explanation.score.citedTermCount)
    && Array.isArray(suggestion.explanation.ruleChecks)
    && suggestion.explanation.ruleChecks.every((check) => isRecord(check)
      && typeof check.rule === 'string'
      && typeof check.passed === 'boolean'));
}

function errorMessage(value: unknown): string {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : 'Impossible d’analyser la facture localement.';
}

export default function AiInvoiceAnalysisPanel({ accessToken }: { accessToken: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<InvoiceAnalysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const chooseFile = (selectedFile: File | undefined) => {
    setAnalysis(null);
    if (!selectedFile) {
      setFile(null);
      setError('');
      return;
    }
    const validation = validateInvoiceUpload(selectedFile);
    if ('error' in validation) {
      setFile(null);
      setError(validation.error);
      return;
    }
    setFile(selectedFile);
    setError('');
  };

  const analyze = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setAnalysis(null);
    if (!accessToken) {
      setError('Une session SAFE authentifiée est requise.');
      return;
    }
    const validation = file ? validateInvoiceUpload(file) : null;
    if (!file || !validation || 'error' in validation) {
      setError(validation && 'error' in validation
        ? validation.error
        : 'Sélectionnez un fichier PDF ou Excel .xlsx.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/ai/invoice-analysis', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': validation.contentType,
        },
        body: file,
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload));
      if (!isInvoiceAnalysis(payload)) throw new Error('La réponse d’analyse locale est invalide.');
      setAnalysis(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'L’analyse locale est indisponible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="invoice-ai-analysis-title" style={{ border: '1px solid #CBD5E1', borderRadius: 10, padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <h3 id="invoice-ai-analysis-title" style={{ margin: '0 0 6px' }}>OCR local et suggestions d’imputation</h3>
        <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
          PDF (5 pages maximum) ou Excel .xlsx (première feuille). Le document sensible est traité localement, n’est pas enregistré et n’est jamais envoyé au cloud.
        </p>
      </div>
      <form
        onSubmit={(event) => void analyze(event)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          chooseFile(event.dataTransfer.files[0]);
        }}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'end',
          padding: 12,
          border: `2px dashed ${isDragging ? '#2563EB' : '#CBD5E1'}`,
          borderRadius: 8,
          background: isDragging ? '#EFF6FF' : 'transparent',
        }}
      >
        <label style={{ display: 'grid', gap: 4, flex: '1 1 300px' }}>
          Déposez une facture ici ou sélectionnez-la (PDF ou .xlsx, 8 Mo maximum)
          <input
            type="file"
            accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
            }}
          />
        </label>
        {file && <span role="status">{file.name}</span>}
        <button type="submit" disabled={loading || !file || !accessToken}>
          {loading ? 'Analyse locale en cours…' : 'Analyser sans comptabiliser'}
        </button>
      </form>
      {error && <div role="alert" style={{ color: '#991B1B' }}>{error}</div>}
      {analysis && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div role="note" style={{ border: '1px solid #FCD34D', background: '#FFFBEB', color: '#92400E', borderRadius: 8, padding: 10 }}>
            Revue humaine obligatoire. Aucune écriture n’a été créée. La confiance est qualitative et n’est pas une probabilité validée.
          </div>
          <div>
            <strong>Document extrait — {analysis.sourceFormat.toUpperCase()}</strong>
            <span style={{ marginLeft: 8, color: '#64748B', fontSize: 12 }}>
              {analysis.pageCount === undefined ? `${analysis.rowCount ?? 0} ligne(s) Excel` : `${analysis.pageCount} page(s)`} · modèle local {analysis.model}
            </span>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, margin: '10px 0' }}>
              <div><dt>Fournisseur extrait</dt><dd>{analysis.invoice.supplierName ?? 'Non détecté'}</dd></div>
              <div><dt>Numéro de facture extrait</dt><dd>{analysis.invoice.invoiceNumber ?? 'Non détecté'}</dd></div>
              <div><dt>Date extraite</dt><dd>{analysis.invoice.invoiceDate ?? 'Non détectée'}</dd></div>
            </dl>
            <pre style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#F8FAFC', padding: 10, borderRadius: 6 }}>
              {analysis.extractedText}
            </pre>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <strong>Suggestions de comptes — à vérifier</strong>
            {analysis.suggestions.length === 0
              ? <p>Aucune suggestion suffisamment étayée. Vérifiez le document et le plan comptable.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead><tr>
                  <th style={{ padding: 6, borderBottom: '1px solid #CBD5E1' }}>Ligne source</th>
                  <th style={{ padding: 6, borderBottom: '1px solid #CBD5E1' }}>Compte proposé</th>
                  <th style={{ padding: 6, borderBottom: '1px solid #CBD5E1' }}>Confiance indicative</th>
                  <th style={{ padding: 6, borderBottom: '1px solid #CBD5E1' }}>Explication / éléments vérifiables</th>
                </tr></thead>
                <tbody>{analysis.suggestions.map((suggestion, index) => (
                  <tr key={`${suggestion.accountCode ?? 'none'}-${index}`}>
                    <td style={{ padding: 6, borderBottom: '1px solid #E2E8F0' }}>
                      <strong>{suggestion.description}</strong>
                      <div>{suggestion.explanation.sourceQuote}</div>
                    </td>
                    <td style={{ padding: 6, borderBottom: '1px solid #E2E8F0' }}>
                      {suggestion.accountCode
                        ? `${suggestion.accountCode} — ${suggestion.accountDescription ?? ''}`
                        : 'Aucun compte retenu'}
                    </td>
                    <td style={{ padding: 6, borderBottom: '1px solid #E2E8F0' }}>{suggestion.confidence}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #E2E8F0' }}>
                      <div>{suggestion.explanation.modelRationale}</div>
                      {suggestion.explanation.matchedTerms.length > 0
                        && <small>Termes communs au libellé et au compte : {suggestion.explanation.matchedTerms.join(', ')}</small>}
                      <div>
                        Score lexical déterministe : {suggestion.explanation.score.matchedTermCount}/{suggestion.explanation.score.citedTermCount} termes cités communs (pas une probabilité).
                      </div>
                      <ul>{suggestion.explanation.ruleChecks.map((check, ruleIndex) => (
                        <li key={`${ruleIndex}-${check.rule}`}>
                          {check.passed ? 'Vérifié' : 'Non satisfait'} — {check.rule}
                        </li>
                      ))}</ul>
                    </td>
                  </tr>
                ))}</tbody>
              </table>}
          </div>
          <p style={{ margin: 0, color: '#64748B', fontSize: 12 }}>{analysis.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
