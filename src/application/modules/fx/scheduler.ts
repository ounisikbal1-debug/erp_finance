import FxRatesService from './service';

const DAILY_IMPORT_HOUR_UTC = 6;

export function millisecondsUntilNextFxImport(now: Date): number {
  const nextRun = new Date(now);
  nextRun.setUTCHours(DAILY_IMPORT_HOUR_UTC, 0, 0, 0);
  if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  return nextRun.getTime() - now.getTime();
}

export function startDailyBctRateImport(): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        const result = await FxRatesService.importBctInterbankRates();
        console.info(`Taux BCT importés: ${result.count} devises, cours du ${result.effectiveDate}.`);
      } catch (error) {
        console.error('Échec de l’import quotidien des taux BCT:', error);
      } finally {
        schedule();
      }
    }, millisecondsUntilNextFxImport(new Date()));
    timer.unref?.();
  };

  void FxRatesService.importBctInterbankRates()
    .then((result) => console.info(`Taux BCT importés: ${result.count} devises, cours du ${result.effectiveDate}.`))
    .catch((error: unknown) => console.error('Échec de l’import initial des taux BCT:', error));
  schedule();
  return () => clearTimeout(timer);
}
