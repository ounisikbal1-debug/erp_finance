export class WorkbookFeatureConfigurationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'WorkbookFeatureConfigurationError';
  }
}
