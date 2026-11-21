import FxRevaluationService from './revaluation-service';

const DAILY_REVERSAL_HOUR_UTC = 0;
const DAILY_REVERSAL_MINUTE_UTC = 5;

export function millisecondsUntilNextFxReversal(now: Date): number {
  const nextRun = new Date(now);
  nextRun.setUTCHours(DAILY_REVERSAL_HOUR_UTC, DAILY_REVERSAL_MINUTE_UTC, 0, 0);
  if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  return nextRun.getTime() - now.getTime();
}

export function startDailyFxReversalProcessing(): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const process = async () => {
    try {
      const result = await FxRevaluationService.processDueReversals();
      if (result.processed > 0) {
        console.info(`Contrepassations FX automatiques comptabilisées: ${result.processed}.`);
      }
    } catch (error) {
      const errorCode = error !== null && typeof error === 'object' && 'code' in error
        && typeof error.code === 'string'
        && /^P\d{4}$/.test(error.code)
        ? error.code
        : undefined;
      console.error('Échec du traitement des contrepassations FX dues:', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
        ...(errorCode ? { errorCode } : {}),
      });
    }
  };
  const schedule = () => {
    timer = setTimeout(async () => {
      await process();
      schedule();
    }, millisecondsUntilNextFxReversal(new Date()));
    timer.unref?.();
  };

  void process();
  schedule();
  return () => clearTimeout(timer);
}
