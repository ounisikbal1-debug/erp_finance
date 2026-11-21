export type BankStatementImportRow = {
  date: string;
  description: string;
  amount: string;
  reference: string;
  balance: string;
};

export type ParsedBankStatement = {
  rows: BankStatementImportRow[];
  currencyCode: string | null;
};

export function isBankStatementCurrencyCompatible(fileCurrency: string | null, accountCurrency: string): boolean {
  return fileCurrency === null || fileCurrency === accountCurrency;
}

function validDate(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error('Date bancaire invalide dans le relevé.');
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Date bancaire invalide dans le relevé.');
  }
  return date;
}

function parseAmount(value: string): string {
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(normalized) || !Number.isFinite(Number(normalized)) || Number(normalized) === 0) {
    throw new Error('Montant invalide dans le relevé bancaire.');
  }
  return normalized;
}

function extractOfxTag(source: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(source);
  return match?.[1].trim() ?? '';
}

function parseOfx(source: string): ParsedBankStatement {
  const chunks = source.split(/<STMTTRN>/i).slice(1);
  if (chunks.length === 0) throw new Error('Aucune opération STMTTRN trouvée dans le fichier OFX.');
  if (chunks.length > 5000) throw new Error('Limite d’import : 5 000 opérations par relevé.');
  const rows = chunks.map((chunk): BankStatementImportRow => {
    const dateText = extractOfxTag(chunk, 'DTPOSTED').slice(0, 8);
    const description = [extractOfxTag(chunk, 'NAME'), extractOfxTag(chunk, 'MEMO')]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 300);
    const reference = extractOfxTag(chunk, 'FITID');
    return {
      date: validDate(dateText),
      description: description || extractOfxTag(chunk, 'TRNTYPE') || 'Opération bancaire',
      amount: parseAmount(extractOfxTag(chunk, 'TRNAMT')),
      reference: reference.slice(0, 120),
      balance: '',
    };
  });
  const rawCurrency = extractOfxTag(source, 'CURDEF').toUpperCase();
  return { rows, currencyCode: /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null };
}

function mt940Year(value: string): string {
  const year = Number(value.slice(0, 2));
  return `${year >= 70 ? '19' : '20'}${value.slice(0, 2)}`;
}

function parseMt940Date(value: string): string {
  if (!/^\d{6}$/.test(value)) throw new Error('Date MT940 invalide dans le relevé.');
  return validDate(`${mt940Year(value)}${value.slice(2)}`);
}

function parseMt940(source: string): ParsedBankStatement {
  const rows: BankStatementImportRow[] = [];
  const currencyMatch = /:6[02][FM]:[CD](\d{6})([A-Z]{3})/i.exec(source);
  const currencyCode = currencyMatch?.[2].toUpperCase() ?? null;
  let current: BankStatementImportRow | null = null;
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith(':61:')) {
      const match = /^:61:(\d{6})(?:\d{4})?([RC]?[CD])[A-Z]?(\d[\d,\.]*)(?:N([^/]+))?(?:\/\/([^\s]+))?/i.exec(line);
      if (!match) throw new Error('Opération MT940 invalide; format :61: non reconnu.');
      const mark = match[2].toUpperCase();
      const magnitude = Number(parseAmount(match[3]));
      const reversed = mark.startsWith('R');
      const debit = mark.endsWith('D');
      const signedAmount = (debit ? -magnitude : magnitude) * (reversed ? -1 : 1);
      current = {
        date: parseMt940Date(match[1]),
        description: '',
        amount: signedAmount.toFixed(3).replace(/\.?0+$/, ''),
        reference: (match[5] || match[4] || '').slice(0, 120),
        balance: '',
      };
      rows.push(current);
      if (rows.length > 5000) throw new Error('Limite d’import : 5 000 opérations par relevé.');
    } else if (line.startsWith(':86:') && current) {
      current.description = line.slice(4).trim().slice(0, 300);
    } else if (current && line && !line.startsWith(':')) {
      current.description = `${current.description} ${line.trim()}`.trim().slice(0, 300);
    }
  }
  if (rows.length === 0) throw new Error('Aucune opération :61: trouvée dans le fichier MT940.');
  for (const row of rows) {
    if (!row.description) row.description = row.reference || 'Opération bancaire';
  }
  return { rows, currencyCode };
}

export function parseBankStatementFileText(fileName: string, source: string): ParsedBankStatement {
  if (new TextEncoder().encode(source).byteLength > 5 * 1024 * 1024) {
    throw new Error('Le fichier de relevé dépasse la limite de 5 Mo.');
  }
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'ofx' || extension === 'qfx') return parseOfx(source);
  if (extension === 'mt940' || extension === 'sta') return parseMt940(source);
  throw new Error('Format bancaire non pris en charge.');
}
