import { HrRequestError } from './errors';

export type CandidateInterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export function validateInterviewSchedule(value: unknown): Date {
  const timestamp = typeof value === 'string' ? value : null;
  const match = timestamp?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!timestamp || !match) {
    throw new HrRequestError('La date et l’heure d’entretien doivent inclure un fuseau horaire.', 400);
  }
  const [, year, month, day, hour, minute, second = '0'] = match;
  const calendarDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    Number.isNaN(calendarDate.getTime())
    || calendarDate.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59
  ) {
    throw new HrRequestError('La date et l’heure d’entretien sont invalides.', 400);
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new HrRequestError('La date et l’heure d’entretien sont invalides.', 400);
  }
  return date;
}

export function validateInterviewStatus(value: unknown): CandidateInterviewStatus {
  if (value !== 'SCHEDULED' && value !== 'COMPLETED' && value !== 'CANCELLED') {
    throw new HrRequestError('Le statut d’entretien est invalide.', 400);
  }
  return value;
}
