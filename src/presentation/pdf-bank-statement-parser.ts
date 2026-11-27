import * as pdfjsLib from 'pdfjs-dist';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    /* @ts-expect-error import.meta requires ESM module option */
    import.meta.url,
  ).toString();
} catch {
  // Falls back to default worker resolution in non-ESM environments
}

export interface ParsedPdfBankStatement {
  currencyCode: string | null;
  rows: Array<Record<string, unknown>>;
}

function parseLocalizedAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/TND|DT|EUR|USD/gi, '')
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, '')
    .replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function normalizePdfDate(raw: string): string {
  const isoMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  const dmyShort = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{2})$/);
  if (dmyShort) {
    const yy = Number(dmyShort[3]);
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${yyyy}-${dmyShort[2]}-${dmyShort[1]}`;
  }
  return raw;
}

export async function parsePdfBankStatement(file: File): Promise<ParsedPdfBankStatement> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Limite d’import PDF : 10 Mo par relevé.');
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const allLines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const linesByY = new Map<number, Array<{ x: number; text: string }>>();

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
      const y = Math.round(Number(transform[5] ?? 0) / 3) * 3;
      const x = Number(transform[4] ?? 0);
      const bucket = linesByY.get(y) ?? [];
      bucket.push({ x, text: item.str });
      linesByY.set(y, bucket);
    }

    const sortedYs = Array.from(linesByY.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = linesByY.get(y) ?? [];
      items.sort((a, b) => a.x - b.x);
      const lineText = items.map((entry) => entry.text).join(' ').replace(/\s+/g, ' ').trim();
      if (lineText) allLines.push(lineText);
    }
  }

  const fullText = allLines.join('\n');
  let currencyCode: string | null = null;
  const currencyMatch = fullText.match(/\b(TND|EUR|USD)\b/);
  if (currencyMatch) currencyCode = currencyMatch[1];

  const rows: Array<Record<string, unknown>> = [];
  const dateRegex = /^(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2})\s+(.+)$/;
  const amountTokenRegex = /([+-]?\d[\d\s.]*[.,]\d{2,3}|\b[+-]?\d{1,3}(?:\s\d{3})+[.,]?\d*)/g;

  for (const line of allLines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;
    const rawDate = dateMatch[1];
    const rest = dateMatch[2].trim();

    const amountMatches = Array.from(rest.matchAll(amountTokenRegex));
    if (!amountMatches.length) continue;

    // On prend l'avant-dernier montant si un solde est présent en fin de ligne, sinon le dernier
    const parsedAmounts = amountMatches
      .map((m) => ({
        raw: m[0],
        index: m.index ?? 0,
        value: parseLocalizedAmount(m[0]),
      }))
      .filter((m): m is { raw: string; index: number; value: number } => m.value !== null);

    if (!parsedAmounts.length) continue;

    let amount = parsedAmounts[parsedAmounts.length - 1].value;
    let balance: number | undefined;
    let descEndIndex = parsedAmounts[parsedAmounts.length - 1].index;

    if (parsedAmounts.length >= 2) {
      amount = parsedAmounts[parsedAmounts.length - 2].value;
      balance = parsedAmounts[parsedAmounts.length - 1].value;
      descEndIndex = parsedAmounts[parsedAmounts.length - 2].index;
    }

    const description = rest.slice(0, descEndIndex).trim() || 'Opération relevé PDF';
    const isDebit = /\b(DEBIT|DÉBIT|RETRAIT|PRELEVEMENT|PRÉLÈVEMENT|VIREMENT EMIS|FRAIS|COMMISSION|CHEQUE)\b/i.test(description);
    if (isDebit && amount > 0) {
      amount = -amount;
    }

    rows.push({
      date: normalizePdfDate(rawDate),
      description,
      amount,
      ...(balance !== undefined ? { balance } : {}),
    });
  }

  if (rows.length === 0) {
    throw new Error('Aucune opération bancaire structurée n’a pu être extraite de ce PDF. Vérifiez que le PDF contient du texte sélectionnable (date, libellé, montant).');
  }

  return { currencyCode, rows };
}
