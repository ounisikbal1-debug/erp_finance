import React, { useState } from 'react';
import { readImportFile } from './exportUtils';
import { collectImportRowIssues, type ImportRowIssue } from './import-preview-validation';

export interface ImportRowResult {
  created: number;
  failures: string[];
}

interface ImportPreviewPanelProps {
  title: string;
  description: string;
  headers: string[];
  validateRow: (
    row: Record<string, unknown>,
    rowIndex: number,
    allRows: Array<Record<string, unknown>>,
  ) => string | null;
  onImport: (rows: Array<Record<string, unknown>>) => Promise<ImportRowResult>;
  onBusyChange?: (busy: boolean) => void;
}

function downloadTemplate(headers: string[], title: string) {
  const csv = `\uFEFF${headers.map((header) => `"${header}"`).join(';')}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9_-]/gi, '_')}_modele.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function ImportPreviewPanel({
  title,
  description,
  headers,
  validateRow,
  onImport,
  onBusyChange,
}: ImportPreviewPanelProps) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rowIssues, setRowIssues] = useState<ImportRowIssue[]>([]);
  const [importFailures, setImportFailures] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const selectFile = async (file?: File) => {
    setRows([]);
    setFileName('');
    setError('');
    setNotice('');
    setRowIssues([]);
    setImportFailures([]);
    if (!file) return;
    setLoading(true);
    onBusyChange?.(true);
    try {
      const parsed = await readImportFile(file);
      if (parsed.length > 500) throw new Error('Limite d’import : 500 lignes par fichier.');
      if (parsed.length === 0) throw new Error('Le fichier ne contient aucune ligne de données à importer.');
      if (parsed.some((row) => Object.keys(row).some((header) => !headers.includes(header)))) {
        throw new Error(`Colonnes non reconnues. En-têtes attendus : ${headers.join(', ')}.`);
      }
      if (headers.some((header) => !(header in parsed[0]))) {
        throw new Error(`Colonnes requises manquantes. En-têtes attendus : ${headers.join(', ')}.`);
      }
      const issues = collectImportRowIssues(parsed, validateRow);
      setRows(parsed);
      setFileName(file.name);
      setRowIssues(issues);
      setNotice(issues.length
        ? `${parsed.length} ligne(s) analysée(s) ; ${issues.length} ligne(s) à corriger avant import.`
        : `${parsed.length} ligne(s) analysée(s), prêtes à être importées après confirmation.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de lire ce fichier.');
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  const confirmImport = async () => {
    if (!rows.length || rowIssues.length || loading) return;
    setLoading(true);
    onBusyChange?.(true);
    setError('');
    setNotice('');
    try {
      const result = await onImport(rows);
      setNotice(`${result.created} ligne(s) importée(s).${result.failures.length ? ` ${result.failures.length} échec(s) ; consultez le rapport détaillé.` : ''}`);
      setImportFailures(result.failures);
      setRows([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'L’import a échoué.');
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  const issueByRow = new Map(rowIssues.map((issue) => [issue.rowIndex, issue]));

  return (
    <section style={{ border: '1px solid #CBD5E1', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <strong>{title}</strong>
          <div style={{ color: '#475569', fontSize: 13 }}>{description}</div>
          <div style={{ color: '#64748B', fontSize: 12 }}>CSV UTF-8 ou Excel .xlsx · premier onglet · maximum 500 lignes.</div>
        </div>
        <button type="button" onClick={() => downloadTemplate(headers, title)}>Télécharger le modèle CSV</button>
      </div>
      <label style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
        Fichier à prévisualiser
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => void selectFile(event.target.files?.[0])} />
      </label>
      {fileName && <span style={{ fontSize: 12, color: '#475569' }}>Fichier : {fileName}</span>}
      {loading && <span role="status">Lecture ou import en cours…</span>}
      {error && <div role="alert" style={{ color: '#991B1B' }}>{error}</div>}
      {notice && <div role="status" style={{ color: '#166534' }}>{notice}</div>}
      {importFailures.length > 0 && (
        <div role="alert" style={{ color: '#991B1B' }}>
          <strong>Rapport des échecs d’import ({importFailures.length})</strong>
          <ul>{importFailures.map((failure, index) => <li key={`${index}-${failure}`}>{failure}</li>)}</ul>
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
              <thead><tr>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #CBD5E1' }}>Ligne</th>
                {headers.map((header) => <th key={header} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #CBD5E1' }}>{header}</th>)}
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #CBD5E1' }}>Validation</th>
              </tr></thead>
              <tbody>{rows.slice(0, 10).map((row, index) => (
                <tr key={index} aria-invalid={Boolean(issueByRow.get(index))}>
                  <td style={{ padding: 6, borderBottom: '1px solid #E2E8F0' }}>{index + 2}</td>
                  {headers.map((header) => <td key={header} style={{ padding: 6, borderBottom: '1px solid #E2E8F0' }}>{String(row[header] ?? '')}</td>)}
                  <td style={{ padding: 6, borderBottom: '1px solid #E2E8F0', color: issueByRow.has(index) ? '#991B1B' : '#166534' }}>
                    {issueByRow.get(index)?.message ?? 'Valide'}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {rows.length > 10 && <small>Aperçu des 10 premières lignes sur {rows.length}.</small>}
          {rowIssues.length > 0 && (
            <div role="alert" style={{ color: '#991B1B' }}>
              <strong>Rapport de validation ({rowIssues.length} erreur(s))</strong>
              <ul>{rowIssues.map((issue) => (
                <li key={issue.rowIndex}>
                  Ligne {issue.lineNumber} : {issue.message.replace(/^Ligne \d+\s*:\s*/, '')}
                </li>
              ))}</ul>
            </div>
          )}
          <button type="button" disabled={loading || rowIssues.length > 0} onClick={() => void confirmImport()}>
            Confirmer l’import de {rows.length} ligne(s)
          </button>
        </>
      )}
    </section>
  );
}
