export type AiDataClass = 'ACCOUNTING_ENTRIES' | 'INVOICES' | 'PAYROLL' | 'CUSTOMER_PERSONAL' | 'AGGREGATED_REPORTS';
export type AiTaskType = 'OCR' | 'CLASSIFICATION' | 'REASONING' | 'NATURAL_LANGUAGE';
export type AiRoutePreference = 'AUTO' | 'LOCAL' | 'CLOUD';

export interface AiRoutingInput {
  dataClass: AiDataClass;
  taskType: AiTaskType;
  preference: AiRoutePreference;
  internetAvailable: boolean;
  freeRamGiB: number | null;
  localProviderReady: boolean;
  localProviderHealthy: boolean;
  cloudProviderId: string | null;
  cloudConsentForAggregates: boolean;
  cloudQuotaAvailable: boolean;
}

export type AiRoutingDecision =
  | { route: 'LOCAL'; reason: 'LOCAL_PREFERRED' | 'SENSITIVE_DATA' | 'OFFLINE' | 'CLOUD_UNAVAILABLE' | 'CLOUD_QUOTA_EXHAUSTED' }
  | { route: 'CLOUD'; reason: 'AGGREGATE_CLOUD_OPT_IN' | 'LOCAL_UNAVAILABLE' | 'LOW_MEMORY' | 'LOCAL_FAILURE_FALLBACK' }
  | { route: 'BLOCKED'; reason: 'LOCAL_REQUIRED_BUT_UNAVAILABLE' | 'CLOUD_CONSENT_REQUIRED' | 'CLOUD_PROVIDER_REQUIRED' | 'NO_AVAILABLE_PROVIDER' };

function localDecision(input: AiRoutingInput, reason: Extract<AiRoutingDecision, { route: 'LOCAL' }>['reason']): AiRoutingDecision {
  return input.localProviderReady && input.localProviderHealthy
    ? { route: 'LOCAL', reason }
    : { route: 'BLOCKED', reason: 'NO_AVAILABLE_PROVIDER' };
}

export function decideAiRoute(input: AiRoutingInput): AiRoutingDecision {
  if (input.dataClass !== 'AGGREGATED_REPORTS') {
    return input.localProviderReady && input.localProviderHealthy
      ? { route: 'LOCAL', reason: 'SENSITIVE_DATA' }
      : { route: 'BLOCKED', reason: 'LOCAL_REQUIRED_BUT_UNAVAILABLE' };
  }

  if (input.preference === 'LOCAL') return localDecision(input, 'LOCAL_PREFERRED');
  if (!input.internetAvailable) return localDecision(input, 'OFFLINE');
  if (input.taskType !== 'REASONING' && input.taskType !== 'NATURAL_LANGUAGE') {
    return localDecision(input, 'LOCAL_PREFERRED');
  }

  const cloudConfigured = typeof input.cloudProviderId === 'string' && input.cloudProviderId.trim().length > 0;
  const cloudConsented = input.cloudConsentForAggregates;
  if (input.preference === 'CLOUD' && !cloudConsented) {
    return input.localProviderReady && input.localProviderHealthy
      ? { route: 'LOCAL', reason: 'LOCAL_PREFERRED' }
      : { route: 'BLOCKED', reason: 'CLOUD_CONSENT_REQUIRED' };
  }
  if (input.preference === 'CLOUD' && !cloudConfigured) {
    return input.localProviderReady && input.localProviderHealthy
      ? { route: 'LOCAL', reason: 'LOCAL_PREFERRED' }
      : { route: 'BLOCKED', reason: 'CLOUD_PROVIDER_REQUIRED' };
  }

  if (!cloudConsented || !cloudConfigured) {
    return localDecision(input, 'CLOUD_UNAVAILABLE');
  }
  if (!input.cloudQuotaAvailable) {
    return localDecision(input, 'CLOUD_QUOTA_EXHAUSTED');
  }
  if (!input.localProviderReady || !input.localProviderHealthy) {
    return { route: 'CLOUD', reason: 'LOCAL_FAILURE_FALLBACK' };
  }
  if (input.freeRamGiB !== null && input.freeRamGiB < 2.5) {
    return { route: 'CLOUD', reason: 'LOW_MEMORY' };
  }
  if (input.preference === 'CLOUD'
    || input.taskType === 'REASONING'
    || input.taskType === 'NATURAL_LANGUAGE') {
    return { route: 'CLOUD', reason: 'AGGREGATE_CLOUD_OPT_IN' };
  }
  return { route: 'LOCAL', reason: 'LOCAL_PREFERRED' };
}
