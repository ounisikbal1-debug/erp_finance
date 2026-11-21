export type AnomalySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface DetectedAnomaly {
  id: string;
  severity: AnomalySeverity;
  category: 'ACCOUNTING' | 'SALES' | 'PAYROLL';
  reference: string;
  reason: string;
  date: string | null;
}

export interface AnomalyReport {
  generatedAt: string;
  entityId: string;
  periodFrom: string;
  periodTo: string;
  result: 'anomalies_found' | 'no_detected_anomalies';
  checkedAreas: string[];
  unavailableChecks: string[];
  anomalies: DetectedAnomaly[];
}
