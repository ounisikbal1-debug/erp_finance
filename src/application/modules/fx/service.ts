import prisma from '../../../data/prisma/client';
import { validateCurrencyCode } from './conversion';
import {
  BCT_INTERBANK_RATES_URL,
  BCT_INTERBANK_SOURCE_NAME,
  parseBctInterbankRates,
} from './bct-interbank';
import { FxConversionError } from './conversion';

function parseCalendarDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FxConversionError('La date du taux doit respecter le format AAAA-MM-JJ.', 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new FxConversionError('La date du taux est invalide.', 400);
  }
  return date;
}

export class FxRatesService {
  static async importBctInterbankRates(
    fetcher: typeof fetch = fetch,
    importedAt = new Date(),
  ) {
    const response = await fetcher(BCT_INTERBANK_RATES_URL, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`La BCT a répondu HTTP ${response.status} lors de l’import des taux.`);
    }

    const parsed = parseBctInterbankRates(await response.text());
    const effectiveDate = new Date(`${parsed.effectiveDate}T00:00:00.000Z`);
    await prisma.$transaction(parsed.rates.map((rate) => prisma.exchangeRate.upsert({
      where: {
        sourceName_baseCurrency_quoteCurrency_rateType_effectiveDate: {
          sourceName: BCT_INTERBANK_SOURCE_NAME,
          baseCurrency: rate.baseCurrency,
          quoteCurrency: rate.quoteCurrency,
          rateType: 'INTERBANK',
          effectiveDate,
        },
      },
      create: {
        ...rate,
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        sourceUrl: BCT_INTERBANK_RATES_URL,
        rateType: 'INTERBANK',
        effectiveDate,
        importedAt,
      },
      update: {
        ...rate,
        sourceUrl: BCT_INTERBANK_RATES_URL,
        importedAt,
      },
    })));
    return {
      effectiveDate: parsed.effectiveDate,
      importedAt: importedAt.toISOString(),
      sourceName: BCT_INTERBANK_SOURCE_NAME,
      sourceUrl: BCT_INTERBANK_RATES_URL,
      count: parsed.rates.length,
    };
  }

  static async getRateSuggestion(entityId: string, requestedCurrency: unknown, requestedDate: unknown) {
    const documentCurrencyCode = validateCurrencyCode(requestedCurrency, 'devise de facture');
    const effectiveDate = parseCalendarDate(requestedDate);
    const effectiveDateEnd = new Date(effectiveDate.getTime() + 24 * 60 * 60 * 1000);
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { country: { select: { currencyCode: true } } },
    });
    if (!entity) throw new FxConversionError('Société introuvable.', 404);
    const functionalCurrencyCode = validateCurrencyCode(entity.country.currencyCode, 'devise fonctionnelle');
    if (documentCurrencyCode === functionalCurrencyCode) {
      return {
        available: true,
        documentCurrencyCode,
        functionalCurrencyCode,
        exchangeRate: 1,
        exchangeRateDate: effectiveDate.toISOString().slice(0, 10),
        exchangeRateSource: 'Même devise fonctionnelle; aucune conversion.',
        exchangeRateImportedAt: null,
      };
    }

    const baseCurrencies = [...new Set(
      [documentCurrencyCode, functionalCurrencyCode].filter((currency) => currency !== 'TND'),
    )];
    const rates = await prisma.exchangeRate.findMany({
      where: {
        sourceName: BCT_INTERBANK_SOURCE_NAME,
        rateType: 'INTERBANK',
        quoteCurrency: 'TND',
        baseCurrency: { in: baseCurrencies },
        effectiveDate: { gte: effectiveDate, lt: effectiveDateEnd },
      },
      select: {
        baseCurrency: true,
        rate: true,
        sourceUnit: true,
        sourceValue: true,
        sourceName: true,
        sourceUrl: true,
        effectiveDate: true,
        importedAt: true,
      },
    });
    const ratesByCurrency = new Map(rates.map((rate) => [rate.baseCurrency, rate]));
    const documentRate = documentCurrencyCode === 'TND' ? null : ratesByCurrency.get(documentCurrencyCode);
    const functionalRate = functionalCurrencyCode === 'TND' ? null : ratesByCurrency.get(functionalCurrencyCode);
    if ((documentCurrencyCode !== 'TND' && !documentRate)
      || (functionalCurrencyCode !== 'TND' && !functionalRate)) {
      return {
        available: false,
        documentCurrencyCode,
        functionalCurrencyCode,
        exchangeRate: null,
        exchangeRateDate: null,
        exchangeRateSource: null,
        exchangeRateImportedAt: null,
        message: 'Aucun cours BCT interbancaire n’est importé pour cette date et les devises demandées; saisissez un taux vérifié avec sa date et sa source.',
      };
    }

    const documentTndRate = documentCurrencyCode === 'TND' ? 1 : documentRate!.rate;
    const functionalTndRate = functionalCurrencyCode === 'TND' ? 1 : functionalRate!.rate;
    const exchangeRate = documentTndRate / functionalTndRate;
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      throw new FxConversionError('Les taux BCT ne permettent pas une conversion sûre.', 422);
    }
    const usedRates = [documentRate, functionalRate].filter((rate) => rate !== null);
    const importedAt = usedRates.reduce(
      (latest, rate) => Math.max(latest, rate!.importedAt.getTime()),
      0,
    );
    const sourcePairs = usedRates.map((rate) => (
      `${rate!.baseCurrency}/TND (${rate!.rate} TND par unité)`
    ));
    return {
      available: true,
      documentCurrencyCode,
      functionalCurrencyCode,
      exchangeRate,
      exchangeRateDate: effectiveDate.toISOString().slice(0, 10),
      exchangeRateSource: `${BCT_INTERBANK_SOURCE_NAME}; ${sourcePairs.join(' et ')}; ${BCT_INTERBANK_RATES_URL}`,
      exchangeRateImportedAt: importedAt ? new Date(importedAt).toISOString() : null,
    };
  }
}

export default FxRatesService;
