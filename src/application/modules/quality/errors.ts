export class QualityRequestError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 409) {
    super(message);
    this.name = 'QualityRequestError';
  }
}

export function getQualityErrorResponse(error: unknown): {
  status: number;
  message: string;
  unexpected: boolean;
} {
  if (error instanceof QualityRequestError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  return {
    status: 500,
    message: 'Impossible de traiter la demande Qualité.',
    unexpected: true,
  };
}
